import uuid
import logging
import httpx
from datetime import datetime
from typing import Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.core.config import settings
from app.models.product_document import ProductDocumentCache
from app.models.product_attachment import AttachmentAccessGrant, BatchProductDocLink
from app.services.odoo_client import OdooClient
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)

async def validate_access(
    doc_key: uuid.UUID, 
    session: AsyncSession,
    user_id: uuid.UUID
) -> ProductDocumentCache:
    """
    Validate document existence and access rights.
    Strict Check:
    1. Document exists.
    2. EITHER linked to a Batch (Persistent Access).
    3. OR has valid Grant for THIS user (Temporary Access).
    Returns document if valid, else raises HTTPException.
    """
    # 1. Lookup Document
    doc = await session.get(ProductDocumentCache, doc_key)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    # 2. Check Access (Grant OR Batch Link)
    now = datetime.utcnow()
    
    # Check Persistence (Batch) - Assuming batches allow access to logged users
    stmt_link = select(BatchProductDocLink).where(
        BatchProductDocLink.product_document_id == doc.id
    )
    link = (await session.exec(stmt_link)).first()
    
    if link:
        return doc # Access Granted via Batch
    
    # Check Temporary Grant for specific user
    stmt_grant = select(AttachmentAccessGrant).where(
        AttachmentAccessGrant.product_document_id == doc.id,
        AttachmentAccessGrant.user_id == user_id,
        AttachmentAccessGrant.expires_at > now
    )
    grant = (await session.exec(stmt_grant)).first()
    
    if grant:
        return doc # Access Granted via Temp Link
        
    # No access
    logger.warning(f"Access denied for doc {doc_key} (User {user_id})")
    raise HTTPException(status_code=403, detail="Acesso expirado ou inválido")

def safe_filename(name: str) -> str:
    name = (name or "").strip()
    if not name: return "document"
    # Prevent header injection and invalid chars
    for ch in ['\r', '\n', '"', '\\', '/', ':', '*', '?', '<', '>', '|']:
        name = name.replace(ch, "_")
    return name[:150]

def filtered_headers(upstream_headers: httpx.Headers) -> Dict[str, str]:
    """whitelist safe headers to pass through"""
    allowed = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"]
    return {k: v for k, v in upstream_headers.items() if k.lower() in allowed}

async def chain_stream(first_chunk: bytes, iterator):
    """Re-inject peeked bytes and continue streaming"""
    if first_chunk:
        yield first_chunk
    async for chunk in iterator:
        yield chunk

async def stream_from_odoo(
    doc: ProductDocumentCache, 
    disposition: str, 
    request: Request
):
    """
    Robust Proxy for Odoo Documents.
    Features:
    - Retry Logic (Auth/Redirects)
    - Stream Peeking (Validation)
    - Range Support (Pass-through)
    - Safe Header Filtering
    """
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )

    # Logic to guarantee filename exists
    doc_id_fallback = str(getattr(doc, "id", "unknown"))
    base_name = safe_filename(doc.name or getattr(doc, "datas_fname", None) or f"document_{doc_id_fallback}")
    
    # Enforce .pdf extension
    is_pdf_expected = (doc.mimetype == "application/pdf") or getattr(doc, "datas_fname", "").lower().endswith(".pdf")
    if is_pdf_expected and not base_name.lower().endswith(".pdf"):
        base_name += ".pdf"
        
    filename = base_name

    MAX_RETRIES = 2
    request_id = uuid.uuid4().hex[:8]

    for attempt in range(MAX_RETRIES + 1):
        # 1. Prepare Headers (Range)
        req_headers = {}
        range_header = request.headers.get("Range")
        if range_header:
            req_headers["Range"] = range_header
            
        try:
            # Note: We must manage the stream context carefully. 
            # We return StreamingResponse which takes ownership of the iterator.
            # But the client context manager (async with) closes connection on exit.
            # So we cannot use `async with` block for the return.
            # We need to manually enter the context and ensure it closes after streaming.
            # Httpx stream context manager returns a Response.
            
            # Since OdooClient.get_attachment_stream_context uses `async with`, it handles close on exit.
            # If we yield from it, we are good. But we need to peek.
            # Solution: We do the logic verifying inside the context, and if good, we return a StreamingResponse 
            # that iterates over the response content. 
            # WAIT: If we exit `async with`, the stream closes.
            # We need `client.stream_client.stream()` directly or modify OdooClient to return request/response pair?
            # OdooClient.get_attachment_stream_context returns `self.stream_client.stream(...)`.
            
            # Let's look at OdooClient again.
            # return self.stream_client.stream("GET", url)
            # This returns a context manager.
            # Usage: async with ... as resp:
            
            ctx = await client.get_attachment_stream_context(doc.ir_attachment_id, extra_headers=req_headers)
            resp = await ctx.__aenter__()
            
            # We must ensure ctx.__aexit__ is called eventually.
            # StreamingResponse background task can do this? 
            # Or we wrap the generator.
            
            # 2. Check Status (Dead Session / Redirect)
            # follow_redirects=False means 30x are returned as status
            if resp.status_code in (401, 403, 301, 302):
                await ctx.__aexit__(None, None, None) # Close stream
                if attempt < MAX_RETRIES:
                    logger.warning(f"[{request_id}] Odoo Proxy Auth/Redirect (Status {resp.status_code}). Re-authenticating...")
                    await client._jsonrpc_authenticate()
                    continue
                else:
                    return JSONResponse(status_code=502, content={
                        "error": "odoo_auth_error",
                        "request_id": request_id, 
                        "upstream_status": resp.status_code,
                        "hint": "Falha de autenticação/redirect no Odoo persistente."
                    })

            # 3. Check Content-Type (HTML masquerade)
            ct = resp.headers.get("Content-Type", "").lower()
            if "text/html" in ct or "application/json" in ct:
                await ctx.__aexit__(None, None, None) # Close stream
                if attempt < MAX_RETRIES:
                    logger.warning(f"[{request_id}] Odoo Proxy returned {ct}. Re-authenticating...")
                    await client._jsonrpc_authenticate()
                    continue
                else:
                    return JSONResponse(status_code=502, content={
                        "error": "upstream_invalid_content",
                        "request_id": request_id,
                        "upstream_content_type": ct,
                        "hint": "Odoo retornou HTML/JSON ao invés de Arquivo."
                    })

            # 4. Peek Bytes (Safety Check)
            # Validate only if NO Range or Range starts at 0
            should_validate_pdf = is_pdf_expected and (not range_header or range_header.strip().startswith("bytes=0-"))
            
            iterator = resp.aiter_bytes()
            first_chunk = b""
            
            try:
                first_chunk = await iterator.__anext__()
            except StopAsyncIteration:
                pass # Empty file
            except Exception as e:
                 await ctx.__aexit__(None, None, None)
                 raise e

            # Validate PDF Signature
            if should_validate_pdf and len(first_chunk) > 0 and not first_chunk.startswith(b"%PDF"):
                 # If HTML body detected
                 if b"<html" in first_chunk.lower():
                     await ctx.__aexit__(None, None, None)
                     if attempt < MAX_RETRIES:
                         await client._jsonrpc_authenticate()
                         continue
                     else:
                        return JSONResponse(status_code=502, content={
                            "error": "upstream_html_body",
                            "request_id": request_id,
                            "hint": "Conteúdo do arquivo parece HTML."
                        })
            
            # 5. Success - Prepared Streaming Response
            
            # Headers preparation
            final_headers = filtered_headers(resp.headers)
            final_headers["Content-Disposition"] = f'{disposition}; filename="{filename}"'
            
            async def stream_wrapper():
                try:
                    async for chunk in chain_stream(first_chunk, iterator):
                        yield chunk
                finally:
                    # Ensure stream is closed
                    await ctx.__aexit__(None, None, None)
                    await client.close()

            return StreamingResponse(
                stream_wrapper(),
                status_code=resp.status_code,
                media_type=doc.mimetype or "application/octet-stream",
                headers=final_headers
            )
            
        except Exception as e:
             logger.error(f"[{request_id}] Stream Proxy Error: {e}")
             try:
                 await client.close()
             except: pass
             
             if attempt < MAX_RETRIES: continue
             return JSONResponse(status_code=502, content={"error": "proxy_exception", "detail": str(e)})

    # Should not reach here
    return JSONResponse(status_code=502, content={"error": "unknown_proxy_error"})

@router.get("/{doc_key}/view")
async def get_document_view(
    doc_key: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.get_current_user)
):
    """Proxy document content inline (Preview)."""
    doc = await validate_access(doc_key, session, current_user.id)
    return await stream_from_odoo(doc, "inline", request)

@router.get("/{doc_key}/download")
async def get_document_download(
    doc_key: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.get_current_user)
):
    """Proxy document content as attachment (Download)."""
    doc = await validate_access(doc_key, session, current_user.id)
    return await stream_from_odoo(doc, "attachment", request)

@router.get("/{doc_key}/print")
async def get_document_print(
    doc_key: uuid.UUID,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Returns HTML wrapper with iframe to trigger print dialog.
    """
    # Validate access first
    doc = await validate_access(doc_key, session, current_user.id)
    
    view_url = f"/api/v1/docs/{doc_key}/view"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Imprimir Documento</title>
        <style>
            body, html {{ margin: 0; padding: 0; height: 100%; overflow: hidden; }}
            iframe {{ width: 100%; height: 100%; border: none; }}
            .fallback {{
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                background: #fff;
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                font-family: sans-serif;
            }}
            .fallback button {{
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }}
            .fallback button:hover {{ background: #0056b3; }}
        </style>
        <script>
            function triggerPrint() {{
                const iframe = document.getElementById('pdf-frame');
                if (iframe.contentWindow) {{
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                }}
            }}
        </script>
    </head>
    <body>
        <div class="fallback">
            <button onclick="triggerPrint()">🖨️ Imprimir Agora</button>
        </div>
        <iframe id="pdf-frame" src="{view_url}" onload="setTimeout(triggerPrint, 1000)"></iframe>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)

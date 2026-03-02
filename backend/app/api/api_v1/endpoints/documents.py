import logging
import base64
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
import io

from app.services.odoo_client import OdooClient
from app.core.config import settings
from app.api import deps

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Utilities ---

def safe_filename(name: str) -> str:
    name = (name or "").strip()
    if not name: return "document"
    # Prevent header injection and invalid chars
    for ch in ['\r', '\n', '"', '\\', '/', ':', '*', '?', '<', '>', '|']:
        name = name.replace(ch, "_")
    return name[:150]

def is_previewable(mimetype: str) -> bool:
    if not mimetype: return False
    previewable = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/gif",
        "text/plain",
        "text/html" # Careful with HTML, but allowed for preview if trusted
    ]
    return any(mimetype.startswith(t) for t in previewable)

# --- Endpoints ---

@router.get("/mos/{odoo_mo_id}/documents")
async def list_mo_documents(
    odoo_mo_id: int,
):
    """
    List documents linked to the product of a specific Manufacturing Order.
    """
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        # 1. Fetch MO to get product_id
        mo_data = await client.search_read(
            'mrp.production',
            domain=[['id', '=', odoo_mo_id]],
            fields=['id', 'product_id']
        )
        if not mo_data:
            raise HTTPException(status_code=404, detail="Ordem de produção não encontrada no Odoo")
        
        product_raw = mo_data[0].get('product_id')
        if not product_raw:
            return {"mo_id": odoo_mo_id, "product_id": None, "documents": []}
            
        product_id = product_raw[0] if isinstance(product_raw, (list, tuple)) else product_raw
        
        # 2. Fetch documents for product
        docs = await client.get_product_documents(product_id)
        
        # 3. Normalize for frontend
        normalized = []
        for d in docs:
            doc_id = f"{d['model']}_{d['odoo_id']}"
            normalized.append({
                "id": doc_id,
                "odoo_document_id": d['odoo_id'],
                "attachment_id": d.get('ir_attachment_id'),
                "name": d['name'],
                "mimetype": d['mimetype'],
                "size": d['size'],
                "checksum": d['checksum'],
                "is_previewable": is_previewable(d['mimetype']),
                "view_url": f"/api/v1/odoo/mos/{odoo_mo_id}/documents/{doc_id}/view",
                "download_url": f"/api/v1/odoo/mos/{odoo_mo_id}/documents/{doc_id}/download"
            })
            
        return {
            "mo_id": odoo_mo_id,
            "product_id": product_id,
            "documents": normalized,
            "total": len(normalized)
        }
    except Exception as e:
        logger.error(f"Error listing documents for MO {odoo_mo_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Erro ao buscar documentos no Odoo: {str(e)}")
    finally:
        await client.close()

@router.get("/mos/{odoo_mo_id}/documents/{doc_id}/view")
async def view_document(odoo_mo_id: int, doc_id: str):
    """Proxy document content for inline viewing."""
    return await proxy_document(doc_id, "inline")

@router.get("/mos/{odoo_mo_id}/documents/{doc_id}/download")
async def download_document(odoo_mo_id: int, doc_id: str):
    """Proxy document content for download."""
    return await proxy_document(doc_id, "attachment")

async def proxy_document(doc_id: str, disposition: str):
    """
    Generic proxy logic for Odoo documents.
    doc_id format: {model}_{id}
    """
    try:
        model, record_id_str = doc_id.split('_', 1)
        record_id = int(record_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de documento inválido")

    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )

    try:
        # 1. Fetch binary data
        doc_data = await client.get_attachment_data(model, record_id)
        if not doc_data or not doc_data.get('content'):
            raise HTTPException(status_code=404, detail="Conteúdo do documento não encontrado")

        content_raw = doc_data['content']
        
        # 2. Check for HTML/Login masking
        # Some Odoo versions return a login page if session is invalid or access denied
        # even if RPC call seemed to succeed (depending on implementation)
        if isinstance(content_raw, str):
            # Check if it starts with <html (case insensitive)
            if content_raw.strip().lower().startswith("<!doctype html") or content_raw.strip().lower().startswith("<html"):
                logger.warning(f"Detected HTML masking for doc {doc_id}")
                raise HTTPException(status_code=502, detail="Odoo retornou uma página de login em vez do arquivo")
            
            # Decode base64
            try:
                binary_content = base64.b64decode(content_raw)
            except Exception:
                # If not base64, maybe it's raw string? Odoo usually sends base64 for binary fields.
                binary_content = content_raw.encode('utf-8')
        else:
            binary_content = content_raw

        # 3. Safety check on binary content for common PDF signature if mimetype says so
        mimetype = doc_data.get('mimetype', 'application/octet-stream')
        if mimetype == "application/pdf" and not binary_content.startswith(b"%PDF"):
             # If it looks like HTML inside binary
             if b"<html" in binary_content[:512].lower():
                 logger.warning(f"Detected HTML body in binary for doc {doc_id}")
                 raise HTTPException(status_code=502, detail="Conteúdo do arquivo parece inválido (HTML detectado)")

        # 4. Serve stream
        filename = safe_filename(doc_data.get('name', 'document'))
        headers = {
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "private, max-age=3600"
        }

        return StreamingResponse(
            io.BytesIO(binary_content),
            media_type=mimetype,
            headers=headers
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying document {doc_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Erro ao processar documento: {str(e)}")
    finally:
        await client.close()

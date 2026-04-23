import logging
import base64
import uuid
import time
import asyncio
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
import io

from app.services.odoo_client import OdooClient
from app.core.config import settings
from app.api import deps

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache em memória para lista de documentos por produto
# Documentos de produto raramente mudam — TTL de 5 minutos é seguro e elimina
# as RPCs repetidas ao Odoo quando o usuário abre docs de MOs do mesmo produto.
# ---------------------------------------------------------------------------
_DOC_CACHE_TTL_SECONDS = 300  # 5 minutos

# Estrutura: { product_id: (timestamp, normalized_docs_list) }
_product_docs_cache: Dict[int, Tuple[float, List[Dict[str, Any]]]] = {}
# Lock por product_id para evitar thundering herd (múltiplos cliques simultâneos)
_product_docs_locks: Dict[int, asyncio.Lock] = {}


def _get_product_lock(product_id: int) -> asyncio.Lock:
    if product_id not in _product_docs_locks:
        _product_docs_locks[product_id] = asyncio.Lock()
    return _product_docs_locks[product_id]


def _cache_get(product_id: int) -> Optional[List[Dict[str, Any]]]:
    entry = _product_docs_cache.get(product_id)
    if entry and (time.monotonic() - entry[0]) < _DOC_CACHE_TTL_SECONDS:
        return entry[1]
    return None


def _cache_set(product_id: int, docs: List[Dict[str, Any]]) -> None:
    _product_docs_cache[product_id] = (time.monotonic(), docs)

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
    Lista documentos vinculados ao produto de uma Ordem de Produção.

    Otimizações aplicadas:
    - Cache em memória por product_id (TTL 5 min) — elimina RPCs repetidas ao Odoo
      quando múltiplas MOs do mesmo produto são consultadas na mesma sessão.
    - Lock por product_id para evitar thundering herd em cliques simultâneos.
    """
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD
    )

    try:
        # 1. Busca MO para obter product_id
        mo_data = await client.search_read(
            'mrp.production',
            domain=[['id', '=', odoo_mo_id]],
            fields=['id', 'product_id']
        )
        if not mo_data:
            raise HTTPException(status_code=404, detail="Ordem de produção não encontrada no Odoo")

        product_raw = mo_data[0].get('product_id')
        if not product_raw:
            return {"mo_id": odoo_mo_id, "product_id": None, "documents": [], "total": 0, "cached": False}

        product_id = product_raw[0] if isinstance(product_raw, (list, tuple)) else product_raw

        # 2. Verifica cache antes de ir ao Odoo
        cached_docs = _cache_get(product_id)
        if cached_docs is not None:
            logger.debug(f"Cache hit para product_id={product_id} (MO {odoo_mo_id})")
            # Reescreve as URLs com o odoo_mo_id correto (URLs são por MO, não por produto)
            normalized = _rewrite_urls(cached_docs, odoo_mo_id)
            return {
                "mo_id": odoo_mo_id,
                "product_id": product_id,
                "documents": normalized,
                "total": len(normalized),
                "cached": True,
            }

        # 3. Sem cache — busca no Odoo com lock para evitar thundering herd
        lock = _get_product_lock(product_id)
        async with lock:
            # Double-check após adquirir o lock (outro request pode ter populado)
            cached_docs = _cache_get(product_id)
            if cached_docs is not None:
                normalized = _rewrite_urls(cached_docs, odoo_mo_id)
                return {
                    "mo_id": odoo_mo_id,
                    "product_id": product_id,
                    "documents": normalized,
                    "total": len(normalized),
                    "cached": True,
                }

            docs = await client.get_product_documents(product_id)

            # Normaliza sem URLs (serão adicionadas dinamicamente)
            # Coleta attachment_ids para buscar share URLs do módulo Documents
            base_docs = []
            att_ids_to_fetch: List[int] = []
            for d in docs:
                doc_id = f"{d['model']}_{d['odoo_id']}"
                raw_att = d.get('ir_attachment_id')
                att_id: Optional[int] = None
                if isinstance(raw_att, (list, tuple)) and len(raw_att) >= 1:
                    att_id = int(raw_att[0])
                elif isinstance(raw_att, int):
                    att_id = raw_att

                if att_id:
                    att_ids_to_fetch.append(att_id)

                base_docs.append({
                    "id": doc_id,
                    "odoo_document_id": d['odoo_id'],
                    "attachment_id": d.get('ir_attachment_id'),
                    "attachment_id_int": att_id,
                    "name": d['name'],
                    "mimetype": d['mimetype'],
                    "size": d['size'],
                    "checksum": d['checksum'],
                    "is_previewable": is_previewable(d['mimetype']),
                    "odoo_share_url": None,  # preenchido abaixo
                })

            # Busca share URLs do módulo Documents (silencioso se não disponível)
            if att_ids_to_fetch:
                share_map = await client.get_document_share_urls(att_ids_to_fetch)
                for doc in base_docs:
                    att_id_int = doc.get("attachment_id_int")
                    if att_id_int and att_id_int in share_map:
                        doc["odoo_share_url"] = share_map[att_id_int]

            _cache_set(product_id, base_docs)

        normalized = _rewrite_urls(base_docs, odoo_mo_id)
        return {
            "mo_id": odoo_mo_id,
            "product_id": product_id,
            "documents": normalized,
            "total": len(normalized),
            "cached": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"Error listing documents for MO {odoo_mo_id} [ref:{request_id}]: {e}")
        raise HTTPException(status_code=502, detail=f"Erro ao buscar documentos no Odoo [ref: {request_id}]")
    finally:
        await client.close()


def _rewrite_urls(base_docs: List[Dict[str, Any]], odoo_mo_id: int) -> List[Dict[str, Any]]:
    """
    Adiciona view_url, download_url e odoo_public_url ao snapshot do cache.

    odoo_public_url: URL pública do módulo Documents do Odoo (access_token).
    Formato: {ODOO_URL}/odoo/documents/{access_token}
    Retorna None se o documento não tiver link de compartilhamento configurado.
    """
    result = []
    for d in base_docs:
        doc_id = d["id"]
        result.append({
            **d,
            "view_url": f"/api/v1/odoo/mos/{odoo_mo_id}/documents/{doc_id}/view",
            "download_url": f"/api/v1/odoo/mos/{odoo_mo_id}/documents/{doc_id}/download",
            "odoo_public_url": d.get("odoo_share_url"),
        })
    return result

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
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD
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
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"Error proxying document {doc_id} [ref:{request_id}]: {e}")
        raise HTTPException(status_code=502, detail=f"Erro ao processar documento [ref: {request_id}]")
    finally:
        await client.close()

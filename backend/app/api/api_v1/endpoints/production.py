"""
Production Portal endpoints.
GET  /production/search  — search Odoo MOs by fabrication number
POST /production/request — create manual ID Visual request (urgent, Lean + Poka-yoke)
POST /production/requests/{id}/nao-consta — registra IDs que nao chegaram ao operador
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlmodel import select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.core.config import settings
from app.models.audit import HistoryLog
from app.models.id_request import IDRequest, IDRequestStatus, IDRequestTask, PackageType
from app.models.manufacturing import ManufacturingOrder
from app.services.odoo_client import OdooClient
from app.services.odoo_utils import normalize_many2one_display
from app.services.status_mappers import map_mrp_state

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Panel Blueprints (Poka-yoke) ─────────────────────────────────
ALL_TASK_CODES = [
    "DOCS_Epson", "WAGO_210_804", "WAGO_210_805",
    "ELESYS_EFZ", "WAGO_2009_110", "WAGO_210_855", "QA_FINAL",
]

PANEL_BLUEPRINTS: Dict[str, List[str]] = {
    "comando":      ["DOCS_Epson", "WAGO_210_804", "WAGO_210_805", "ELESYS_EFZ", "WAGO_2009_110", "WAGO_210_855", "QA_FINAL"],
    "distribuicao": ["DOCS_Epson", "WAGO_210_804", "WAGO_210_805", "ELESYS_EFZ", "QA_FINAL"],
    "apartamento":  ["DOCS_Epson", "ELESYS_EFZ", "WAGO_210_805", "QA_FINAL"],
    "custom":       ALL_TASK_CODES,  # Any code allowed
}

# Human-readable labels for the UI
TASK_LABELS: Dict[str, str] = {
    "DOCS_Epson":     "Diagrama e Layout",
    "WAGO_210_804":   "Carac. Técnica (210-804)",
    "WAGO_210_805":   "Adesivo Componente (210-805)",
    "ELESYS_EFZ":     "Tag Cabo EFZ",
    "WAGO_2009_110":  "Régua Borne (2009-110)",
    "WAGO_210_855":   "Adesivo Porta (210-855)",
    "QA_FINAL":       "QA Final",
}

# Statuses considered "open" for deduplication
OPEN_STATUSES = [
    IDRequestStatus.NOVA,
    IDRequestStatus.TRIAGEM,
    IDRequestStatus.EM_LOTE,
    IDRequestStatus.EM_PROGRESSO,
]


# ── Schemas ───────────────────────────────────────────────────────
class MOSearchResult(BaseModel):
    odoo_mo_id: int
    mo_number: str
    obra: Optional[str] = None
    product_qty: float = 0
    date_start: Optional[str] = None
    state: str
    has_id_activity: bool = False


class ManualRequestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    odoo_mo_id: int
    panel_type: str = Field(..., pattern=r"^(comando|distribuicao|apartamento|custom)$")
    id_types: List[str]
    requester_name: str = Field(..., min_length=2, max_length=100)
    notes: Optional[str] = None


class ManualRequestResponse(BaseModel):
    request_id: str
    mo_number: str
    priority: str
    status: str
    created_at: str
    is_duplicate: bool = False


# ── GET /production/search ────────────────────────────────────────
@router.get("/search", response_model=List[MOSearchResult])
async def search_mos(
    q: str = "",
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Search Odoo MOs by fabrication number. Filters out cancel/done.
    Returns has_id_activity flag per MO.
    """
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD,
    )

    try:
        # Search MOs matching query, exclude cancel/done
        mo_domain = [
            ["name", "ilike", q],
            ["state", "not in", ["cancel", "done"]],
        ]
        mo_fields = ["id", "name", "product_qty", "date_start", "state", "x_studio_nome_da_obra"]

        mos = await client.search_read(
            "mrp.production",
            domain=mo_domain,
            fields=mo_fields,
            order="date_start asc NULLS LAST, name asc",
            limit=10,
        )

        if not mos:
            return []

        # Check which MOs have "Imprimir ID Visual" activity
        mo_ids = [m["id"] for m in mos]
        activity_type_id = await client.get_activity_type_id("Imprimir ID Visual")

        id_activity_map: set = set()
        if activity_type_id:
            act_domain = [
                ["res_model", "=", "mrp.production"],
                ["res_id", "in", mo_ids],
                ["activity_type_id", "=", activity_type_id],
                ["active", "=", True],
            ]
            activities = await client.search_read(
                "mail.activity",
                domain=act_domain,
                fields=["res_id"],
                limit=200,
            )
            id_activity_map = {a["res_id"] for a in activities}

        # ── Step 4: Map Results ──
        final_list = []
        for mo in mos:
            try:
                # Check if this MO already has a pending ID activity (from Step 2)
                mid = mo['id']
                has_act = (mid in id_activity_map)
                
                # Helper: Normalization
                obra_raw = mo.get('x_studio_nome_da_obra')
                obra_clean = normalize_many2one_display(obra_raw) or "Sem Obra"

                final_list.append(MOSearchResult(
                    odoo_mo_id=mid,
                    mo_number=mo['name'],
                    obra=obra_clean,
                    product_qty=mo.get('product_qty', 0.0),
                    date_start=mo.get('date_start'),
                    state=mo.get('state', ''),
                    has_id_activity=has_act
                ))
            except Exception as e:
                logger.error(f"Error processing MO {mo.get('id')}: {e}")
                continue
            
        return final_list

    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"Odoo MO search error [ref:{request_id}]: {e}")
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Odoo [ref: {request_id}]")
    finally:
        await client.close()


# ── POST /production/request ──────────────────────────────────────
@router.post("/request", response_model=ManualRequestResponse)
async def create_manual_request(
    payload: ManualRequestPayload,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Create a manual ID Visual request from the production floor.
    Implements: Poka-yoke validation, deduplication (8h), Odoo snapshot.
    """

    # ── 1. Poka-yoke: validate id_types ──
    if "QA_FINAL" in payload.id_types:
        raise HTTPException(status_code=400, detail="QA_FINAL é automático e não pode ser solicitado manualmente.")

    allowed = PANEL_BLUEPRINTS.get(payload.panel_type)
    if allowed is None:
        raise HTTPException(status_code=400, detail=f"Invalid panel_type: {payload.panel_type}")

    if payload.panel_type != "custom":
        invalid_codes = [c for c in payload.id_types if c not in allowed]
        if invalid_codes:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": f"Tipos de ID não permitidos para '{payload.panel_type}'",
                    "invalid_codes": invalid_codes,
                    "allowed_codes": allowed,
                },
            )
    else:
        # Custom: check against ALL_TASK_CODES
        invalid_codes = [c for c in payload.id_types if c not in ALL_TASK_CODES]
        if invalid_codes:
             raise HTTPException(status_code=400, detail=f"Invalid task codes: {invalid_codes}")

    # Force-add DOCS_Epson and QA_FINAL (backend guarantees)
    final_types = set(payload.id_types)
    final_types.add("DOCS_Epson")
    final_types.add("QA_FINAL")
    final_types = list(final_types)

    # ── 2. Deduplication: check for open manual request in last 8h ──
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=8)

    # Find MO locally to get its ID for the join
    mo_stmt = select(ManufacturingOrder).where(ManufacturingOrder.odoo_id == payload.odoo_mo_id)
    mo_result = await session.exec(mo_stmt)
    existing_mo = mo_result.first()

    if existing_mo:
        # Stringify UUID for SQLite compatibility - use text() to bypass binding issues
        mo_id_str = str(existing_mo.id)
        dedup_stmt = (
            select(IDRequest)
            .where(
                text("mo_id = :mid"),
                IDRequest.source == "manual",
                IDRequest.created_at >= cutoff,
                IDRequest.status.in_([s.value for s in OPEN_STATUSES]),
            )
            .params(mid=mo_id_str)
            .order_by(IDRequest.created_at.desc())
        )
        dedup_result = await session.exec(dedup_stmt)
        duplicate = dedup_result.first()

        if duplicate:
            # Append note with ISO UTC timestamp
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            new_note = f"[{ts}] Novo pedido por {payload.requester_name}"
            if payload.notes:
                new_note += f" — {payload.notes}"

            if duplicate.notes:
                duplicate.notes = f"{duplicate.notes}\n{new_note}"
            else:
                duplicate.notes = new_note

            session.add(duplicate)

            # HistoryLog
            log = HistoryLog(
                entity_type="id_request",
                entity_id=duplicate.id,
                action="MANUAL_REQUEST_DUPLICATE_NOTE_ADDED",
                after_json={"note_added": new_note, "requester": payload.requester_name},
            )
            session.add(log)
            await session.commit()
            await session.refresh(duplicate)

            return ManualRequestResponse(
                request_id=str(duplicate.id),
                mo_number=existing_mo.name,
                priority=duplicate.priority,
                status=duplicate.status if isinstance(duplicate.status, str) else duplicate.status.value,
                created_at=duplicate.created_at.isoformat() + "Z",
                is_duplicate=True,
            )

    # ── 3. Fetch MO from Odoo (source of truth) ──
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD,
    )

    try:
        odoo_mos = await client.search_read(
            "mrp.production",
            domain=[["id", "=", payload.odoo_mo_id]],
            fields=["id", "name", "product_qty", "date_start", "state", "x_studio_nome_da_obra", "company_id"],
            limit=1,
        )
    finally:
        await client.close()

    if not odoo_mos:
        raise HTTPException(status_code=404, detail=f"MO {payload.odoo_mo_id} not found in Odoo")

    odoo_mo = odoo_mos[0]

    # Helper: safely extract Odoo fields (Odoo returns False for empty)
    def safe_str(val: Any) -> Optional[str]:
        if val is None or val is False:
            return None
        return str(val)

    def safe_int(val: Any) -> Optional[int]:
        if val is None or val is False:
            return None
        try:
            return int(val)
        except (ValueError, TypeError):
            return None

    def safe_float(val: Any) -> float:
        try:
            return float(val) if val else 0.0
        except (ValueError, TypeError):
            return 0.0

    def parse_date(val: Any) -> Optional[datetime]:
        if not val or val is False:
            return None
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00")) if isinstance(val, str) else val
        except (ValueError, TypeError):
            return None

    try:
        # ── 4. Upsert ManufacturingOrder locally ──
        if existing_mo:
            mo = existing_mo
            mo.name = safe_str(odoo_mo.get("name")) or mo.name
            mo.x_studio_nome_da_obra = normalize_many2one_display(odoo_mo.get("x_studio_nome_da_obra")) or mo.x_studio_nome_da_obra
            mo.product_qty = safe_float(odoo_mo.get("product_qty"))
            mo.state = safe_str(odoo_mo.get("state")) or mo.state
            mo.last_sync_at = datetime.now(timezone.utc).replace(tzinfo=None)
            mo.date_start = parse_date(odoo_mo.get("date_start"))
        else:
            # 4b. Create Local MO (Snapshot)
            # Use safe fields from Odoo or Payload? 
            # Payload has minimal info. Odoo has full info. 
            # Let's use Odoo data if available, else blank/payload.
            
            # Normalization
            obra_clean = normalize_many2one_display(odoo_mo.get('x_studio_nome_da_obra'))

            mo = ManufacturingOrder(
                odoo_id=odoo_mo['id'],
                name=odoo_mo['name'],
                x_studio_nome_da_obra=obra_clean,
                product_qty=odoo_mo.get('product_qty', 0),
                date_start=parse_date(odoo_mo.get('date_start')),
                state=odoo_mo.get('state', 'unknown'),
                company_id=safe_int(odoo_mo.get('company_id'))
            )
            session.add(mo)
            await session.commit()
            await session.refresh(mo)

        # Integração do Gatilho de Bloqueio (AGUARDANDO_ID_VISUAL)
        from app.services.factory_block_service import FactoryBlockService
        if mo.state.lower() == "aguardando_id_visual":
            await FactoryBlockService.bloquear_of(session, mo.id)
        else:
            await FactoryBlockService.desbloquear_of(session, mo.id)


        # ── 5. Create IDRequest ──
        # Use raw notes as requested
        
        id_request = IDRequest(
            mo_id=mo.id,
            package_code=payload.panel_type if payload.panel_type != "custom" else "personalizado",
            status=IDRequestStatus.NOVA,
            priority="urgente",
            source="manual",
            requester_name=payload.requester_name,
            notes=payload.notes, # Raw message
        )
        session.add(id_request)
        await session.flush()  # Get id_request.id

        # ── 6. Create IDRequestTasks ──
        for code in final_types:
            task = IDRequestTask(
                request_id=id_request.id,
                task_code=code,
                status="nao_iniciado",
            )
            session.add(task)

        # ── 7. HistoryLog ──
        log = HistoryLog(
            entity_type="id_request",
            entity_id=id_request.id,
            action="MANUAL_REQUEST_CREATED",
            after_json={
                "requester": payload.requester_name,
                "panel_type": payload.panel_type,
                "id_types": final_types,
                "odoo_mo_id": payload.odoo_mo_id,
                "mo_name": mo.name,
            },
        )
        session.add(log)
        await session.commit()
        await session.refresh(id_request)

        # Notificar Andon TV sobre nova solicitação manual (dispara WebSocket + polling)
        from app.api.api_v1.endpoints.sync import update_sync_version
        update_sync_version("andon_version")

        return ManualRequestResponse(
            request_id=str(id_request.id),
            mo_number=mo.name,
            priority=id_request.priority,
            status=id_request.status if isinstance(id_request.status, str) else id_request.status.value,
            created_at=id_request.created_at.isoformat() + "Z",
            is_duplicate=False,
        )
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"Manual request creation error [ref:{request_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Request creation error [ref: {request_id}]")


# ── GET /production/blueprints ────────────────────────────────────
@router.get("/blueprints")
async def get_panel_blueprints() -> Any:
    """
    Return panel type blueprints and task labels for the frontend.
    """
    return {
        "panel_types": {
            k: [{"code": c, "label": TASK_LABELS.get(c, c)} for c in v]
            for k, v in PANEL_BLUEPRINTS.items()
        },
        "task_labels": TASK_LABELS,
    }


# ── GET /production/requests ──────────────────────────────────────
class ProductionRequestResponse(BaseModel):
    id: uuid.UUID
    mo_number: str
    package_code: str
    created_at: datetime
    status: str
    production_status: str  # waiting, in_progress, done
    notes: Optional[str] = None
    obra: Optional[str] = None
    product_qty: float = 0
    priority: str = "normal"


@router.get("/requests", response_model=List[ProductionRequestResponse])
async def get_production_requests(
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(deps.get_session),
) -> Any:
    """
    Get manual requests history for the production view.
    Returns Open, In Progress, and Done requests.
    """
    stmt = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
        .where(IDRequest.source == "manual")
        .order_by(IDRequest.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    results = await session.exec(stmt)
    
    response = []
    for req, mo in results:
        # Determine strict production status
        p_status = "waiting"
        s = req.status
        if isinstance(s, IDRequestStatus):
            s = s.value
            
        if s in ["nova", "triagem"]:
            p_status = "waiting"
        elif s in ["em_lote", "em_progresso"]:
             p_status = "in_progress"
        elif s in ["concluido", "entregue"]:
             p_status = "done"
        
        response.append(ProductionRequestResponse(
            id=req.id,
            mo_number=mo.name,
            package_code=req.package_code,
            created_at=req.created_at,
            status=s,
            production_status=p_status,
            notes=req.notes,
            obra=mo.x_studio_nome_da_obra or "Sem Obra",
            product_qty=mo.product_qty,
            priority=req.priority or "normal"
        ))
        
    return response


# ── POST /production/requests/{id}/nao-consta ─────────────────────
class NaoConstaPayload(BaseModel):
    """Payload para registrar IDs que não chegaram ao operador."""
    model_config = ConfigDict(extra="forbid")

    items: List[str] = Field(
        ...,
        min_length=1,
        description="Lista de task_codes que não chegaram. Ex: ['WAGO_210_804', 'ELESYS_EFZ']",
    )
    registrado_por: str = Field(..., min_length=2, max_length=100)


class NaoConstaResponse(BaseModel):
    request_id: str
    mo_number: str
    nao_consta_em: str
    nao_consta_items: List[str]
    nao_consta_registrado_por: str


@router.post("/requests/{request_id}/nao-consta", response_model=NaoConstaResponse)
async def registrar_nao_consta(
    request_id: uuid.UUID,
    payload: NaoConstaPayload,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Registra que uma ou mais IDs solicitadas não chegaram ao operador ('Não Consta').

    Regras:
    - Apenas requests com status aberto (nova, triagem, em_lote, em_progresso) podem
      receber o registro — IDs já concluídas ou canceladas não fazem sentido.
    - Os task_codes informados devem pertencer ao blueprint do panel_type da request.
    - Sobrescreve um registro anterior se já existir (idempotente por request).
    - Registra HistoryLog para auditoria.
    """
    # 1. Busca a request
    stmt = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
        .where(IDRequest.id == request_id)
    )
    result = await session.exec(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")

    id_request, mo = row

    # 2. Valida status — só faz sentido para requests abertas
    status_str = id_request.status.value if hasattr(id_request.status, "value") else str(id_request.status)
    open_statuses = {s.value for s in OPEN_STATUSES}
    if status_str not in open_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"Não é possível registrar 'Não Consta' para uma solicitação com status '{status_str}'.",
        )

    # 3. Valida task_codes contra o blueprint do panel_type
    panel = id_request.package_code or "custom"
    allowed_codes = set(PANEL_BLUEPRINTS.get(panel, ALL_TASK_CODES))
    invalid = [c for c in payload.items if c not in allowed_codes]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Códigos inválidos para o tipo '{panel}'",
                "invalid_codes": invalid,
                "allowed_codes": list(allowed_codes),
            },
        )

    # 4. Registra
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    id_request.nao_consta_em = now
    id_request.nao_consta_items = payload.items
    id_request.nao_consta_registrado_por = payload.registrado_por
    session.add(id_request)

    # 5. HistoryLog
    log = HistoryLog(
        entity_type="id_request",
        entity_id=id_request.id,
        action="NAO_CONSTA_REGISTRADO",
        after_json={
            "items": payload.items,
            "registrado_por": payload.registrado_por,
            "mo_number": mo.name,
            "panel_type": panel,
        },
    )
    session.add(log)
    await session.commit()
    await session.refresh(id_request)

    return NaoConstaResponse(
        request_id=str(id_request.id),
        mo_number=mo.name,
        nao_consta_em=now.isoformat() + "Z",
        nao_consta_items=payload.items,
        nao_consta_registrado_por=payload.registrado_por,
    )

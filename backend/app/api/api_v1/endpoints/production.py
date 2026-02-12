"""
Production Portal endpoints.
GET  /production/search  — search Odoo MOs by fabrication number
POST /production/request — create manual ID Visual request (urgent, Lean + Poka-yoke)
"""
from __future__ import annotations

import logging
import traceback
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.core.config import settings
from app.models.audit import HistoryLog
from app.models.id_request import IDRequest, IDRequestStatus, IDRequestTask
from app.models.manufacturing import ManufacturingOrder
from app.services.odoo_client import OdooClient

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
async def search_mos(q: str = "") -> Any:
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
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD,
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

        activity_mo_ids: set = set()
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
            activity_mo_ids = {a["res_id"] for a in activities}

        # Build response — Odoo returns False for empty fields instead of None
        results = []
        for mo in mos:
            ds = mo.get("date_start")
            obra_raw = mo.get("x_studio_nome_da_obra")
            state_raw = mo.get("state")

            results.append(MOSearchResult(
                odoo_mo_id=mo["id"],
                mo_number=str(mo.get("name", "")),
                obra=str(obra_raw) if obra_raw and obra_raw is not False else None,
                product_qty=float(mo.get("product_qty") or 0),
                date_start=str(ds)[:10] if ds and ds is not False else None,
                state=str(state_raw) if state_raw and state_raw is not False else "unknown",
                has_id_activity=mo["id"] in activity_mo_ids,
            ))

        return results

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Odoo MO search error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Odoo search error: {str(e)}")
    finally:
        await client.close()


# ── POST /production/request ──────────────────────────────────────
@router.post("/request", response_model=ManualRequestResponse)
async def create_manual_request(
    payload: ManualRequestPayload,
    session: AsyncSession = Depends(deps.get_session),
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
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD,
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
            mo.x_studio_nome_da_obra = safe_str(odoo_mo.get("x_studio_nome_da_obra")) or mo.x_studio_nome_da_obra
            mo.product_qty = safe_float(odoo_mo.get("product_qty"))
            mo.state = safe_str(odoo_mo.get("state")) or mo.state
            mo.last_sync_at = datetime.utcnow()
            mo.date_start = parse_date(odoo_mo.get("date_start"))
        else:
            company_raw = odoo_mo.get("company_id")
            company_int = None
            if isinstance(company_raw, list) and len(company_raw) > 0:
                company_int = company_raw[0]
            elif isinstance(company_raw, int):
                company_int = company_raw

            mo = ManufacturingOrder(
                odoo_id=payload.odoo_mo_id,
                name=safe_str(odoo_mo.get("name")) or f"MO/{payload.odoo_mo_id}",
                x_studio_nome_da_obra=safe_str(odoo_mo.get("x_studio_nome_da_obra")),
                product_qty=safe_float(odoo_mo.get("product_qty")),
                date_start=parse_date(odoo_mo.get("date_start")),
                state=safe_str(odoo_mo.get("state")) or "progress",
                company_id=company_int,
            )

        session.add(mo)
        await session.flush()  # Get mo.id

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
        logger.error(f"Manual request creation error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Request creation error: {str(e)}")


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
            notes=req.notes
        ))
        
    return response

"""
Endpoints de importação EPLAN e gestão de etiquetas por MO.

Rotas:
  POST /eplan/import/devices   — importa DeviceLabel de Excel (WAGO 210-805)
  POST /eplan/import/terminals — importa TerminalLabel de Excel (WAGO 2009-110)
  GET  /eplan/{mo_id}/devices  — lista DeviceLabel de uma MO
  GET  /eplan/{mo_id}/terminals— lista TerminalLabel de uma MO
  DELETE /eplan/{mo_id}/devices  — remove todos DeviceLabel de uma MO
  DELETE /eplan/{mo_id}/terminals— remove todos TerminalLabel de uma MO

Nota: mo_id aceita tanto UUID interno quanto odoo_id inteiro (ex: "1791").
"""
import io
import logging
import unicodedata
import uuid
from typing import Any, List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.audit import HistoryLog
from app.models.label_device import DeviceLabel
from app.models.label_terminal import TerminalLabel
from app.models.manufacturing import ManufacturingOrder
from app.schemas.eplan import (
    DeviceLabelOut,
    DeviceLabelCreate,
    DeviceLabelUpdate,
    DeviceReorderPayload,
    EplanImportSummary,
    TerminalLabelOut,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: resolve mo_id → UUID interno
# ---------------------------------------------------------------------------

async def _resolve_mo_uuid(mo_id: str, session: AsyncSession) -> uuid.UUID:
    """
    Aceita tanto UUID interno quanto odoo_id inteiro (ex: "1791").
    Retorna o UUID interno da ManufacturingOrder.
    Lança HTTPException 404 se não encontrar.
    """
    # Tenta como UUID direto
    try:
        return uuid.UUID(mo_id)
    except ValueError:
        pass

    # Tenta como odoo_id inteiro
    try:
        odoo_id = int(mo_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="mo_id deve ser UUID ou odoo_id inteiro")

    stmt = select(ManufacturingOrder).where(ManufacturingOrder.odoo_id == odoo_id)
    result = await session.exec(stmt)
    mo = result.first()
    if not mo:
        raise HTTPException(
            status_code=404,
            detail=f"ManufacturingOrder com odoo_id={odoo_id} não encontrada"
        )
    return mo.id  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Helpers de parsing Excel
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _parse_excel(content: bytes) -> tuple[list[str], list[list[Any]]]:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl não instalado.")

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Arquivo Excel inválido: {exc}")

    if not rows:
        raise HTTPException(status_code=400, detail="Arquivo Excel vazio.")

    headers = [_normalize(str(h)) if h is not None else "" for h in rows[0]]
    data_rows = [list(r) for r in rows[1:]]
    return headers, data_rows


def _find_col(headers: list[str], *candidates: str) -> int | None:
    normalized = [_normalize(c) for c in candidates]
    for i, h in enumerate(headers):
        if h in normalized:
            return i
    return None


def _cell_str(row: list, idx: int | None) -> str | None:
    if idx is None or idx >= len(row):
        return None
    val = row[idx]
    if val is None:
        return None
    return str(val).strip() or None


# ---------------------------------------------------------------------------
# POST /eplan/import/devices
# ---------------------------------------------------------------------------

@router.post("/import/devices", response_model=EplanImportSummary)
async def import_devices(
    mo_id: str = Query(..., description="UUID ou odoo_id da ManufacturingOrder"),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    content = await file.read()
    headers, data_rows = _parse_excel(content)

    col_tag  = _find_col(headers, "tag", "dispositivo")
    col_desc = _find_col(headers, "designacao", "descricao", "description", "designação", "descrição")
    col_loc  = _find_col(headers, "localizacao", "quadro", "localização")

    if col_tag is None:
        raise HTTPException(status_code=422, detail="Coluna 'Tag' ou 'Dispositivo' não encontrada.")
    if col_desc is None:
        raise HTTPException(status_code=422, detail="Coluna 'Designação' ou 'Descrição' não encontrada.")

    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_uuid)
    result = await session.exec(stmt)
    existing: dict[str, DeviceLabel] = {d.device_tag: d for d in result.all()}

    imported = updated = skipped = 0
    errors: list[str] = []

    for row_idx, row in enumerate(data_rows, start=2):
        tag  = _cell_str(row, col_tag)
        desc = _cell_str(row, col_desc)
        loc  = _cell_str(row, col_loc)

        if not tag:
            continue
        if not desc:
            errors.append(f"Linha {row_idx}: tag '{tag}' sem descrição — ignorada.")
            skipped += 1
            continue

        order_index = row_idx - 2

        if tag in existing:
            rec = existing[tag]
            rec.description = desc
            rec.location = loc
            rec.order_index = order_index
            session.add(rec)
            updated += 1
        else:
            rec = DeviceLabel(mo_id=mo_uuid, device_tag=tag, description=desc, location=loc, order_index=order_index)
            session.add(rec)
            existing[tag] = rec
            imported += 1

    await session.commit()

    if imported + updated > 0:
        session.add(HistoryLog(
            entity_type="manufacturing_order",
            entity_id=mo_uuid,
            action=f"EPLAN import: {imported} dispositivos importados",
            after_json={"imported": imported, "updated": updated, "skipped": skipped},
            user_id=current_user.id if current_user else None,
        ))
        await session.commit()

    logger.info(f"[eplan] import/devices mo_id={mo_id} imported={imported} updated={updated}")
    return EplanImportSummary(imported=imported, updated=updated, skipped=skipped, errors=errors)


# ---------------------------------------------------------------------------
# POST /eplan/import/terminals
# ---------------------------------------------------------------------------

@router.post("/import/terminals", response_model=EplanImportSummary)
async def import_terminals(
    mo_id: str = Query(..., description="UUID ou odoo_id da ManufacturingOrder"),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    content = await file.read()
    headers, data_rows = _parse_excel(content)

    col_num   = _find_col(headers, "borne", "terminal")
    col_wire  = _find_col(headers, "fio", "wire", "numero do fio", "número do fio")
    col_group = _find_col(headers, "grupo", "circuito", "funcao", "função")

    if col_num is None:
        raise HTTPException(status_code=422, detail="Coluna 'Borne' ou 'Terminal' não encontrada.")

    stmt = select(TerminalLabel).where(TerminalLabel.mo_id == mo_uuid)
    result = await session.exec(stmt)
    existing: dict[str, TerminalLabel] = {t.terminal_number: t for t in result.all()}

    imported = updated = skipped = 0
    errors: list[str] = []

    for row_idx, row in enumerate(data_rows, start=2):
        num   = _cell_str(row, col_num)
        wire  = _cell_str(row, col_wire)
        group = _cell_str(row, col_group)

        if not num:
            continue

        order_index = row_idx - 2

        if num in existing:
            rec = existing[num]
            rec.wire_number = wire
            rec.group_name = group
            rec.order_index = order_index
            session.add(rec)
            updated += 1
        else:
            rec = TerminalLabel(mo_id=mo_uuid, terminal_number=num, wire_number=wire, group_name=group, order_index=order_index)
            session.add(rec)
            existing[num] = rec
            imported += 1

    await session.commit()

    if imported + updated > 0:
        session.add(HistoryLog(
            entity_type="manufacturing_order",
            entity_id=mo_uuid,
            action=f"EPLAN import: {imported} bornes importados",
            after_json={"imported": imported, "updated": updated, "skipped": skipped},
            user_id=current_user.id if current_user else None,
        ))
        await session.commit()

    logger.info(f"[eplan] import/terminals mo_id={mo_id} imported={imported} updated={updated}")
    return EplanImportSummary(imported=imported, updated=updated, skipped=skipped, errors=errors)


# ---------------------------------------------------------------------------
# GET /eplan/{mo_id}/devices
# ---------------------------------------------------------------------------

@router.get("/{mo_id}/devices", response_model=List[DeviceLabelOut])
async def list_devices(
    mo_id: str,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_uuid).order_by(DeviceLabel.order_index)
    result = await session.exec(stmt)
    return result.all()


# ---------------------------------------------------------------------------
# GET /eplan/{mo_id}/terminals
# ---------------------------------------------------------------------------

@router.get("/{mo_id}/terminals", response_model=List[TerminalLabelOut])
async def list_terminals(
    mo_id: str,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    stmt = select(TerminalLabel).where(TerminalLabel.mo_id == mo_uuid).order_by(TerminalLabel.order_index)
    result = await session.exec(stmt)
    return result.all()


# ---------------------------------------------------------------------------
# DELETE /eplan/{mo_id}/devices
# ---------------------------------------------------------------------------

@router.delete("/{mo_id}/devices", response_model=dict)
async def delete_devices(
    mo_id: str,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_uuid)
    result = await session.exec(stmt)
    records = result.all()
    for rec in records:
        await session.delete(rec)
    await session.commit()
    logger.info(f"[eplan] delete/devices mo_id={mo_id} removed={len(records)}")
    return {"deleted": len(records)}


# ---------------------------------------------------------------------------
# DELETE /eplan/{mo_id}/terminals
# ---------------------------------------------------------------------------

@router.delete("/{mo_id}/terminals", response_model=dict)
async def delete_terminals(
    mo_id: str,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    stmt = select(TerminalLabel).where(TerminalLabel.mo_id == mo_uuid)
    result = await session.exec(stmt)
    records = result.all()
    for rec in records:
        await session.delete(rec)
    await session.commit()
    logger.info(f"[eplan] delete/terminals mo_id={mo_id} removed={len(records)}")
    return {"deleted": len(records)}


# ---------------------------------------------------------------------------
# POST /eplan/{mo_id}/devices/manual
# ---------------------------------------------------------------------------

@router.post("/{mo_id}/devices/manual", response_model=DeviceLabelOut)
async def create_device_manual(
    mo_id: str,
    payload: DeviceLabelCreate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)

    # Verifica duplicata
    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_uuid, DeviceLabel.device_tag == payload.device_tag)
    if (await session.exec(stmt)).first():
        raise HTTPException(status_code=409, detail=f"Tag '{payload.device_tag}' já existe para esta MO.")

    # Próximo order_index
    stmt_all = select(DeviceLabel).where(DeviceLabel.mo_id == mo_uuid)
    all_devices = (await session.exec(stmt_all)).all()
    next_order = max((d.order_index for d in all_devices), default=-1) + 1

    device = DeviceLabel(
        mo_id=mo_uuid,
        device_tag=payload.device_tag,
        description=payload.description or payload.device_tag,
        location=payload.location,
        order_index=next_order,
    )
    session.add(device)
    await session.commit()
    await session.refresh(device)

    logger.info(f"[eplan] create_device_manual mo_id={mo_id} tag={payload.device_tag}")
    return device


# ---------------------------------------------------------------------------
# PATCH /eplan/devices/{device_id}
# ---------------------------------------------------------------------------

@router.patch("/devices/{device_id}", response_model=DeviceLabelOut)
async def update_device(
    device_id: int,
    payload: DeviceLabelUpdate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    stmt = select(DeviceLabel).where(DeviceLabel.id == device_id)
    device = (await session.exec(stmt)).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")

    if payload.device_tag and payload.device_tag != device.device_tag:
        stmt_check = select(DeviceLabel).where(DeviceLabel.mo_id == device.mo_id, DeviceLabel.device_tag == payload.device_tag)
        if (await session.exec(stmt_check)).first():
            raise HTTPException(status_code=409, detail=f"Tag '{payload.device_tag}' já existe para esta MO.")
        device.device_tag = payload.device_tag

    if payload.description is not None:
        device.description = payload.description
    if payload.location is not None:
        device.location = payload.location

    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


# ---------------------------------------------------------------------------
# POST /eplan/{mo_id}/devices/reorder
# ---------------------------------------------------------------------------

@router.post("/{mo_id}/devices/reorder", response_model=dict)
async def reorder_devices(
    mo_id: str,
    payload: DeviceReorderPayload,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    mo_uuid = await _resolve_mo_uuid(mo_id, session)
    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_uuid)
    devices_map = {d.id: d for d in (await session.exec(stmt)).all()}

    for device_id in payload.device_ids:
        if device_id not in devices_map:
            raise HTTPException(status_code=400, detail=f"Dispositivo ID {device_id} não pertence à MO.")

    for new_index, device_id in enumerate(payload.device_ids):
        devices_map[device_id].order_index = new_index
        session.add(devices_map[device_id])

    await session.commit()
    return {"reordered": len(payload.device_ids)}


# ---------------------------------------------------------------------------
# DELETE /eplan/devices/{device_id}
# ---------------------------------------------------------------------------

@router.delete("/devices/{device_id}", response_model=dict)
async def delete_device(
    device_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    stmt = select(DeviceLabel).where(DeviceLabel.id == device_id)
    device = (await session.exec(stmt)).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    await session.delete(device)
    await session.commit()
    return {"deleted": 1}

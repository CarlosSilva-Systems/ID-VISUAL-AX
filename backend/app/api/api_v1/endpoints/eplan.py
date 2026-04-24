"""
Endpoints de importação EPLAN e gestão de etiquetas por MO.

Rotas:
  POST /eplan/import/devices   — importa DeviceLabel de Excel (WAGO 210-805)
  POST /eplan/import/terminals — importa TerminalLabel de Excel (WAGO 2009-110)
  GET  /eplan/{mo_id}/devices  — lista DeviceLabel de uma MO
  GET  /eplan/{mo_id}/terminals— lista TerminalLabel de uma MO
  DELETE /eplan/{mo_id}/devices  — remove todos DeviceLabel de uma MO
  DELETE /eplan/{mo_id}/terminals— remove todos TerminalLabel de uma MO
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
from app.schemas.eplan import DeviceLabelOut, EplanImportSummary, TerminalLabelOut

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculas para comparação de cabeçalhos."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _parse_excel(content: bytes) -> tuple[list[str], list[list[Any]]]:
    """
    Lê um arquivo Excel e retorna (headers_normalizados, linhas).
    Lança ValueError se o arquivo for inválido.
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="openpyxl não instalado. Adicione ao pyproject.toml.",
        )

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
    """Retorna o índice da primeira coluna que bate com algum dos candidatos."""
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
    mo_id: int = Query(..., description="ID local da ManufacturingOrder"),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Importa DeviceLabel (WAGO 210-805) de um arquivo Excel do EPLAN.

    Colunas aceitas (case-insensitive, sem acento):
      - Tag / Dispositivo → device_tag
      - Designação / Descrição / Description → description
      - Localização / Quadro → location (opcional)

    Upsert por (mo_id, device_tag).
    """
    content = await file.read()
    headers, data_rows = _parse_excel(content)

    col_tag  = _find_col(headers, "tag", "dispositivo")
    col_desc = _find_col(headers, "designacao", "descricao", "description", "designação", "descrição")
    col_loc  = _find_col(headers, "localizacao", "quadro", "localização")

    if col_tag is None:
        raise HTTPException(
            status_code=422,
            detail="Coluna 'Tag' ou 'Dispositivo' não encontrada no Excel.",
        )
    if col_desc is None:
        raise HTTPException(
            status_code=422,
            detail="Coluna 'Designação', 'Descrição' ou 'Description' não encontrada.",
        )

    # Carrega existentes para upsert eficiente
    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_id)
    result = await session.exec(stmt)
    existing: dict[str, DeviceLabel] = {d.device_tag: d for d in result.all()}

    imported = updated = skipped = 0
    errors: list[str] = []

    for row_idx, row in enumerate(data_rows, start=2):
        tag  = _cell_str(row, col_tag)
        desc = _cell_str(row, col_desc)
        loc  = _cell_str(row, col_loc)

        if not tag:
            continue  # linha vazia — ignorar silenciosamente
        if not desc:
            errors.append(f"Linha {row_idx}: tag '{tag}' sem descrição — ignorada.")
            skipped += 1
            continue

        order_index = row_idx - 2  # 0-based pela ordem no Excel

        if tag in existing:
            rec = existing[tag]
            rec.description = desc
            rec.location = loc
            rec.order_index = order_index
            session.add(rec)
            updated += 1
        else:
            rec = DeviceLabel(
                mo_id=mo_id,
                device_tag=tag,
                description=desc,
                location=loc,
                order_index=order_index,
            )
            session.add(rec)
            existing[tag] = rec
            imported += 1

    await session.commit()

    # HistoryLog
    if imported + updated > 0:
        log = HistoryLog(
            entity_type="manufacturing_order",
            entity_id=uuid.UUID(int=mo_id) if mo_id < 2**128 else uuid.uuid4(),
            action=f"EPLAN import: {imported} dispositivos importados para MO {mo_id}",
            after_json={"imported": imported, "updated": updated, "skipped": skipped},
            user_id=current_user.id if current_user else None,
        )
        session.add(log)
        await session.commit()

    logger.info(
        f"[eplan] import/devices mo_id={mo_id} "
        f"imported={imported} updated={updated} skipped={skipped} errors={len(errors)}"
    )
    return EplanImportSummary(
        imported=imported, updated=updated, skipped=skipped, errors=errors
    )


# ---------------------------------------------------------------------------
# POST /eplan/import/terminals
# ---------------------------------------------------------------------------

@router.post("/import/terminals", response_model=EplanImportSummary)
async def import_terminals(
    mo_id: int = Query(..., description="ID local da ManufacturingOrder"),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Importa TerminalLabel (WAGO 2009-110) de um arquivo Excel do EPLAN.

    Colunas aceitas:
      - Borne / Terminal → terminal_number
      - Fio / Wire / Número do fio → wire_number (opcional)
      - Grupo / Circuito / Função → group_name (opcional)

    Upsert por (mo_id, terminal_number).
    """
    content = await file.read()
    headers, data_rows = _parse_excel(content)

    col_num   = _find_col(headers, "borne", "terminal")
    col_wire  = _find_col(headers, "fio", "wire", "numero do fio", "número do fio")
    col_group = _find_col(headers, "grupo", "circuito", "funcao", "função")

    if col_num is None:
        raise HTTPException(
            status_code=422,
            detail="Coluna 'Borne' ou 'Terminal' não encontrada no Excel.",
        )

    stmt = select(TerminalLabel).where(TerminalLabel.mo_id == mo_id)
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
            rec = TerminalLabel(
                mo_id=mo_id,
                terminal_number=num,
                wire_number=wire,
                group_name=group,
                order_index=order_index,
            )
            session.add(rec)
            existing[num] = rec
            imported += 1

    await session.commit()

    if imported + updated > 0:
        log = HistoryLog(
            entity_type="manufacturing_order",
            entity_id=uuid.UUID(int=mo_id) if mo_id < 2**128 else uuid.uuid4(),
            action=f"EPLAN import: {imported} bornes importados para MO {mo_id}",
            after_json={"imported": imported, "updated": updated, "skipped": skipped},
            user_id=current_user.id if current_user else None,
        )
        session.add(log)
        await session.commit()

    logger.info(
        f"[eplan] import/terminals mo_id={mo_id} "
        f"imported={imported} updated={updated} skipped={skipped}"
    )
    return EplanImportSummary(
        imported=imported, updated=updated, skipped=skipped, errors=errors
    )


# ---------------------------------------------------------------------------
# GET /eplan/{mo_id}/devices
# ---------------------------------------------------------------------------

@router.get("/{mo_id}/devices", response_model=List[DeviceLabelOut])
async def list_devices(
    mo_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Lista todos os DeviceLabel de uma MO ordenados por order_index."""
    stmt = (
        select(DeviceLabel)
        .where(DeviceLabel.mo_id == mo_id)
        .order_by(DeviceLabel.order_index)
    )
    result = await session.exec(stmt)
    return result.all()


# ---------------------------------------------------------------------------
# GET /eplan/{mo_id}/terminals
# ---------------------------------------------------------------------------

@router.get("/{mo_id}/terminals", response_model=List[TerminalLabelOut])
async def list_terminals(
    mo_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Lista todos os TerminalLabel de uma MO ordenados por order_index."""
    stmt = (
        select(TerminalLabel)
        .where(TerminalLabel.mo_id == mo_id)
        .order_by(TerminalLabel.order_index)
    )
    result = await session.exec(stmt)
    return result.all()


# ---------------------------------------------------------------------------
# DELETE /eplan/{mo_id}/devices
# ---------------------------------------------------------------------------

@router.delete("/{mo_id}/devices", response_model=dict)
async def delete_devices(
    mo_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Remove todos os DeviceLabel de uma MO (para reimportar do zero)."""
    stmt = select(DeviceLabel).where(DeviceLabel.mo_id == mo_id)
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
    mo_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Remove todos os TerminalLabel de uma MO (para reimportar do zero)."""
    stmt = select(TerminalLabel).where(TerminalLabel.mo_id == mo_id)
    result = await session.exec(stmt)
    records = result.all()

    for rec in records:
        await session.delete(rec)
    await session.commit()

    logger.info(f"[eplan] delete/terminals mo_id={mo_id} removed={len(records)}")
    return {"deleted": len(records)}

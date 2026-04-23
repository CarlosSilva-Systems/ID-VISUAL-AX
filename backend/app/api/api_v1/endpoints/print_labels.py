"""
Endpoint de impressão de etiquetas Zebra via ZPL/TCP.

Rota: POST /id-visual/print/labels

Fluxo:
    1. Busca IDRequest e ManufacturingOrder associada
    2. Lê IP da impressora de SystemSetting (zebra_printer_ip)
    3. Renderiza ZPL conforme label_type (technical / external / both)
    4. Envia para a impressora via TCP (porta 9100)
    5. Registra HistoryLog e retorna PrintLabelResponse
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.id_request import IDRequest
from app.models.manufacturing import ManufacturingOrder
from app.models.audit import HistoryLog
from app.models.system_setting import SystemSetting
from app.schemas.print_label import PrintLabelRequest, PrintLabelResponse
from app.services.zebra_printer import ZebraPrinter, ZebraPrinterError
from app.services.zpl_templates import render_technical_label, render_external_label

logger = logging.getLogger(__name__)
router = APIRouter()


async def _get_system_setting(session: AsyncSession, key: str) -> str | None:
    """Busca um valor de SystemSetting pelo key. Retorna None se não existir."""
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    result = await session.exec(stmt)
    setting = result.first()
    return setting.value.strip() if setting and setting.value else None


@router.post("/print/labels", response_model=PrintLabelResponse)
async def print_labels(
    payload: PrintLabelRequest,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Imprime etiqueta(s) Zebra para uma IDRequest.

    - label_type="technical" → imprime 1 etiqueta técnica interna (100x45mm)
    - label_type="external"  → imprime 1 etiqueta externa com QR code (100x55mm)
    - label_type="both"      → imprime as duas em sequência

    Requer SystemSetting `zebra_printer_ip` configurado (503 caso ausente).
    """
    # --- 1. Buscar IDRequest ---
    try:
        req_uuid = uuid.UUID(payload.id_request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="id_request_id inválido — deve ser um UUID.")

    id_req = await session.get(IDRequest, req_uuid)
    if not id_req:
        raise HTTPException(
            status_code=404,
            detail=f"IDRequest {payload.id_request_id} não encontrada.",
        )

    # --- 2. Buscar ManufacturingOrder ---
    mo = await session.get(ManufacturingOrder, id_req.mo_id)
    if not mo:
        raise HTTPException(
            status_code=404,
            detail=f"ManufacturingOrder associada à IDRequest {payload.id_request_id} não encontrada.",
        )

    # --- 3. Buscar IP da impressora em SystemSetting ---
    printer_ip = await _get_system_setting(session, "zebra_printer_ip")
    if not printer_ip:
        raise HTTPException(
            status_code=503,
            detail=(
                "Impressora Zebra não configurada. "
                "Acesse Configurações e defina o valor de 'zebra_printer_ip'."
            ),
        )

    # --- 4. Instanciar impressora ---
    printer = ZebraPrinter(host=printer_ip)

    # --- 5. Renderizar e enviar ZPL ---
    try:
        if payload.label_type in ("technical", "both"):
            zpl_tech = render_technical_label(
                nome_obra=mo.x_studio_nome_da_obra or "",
                nome_quadro=mo.product_name or "",
                corrente_nominal=payload.corrente_nominal or "",
                frequencia=payload.frequencia or "60Hz",
                cap_corte=payload.cap_corte or "",
                tensao=payload.tensao or "",
                curva_disparo=payload.curva_disparo or "",
                tensao_impulso=payload.tensao_impulso or "",
                tensao_isolamento=payload.tensao_isolamento or "",
            )
            await printer.print_zpl(zpl_tech)
            logger.info(
                f"[print_labels] Etiqueta técnica enviada para {printer_ip} "
                f"— IDRequest={payload.id_request_id} MO={mo.name}"
            )

        if payload.label_type in ("external", "both"):
            zpl_ext = render_external_label(
                ax_code=mo.ax_code or "",
                fab_code=mo.fab_code or "",
                nome_quadro=mo.product_name or "",
                nome_obra=mo.x_studio_nome_da_obra or "",
                qr_url=payload.qr_url or "",
            )
            await printer.print_zpl(zpl_ext)
            logger.info(
                f"[print_labels] Etiqueta externa enviada para {printer_ip} "
                f"— IDRequest={payload.id_request_id} MO={mo.name}"
            )

    except ZebraPrinterError as exc:
        logger.error(f"[print_labels] Falha na impressora {printer_ip}: {exc}")
        raise HTTPException(
            status_code=503,
            detail=f"Impressora não acessível: {exc}",
        )

    # --- 6. Registrar HistoryLog ---
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    log_entry = HistoryLog(
        entity_type="id_request",
        entity_id=id_req.id,
        action=f"Etiqueta impressa: {payload.label_type}",
        after_json={"label_type": payload.label_type, "printer_ip": printer_ip},
        user_id=current_user.id if current_user else None,
        created_at=now,
    )
    session.add(log_entry)
    await session.commit()

    return PrintLabelResponse(
        status="ok",
        label_type=payload.label_type,
        mo_name=mo.name,
        printed_at=now,
    )

"""
Schemas Pydantic para o endpoint de impressão de etiquetas Zebra.
"""
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel


class PrintLabelRequest(BaseModel):
    id_request_id: str  # UUID da IDRequest
    label_type: Literal["technical", "external", "both"]

    # Dados técnicos — preenchidos manualmente pelo operador
    corrente_nominal: Optional[str] = None
    frequencia: Optional[str] = "60Hz"
    cap_corte: Optional[str] = None
    tensao: Optional[str] = None
    curva_disparo: Optional[str] = None
    tensao_impulso: Optional[str] = None
    tensao_isolamento: Optional[str] = None

    # Link para QR code (Odoo Documentos)
    qr_url: Optional[str] = None


class PrintLabelResponse(BaseModel):
    status: str
    label_type: str
    mo_name: str
    printed_at: datetime

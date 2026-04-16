from datetime import datetime, timezone
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.id_request import IDRequest, IDRequestStatus

logger = logging.getLogger(__name__)

def update_id_request_status(req: IDRequest, new_status: IDRequestStatus | str) -> IDRequest:
    """
    Atualiza o status de uma IDRequest e injeta automaticamente os timestamps correspondentes.
    Implementação do Padrão Singleton para mutação de estado.
    """
    # Cast str to enum se necessário
    if isinstance(new_status, str):
        try:
            new_status = IDRequestStatus(new_status)
        except ValueError:
            logger.warning(f"Invalid status {new_status} pushed to update_id_request_status")
            req.status = new_status
            return req

    # Apenas atualiza se houve mudança real (evita overwrite de timestamps por acidente)
    # Compara tanto enum quanto string para evitar falso-negativo
    current_status_val = req.status.value if hasattr(req.status, 'value') else str(req.status)
    new_status_val = new_status.value if hasattr(new_status, 'value') else str(new_status)
    if current_status_val == new_status_val:
        return req
        
    req.status = new_status
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    # Injeção automática de timestamps (SLA/MPR Analytics) baseada no novo status
    if new_status == IDRequestStatus.EM_PROGRESSO or new_status == IDRequestStatus.EM_LOTE:
        if not req.iniciado_em:  # Não sobrescreve se já começou e voltou
            req.iniciado_em = now_utc
        if not req.started_at:  # Para compatibilidade com Andon TV
            req.started_at = now_utc

    elif new_status == IDRequestStatus.CONCLUIDA:
        if not req.concluido_em:
            req.concluido_em = now_utc
        if not req.finished_at:  # CRÍTICO: Para Andon TV gerar evento IDVISUAL_DONE
            req.finished_at = now_utc
            
    elif new_status == IDRequestStatus.ENTREGUE:
        if not req.entregue_em:
            req.entregue_em = now_utc
            
    # Notas:
    # `solicitado_em` é preenchido na criação da solicitação na tela de produção.
    # `revisao_solicitada_em` será gerida por outro serviço dedicado de retrabalho.
    # `aprovado_em` será gerido no respectivo momento de endosso caso houver aprovação multi-etapa.
    
    return req

from typing import Any, List
import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.db.session import get_session
from app.models.user import User
from app.models.custom_report import CustomReport, CustomReportRead
from app.services.report_agent import generate_report_layout
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class GenerateRequest(BaseModel):
    prompt: str

@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def create_ia_report(
    payload: GenerateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Cria um novo relatório do zero baseado no prompt.
    """
    try:
        # Chama a IA para gerar o layout inicial
        layout = await generate_report_layout(payload.prompt)
        
        new_report = CustomReport(
            user_id=current_user.id,
            title=layout.title,
            description=layout.description,
            layout_config=layout.model_dump() if hasattr(layout, "model_dump") else layout.dict()
        )
        
        session.add(new_report)
        await session.commit()
        await session.refresh(new_report)
        
        return new_report
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro na geração de relatório [ref:{request_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar relatório [ref: {request_id}]")

@router.patch("/{id}/refine", response_model=CustomReportRead)
async def refine_ia_report(
    id: uuid.UUID,
    payload: GenerateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Refina um relatório existente usando IA (Modo Iterativo).
    """
    report = await session.get(CustomReport, id)
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    try:
        # Passa o layout atual para a IA refinar
        new_layout = await generate_report_layout(payload.prompt, current_layout=report.layout_config)
        
        # Atualiza os campos
        report.title = new_layout.title
        report.description = new_layout.description
        report.layout_config = new_layout.model_dump() if hasattr(new_layout, "model_dump") else new_layout.dict()
        
        session.add(report)
        await session.commit()
        await session.refresh(report)
        
        return report
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro no refinamento do relatório [ref:{request_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao refinar relatório [ref: {request_id}]")

@router.get("/", response_model=List[CustomReportRead])

async def read_custom_reports(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retorna a lista de relatórios customizados do usuário logado.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    stmt = select(CustomReport).where(CustomReport.user_id == current_user.id).offset(skip).limit(limit)
    result = await session.execute(stmt)
    reports = result.scalars().all()
    return reports

@router.get("/{id}", response_model=CustomReportRead)
async def read_custom_report(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Busca um relatório específico pelo ID verificando o dono.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    report = await session.get(CustomReport, id)
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado a este relatório")
    return report

@router.delete("/{id}")
async def delete_custom_report(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Deleta um relatório privado do usuário.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    report = await session.get(CustomReport, id)
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    await session.delete(report)
    await session.commit()
    return {"status": "success", "message": "Relatório deletado"}

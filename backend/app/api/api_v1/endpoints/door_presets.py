"""
Endpoints para gerenciamento de presets de etiquetas de porta (210-855).

Rotas:
  GET    /door-presets           — lista presets com filtros
  POST   /door-presets           — cria novo preset
  PATCH  /door-presets/{id}      — atualiza preset (apenas criador)
  DELETE /door-presets/{id}      — deleta preset (apenas criador)
  POST   /door-presets/{id}/favorite — toggle favorito
  POST   /door-presets/{id}/use  — incrementa contador de uso
"""
import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, or_, and_
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.door_label_preset import DoorLabelPreset, DoorLabelPresetFavorite
from app.schemas.door_preset import (
    DoorLabelPresetOut,
    DoorLabelPresetCreate,
    DoorLabelPresetUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# GET /door-presets — Lista presets com filtros
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[DoorLabelPresetOut])
async def list_presets(
    category: Optional[str] = Query(None, description="Filtrar por categoria"),
    filter_type: str = Query("all", description="all, system, mine, team, favorites"),
    search: Optional[str] = Query(None, description="Buscar por nome"),
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Lista presets de etiquetas de porta com filtros.
    
    Filtros:
    - all: Todos os presets (sistema + pessoais + compartilhados)
    - system: Apenas presets do sistema
    - mine: Apenas meus presets
    - team: Apenas presets compartilhados por outros
    - favorites: Apenas meus favoritos
    """
    username = current_user.username if current_user else None
    
    # Base query
    stmt = select(DoorLabelPreset)
    
    # Aplicar filtro de tipo
    if filter_type == "system":
        stmt = stmt.where(DoorLabelPreset.is_system == True)
    elif filter_type == "mine":
        stmt = stmt.where(DoorLabelPreset.created_by == username)
    elif filter_type == "team":
        stmt = stmt.where(
            and_(
                DoorLabelPreset.is_shared == True,
                DoorLabelPreset.created_by != username,
                DoorLabelPreset.is_system == False,
            )
        )
    elif filter_type == "favorites":
        # Subquery para favoritos do usuário
        fav_stmt = select(DoorLabelPresetFavorite.preset_id).where(
            DoorLabelPresetFavorite.username == username
        )
        fav_result = await session.exec(fav_stmt)
        fav_ids = [f for f in fav_result.all()]
        
        if not fav_ids:
            return []
        
        stmt = stmt.where(DoorLabelPreset.id.in_(fav_ids))
    else:  # "all"
        # Mostra: sistema + meus + compartilhados por outros
        stmt = stmt.where(
            or_(
                DoorLabelPreset.is_system == True,
                DoorLabelPreset.created_by == username,
                DoorLabelPreset.is_shared == True,
            )
        )
    
    # Filtro de categoria
    if category:
        stmt = stmt.where(DoorLabelPreset.category == category)
    
    # Busca por nome
    if search:
        stmt = stmt.where(DoorLabelPreset.name.ilike(f"%{search}%"))
    
    # Ordenação: sistema primeiro, depois por popularidade, depois por nome
    stmt = stmt.order_by(
        DoorLabelPreset.is_system.desc(),
        DoorLabelPreset.usage_count.desc(),
        DoorLabelPreset.name,
    )
    
    result = await session.exec(stmt)
    presets = result.all()
    
    # Carregar favoritos do usuário
    fav_stmt = select(DoorLabelPresetFavorite.preset_id).where(
        DoorLabelPresetFavorite.username == username
    )
    fav_result = await session.exec(fav_stmt)
    favorite_ids = set(fav_result.all())
    
    # Adicionar flag is_favorite
    output = []
    for preset in presets:
        preset_dict = preset.model_dump()
        preset_dict["is_favorite"] = preset.id in favorite_ids
        output.append(DoorLabelPresetOut(**preset_dict))
    
    return output


# ---------------------------------------------------------------------------
# POST /door-presets — Cria novo preset
# ---------------------------------------------------------------------------

@router.post("/", response_model=DoorLabelPresetOut)
async def create_preset(
    payload: DoorLabelPresetCreate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Cria novo preset personalizado.
    
    Validações:
    - Nome único por usuário
    - Categoria válida
    - Máximo 50 presets por usuário (não-sistema)
    """
    username = current_user.username if current_user else "anonymous"
    
    # Validar categoria
    valid_categories = ["sinaleira", "botoeira-3pos", "botoeira-2pos", "custom"]
    if payload.category not in valid_categories:
        raise HTTPException(
            status_code=422,
            detail=f"Categoria inválida. Use: {', '.join(valid_categories)}"
        )
    
    # Verificar limite de presets por usuário (50)
    stmt_count = select(DoorLabelPreset).where(
        and_(
            DoorLabelPreset.created_by == username,
            DoorLabelPreset.is_system == False,
        )
    )
    result_count = await session.exec(stmt_count)
    user_presets_count = len(result_count.all())
    
    if user_presets_count >= 50:
        raise HTTPException(
            status_code=400,
            detail="Limite de 50 presets personalizados atingido. Delete alguns antes de criar novos."
        )
    
    # Verificar nome único para o usuário
    stmt_check = select(DoorLabelPreset).where(
        and_(
            DoorLabelPreset.created_by == username,
            DoorLabelPreset.name == payload.name,
        )
    )
    result_check = await session.exec(stmt_check)
    if result_check.first():
        raise HTTPException(
            status_code=409,
            detail=f"Você já possui um preset com o nome '{payload.name}'."
        )
    
    # Criar preset
    preset = DoorLabelPreset(
        name=payload.name,
        category=payload.category,
        equipment_name=payload.equipment_name,
        columns=payload.columns,
        rows=payload.rows,
        is_system=False,
        is_shared=payload.is_shared,
        created_by=username,
        usage_count=0,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    
    logger.info(f"[door_presets] create preset_id={preset.id} name={preset.name} by={username}")
    
    # Retornar com is_favorite=False (recém-criado)
    preset_dict = preset.model_dump()
    preset_dict["is_favorite"] = False
    return DoorLabelPresetOut(**preset_dict)


# ---------------------------------------------------------------------------
# PATCH /door-presets/{preset_id} — Atualiza preset
# ---------------------------------------------------------------------------

@router.patch("/{preset_id}", response_model=DoorLabelPresetOut)
async def update_preset(
    preset_id: int,
    payload: DoorLabelPresetUpdate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Atualiza preset existente.
    
    Apenas o criador pode atualizar.
    Presets do sistema não podem ser atualizados.
    """
    username = current_user.username if current_user else None
    
    stmt = select(DoorLabelPreset).where(DoorLabelPreset.id == preset_id)
    result = await session.exec(stmt)
    preset = result.first()
    
    if not preset:
        raise HTTPException(status_code=404, detail="Preset não encontrado.")
    
    if preset.is_system:
        raise HTTPException(status_code=403, detail="Presets do sistema não podem ser editados.")
    
    if preset.created_by != username:
        raise HTTPException(status_code=403, detail="Apenas o criador pode editar este preset.")
    
    # Atualizar campos
    if payload.name is not None:
        # Verificar nome único
        stmt_check = select(DoorLabelPreset).where(
            and_(
                DoorLabelPreset.created_by == username,
                DoorLabelPreset.name == payload.name,
                DoorLabelPreset.id != preset_id,
            )
        )
        result_check = await session.exec(stmt_check)
        if result_check.first():
            raise HTTPException(
                status_code=409,
                detail=f"Você já possui outro preset com o nome '{payload.name}'."
            )
        preset.name = payload.name
    
    if payload.category is not None:
        preset.category = payload.category
    if payload.equipment_name is not None:
        preset.equipment_name = payload.equipment_name
    if payload.columns is not None:
        preset.columns = payload.columns
    if payload.rows is not None:
        preset.rows = payload.rows
    if payload.is_shared is not None:
        preset.is_shared = payload.is_shared
    
    preset.updated_at = _now()
    
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    
    logger.info(f"[door_presets] update preset_id={preset_id} by={username}")
    
    # Verificar se é favorito
    fav_stmt = select(DoorLabelPresetFavorite).where(
        and_(
            DoorLabelPresetFavorite.preset_id == preset_id,
            DoorLabelPresetFavorite.username == username,
        )
    )
    fav_result = await session.exec(fav_stmt)
    is_favorite = fav_result.first() is not None
    
    preset_dict = preset.model_dump()
    preset_dict["is_favorite"] = is_favorite
    return DoorLabelPresetOut(**preset_dict)


# ---------------------------------------------------------------------------
# DELETE /door-presets/{preset_id} — Deleta preset
# ---------------------------------------------------------------------------

@router.delete("/{preset_id}", response_model=dict)
async def delete_preset(
    preset_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Deleta preset.
    
    Apenas o criador pode deletar.
    Presets do sistema não podem ser deletados.
    """
    username = current_user.username if current_user else None
    
    stmt = select(DoorLabelPreset).where(DoorLabelPreset.id == preset_id)
    result = await session.exec(stmt)
    preset = result.first()
    
    if not preset:
        raise HTTPException(status_code=404, detail="Preset não encontrado.")
    
    if preset.is_system:
        raise HTTPException(status_code=403, detail="Presets do sistema não podem ser deletados.")
    
    if preset.created_by != username:
        raise HTTPException(status_code=403, detail="Apenas o criador pode deletar este preset.")
    
    # Deletar favoritos associados
    fav_stmt = select(DoorLabelPresetFavorite).where(
        DoorLabelPresetFavorite.preset_id == preset_id
    )
    fav_result = await session.exec(fav_stmt)
    for fav in fav_result.all():
        await session.delete(fav)
    
    # Deletar preset
    await session.delete(preset)
    await session.commit()
    
    logger.info(f"[door_presets] delete preset_id={preset_id} by={username}")
    return {"deleted": 1}


# ---------------------------------------------------------------------------
# POST /door-presets/{preset_id}/favorite — Toggle favorito
# ---------------------------------------------------------------------------

@router.post("/{preset_id}/favorite", response_model=dict)
async def toggle_favorite(
    preset_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Marca ou desmarca preset como favorito.
    
    Retorna: { "is_favorite": true/false }
    """
    username = current_user.username if current_user else None
    
    # Verificar se preset existe
    stmt_preset = select(DoorLabelPreset).where(DoorLabelPreset.id == preset_id)
    result_preset = await session.exec(stmt_preset)
    if not result_preset.first():
        raise HTTPException(status_code=404, detail="Preset não encontrado.")
    
    # Verificar se já é favorito
    stmt = select(DoorLabelPresetFavorite).where(
        and_(
            DoorLabelPresetFavorite.preset_id == preset_id,
            DoorLabelPresetFavorite.username == username,
        )
    )
    result = await session.exec(stmt)
    existing = result.first()
    
    if existing:
        # Remover favorito
        await session.delete(existing)
        await session.commit()
        logger.info(f"[door_presets] unfavorite preset_id={preset_id} by={username}")
        return {"is_favorite": False}
    else:
        # Adicionar favorito
        favorite = DoorLabelPresetFavorite(
            preset_id=preset_id,
            username=username,
            created_at=_now(),
        )
        session.add(favorite)
        await session.commit()
        logger.info(f"[door_presets] favorite preset_id={preset_id} by={username}")
        return {"is_favorite": True}


# ---------------------------------------------------------------------------
# POST /door-presets/{preset_id}/use — Incrementa contador de uso
# ---------------------------------------------------------------------------

@router.post("/{preset_id}/use", response_model=dict)
async def increment_usage(
    preset_id: int,
    session: AsyncSession = Depends(deps.get_session),
) -> Any:
    """
    Incrementa contador de uso do preset (para tracking de popularidade).
    
    Não requer autenticação (pode ser chamado anonimamente).
    """
    stmt = select(DoorLabelPreset).where(DoorLabelPreset.id == preset_id)
    result = await session.exec(stmt)
    preset = result.first()
    
    if not preset:
        raise HTTPException(status_code=404, detail="Preset não encontrado.")
    
    preset.usage_count += 1
    session.add(preset)
    await session.commit()
    
    logger.info(f"[door_presets] increment_usage preset_id={preset_id} count={preset.usage_count}")
    return {"usage_count": preset.usage_count}

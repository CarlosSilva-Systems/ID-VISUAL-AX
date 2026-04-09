"""
Serviço de justificativa de paradas Andon.

Contém as regras de negócio para:
- Determinar se um chamado requer justificativa
- Calcular o tempo de parada (downtime)
- Validar a categoria de causa raiz
"""
from datetime import datetime

ROOT_CAUSE_CATEGORIES: frozenset[str] = frozenset([
    "Máquina",
    "Material",
    "Mão de obra",
    "Método",
    "Meio ambiente",
])


def compute_requires_justification(color: str, is_stop: bool) -> bool:
    """
    Determina se um AndonCall requer justificativa.

    Regra de negócio:
    - RED sempre requer justificativa
    - YELLOW requer justificativa apenas se is_stop=True
    - Qualquer outra cor não requer justificativa
    """
    return color == "RED" or (color == "YELLOW" and is_stop)


def compute_downtime_minutes(created_at: datetime, resolved_at: datetime) -> int:
    """
    Calcula o tempo de parada em minutos inteiros (floor).

    Garante resultado >= 0 mesmo em caso de clock skew
    (resolved_at ligeiramente anterior a created_at).
    """
    delta_seconds = (resolved_at - created_at).total_seconds()
    return max(0, int(delta_seconds // 60))


def validate_root_cause_category(category: str) -> bool:
    """
    Valida que a categoria de causa raiz pertence ao conjunto permitido.

    Retorna True se válida, False caso contrário.
    """
    return category in ROOT_CAUSE_CATEGORIES

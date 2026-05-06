from typing import Dict

def map_mrp_state(state: str) -> Dict[str, str]:
    """
    Maps Odoo mrp.production state to UI labels and variants.
    """
    mappings = {
        "draft": {"label": "Rascunho", "variant": "secondary"},
        "confirmed": {"label": "Confirmado", "variant": "info"},
        "progress": {"label": "Em Produção", "variant": "warning"},
        "to_close": {"label": "A Encerrar", "variant": "warning"},
        "done": {"label": "Concluído", "variant": "success"},
        "cancel": {"label": "Cancelado", "variant": "destructive"},
    }
    return mappings.get(state, {"label": state.capitalize() if state else "Desconhecido", "variant": "outline"})

def map_product_category(category_id: int | None) -> str:
    """
    Mapeia o ID da categoria do produto do Odoo para nomes amigáveis.
    IDs fornecidos pelo usuário.
    """
    if category_id is None:
        return "N/A"
        
    mappings = {
        363: "Comando",
        364: "Distribuição",
        365: "Apartamento",
        366: "Centro de Medição",
        369: "Quadro Padrão de Incêndio",
        387: "Automação",
    }
    
    return mappings.get(category_id, "Outros")

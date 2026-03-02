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

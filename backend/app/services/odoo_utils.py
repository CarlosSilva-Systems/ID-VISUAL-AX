from typing import Any, Optional

def normalize_many2one_display(val: Any) -> Optional[str]:
    """
    Odoo many2one fields often return [id, name] or just False.
    This normalization ensures we get the string name if it exists.
    """
    if not val:
        return None
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        return str(val[1])
    return str(val)

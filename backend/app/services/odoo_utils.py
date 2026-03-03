import re
from typing import Any, Optional

def normalize_label(val: Any) -> str:
    """
    Normalizes Odoo labels (many2one, name_get, serialized strings).
    Handles:
    - [id, "name"] -> "name"
    - (id, "name") -> "name"
    - "(365, 'SEREN SAGÓ')" -> "SEREN SAGÓ"
    - None -> ""
    """
    if not val:
        return ""
    
    # Handle list or tuple directly
    if isinstance(val, (list, tuple)) and len(val) >= 2:
        return str(val[1])
    
    # If it's a string, it might be a serialized tuple "(id, 'name')"
    if isinstance(val, str):
        val = val.strip()
        # Look for pattern like (123, 'Name') or [123, "Name"]
        match = re.search(r'[\(\[]\d+,\s*[\'"]?(.+?)[\'"]?[\)\]]', val)
        if match:
            clean = match.group(1).strip()
            # Remove trailing ' or " if the regex was loose
            if clean.endswith("'") or clean.endswith('"'):
                clean = clean[:-1]
            return clean
        
        # General cleanup: remove multiple newlines/spaces
        return " ".join(val.split())
        
    return str(val)

def normalize_many2one_display(val: Any) -> Optional[str]:
    # Deprecated/Alias for backward compatibility if needed
    label = normalize_label(val)
    return label if label else None

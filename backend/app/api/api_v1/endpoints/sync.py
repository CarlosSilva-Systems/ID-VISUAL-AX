from fastapi import APIRouter, Depends
from datetime import datetime
import time

router = APIRouter()

# Global state for sync (simple implementation for now)
# In production, this would be tied to DB triggers or a cache layer like Redis
_sync_state = {
    "odoo_version": str(int(time.time())),
    "requests_version": str(int(time.time()))
}

def update_sync_version(key: str):
    _sync_state[key] = str(int(time.time()))

@router.get("/status")
async def get_sync_status():
    """
    Returns the current version/timestamp of different data domains.
    The frontend uses this to decide if a full fetch is needed.
    """
    return _sync_state

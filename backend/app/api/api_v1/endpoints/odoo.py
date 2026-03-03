from typing import Any, List
import traceback
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, col
from sqlmodel.ext.asyncio.session import AsyncSession

from app.services.odoo_client import OdooClient
from app.core.config import settings
from app.api import deps
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder

router = APIRouter()

async def get_odoo_client():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    try:
        yield client
    finally:
        await client.close()

@router.get("/mos", response_model=List[dict])
async def get_odoo_mos(
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    Fetch Manufacturing Orders (MOs) that have a pending 'Imprimir ID Visual' activity.
    AND pending Manual Requests from local DB.
    Sorted by activity deadline (urgency) and then date_start.
    """
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )

    try:
        # ── Step 1: Find 'Imprimir ID Visual' Activity Type ──
        activity_type_id = None
        try:
            type_domain = [['name', 'ilike', 'Imprimir ID Visual']]
            activity_types = await client.search_read('mail.activity.type', domain=type_domain, fields=['id'], limit=1)
            if activity_types:
                activity_type_id = activity_types[0]['id']
        except Exception as e:
            print(f"Warning: Failed to fetch activity type: {e}")

        # ── Step 2: Search Activities ──
        # Fallback to summary check if type not found
        domain = [['res_model', '=', 'mrp.production']]
        
        if activity_type_id:
            domain.append(['activity_type_id', '=', activity_type_id])
        else:
            domain.append(['summary', 'ilike', 'Imprimir ID Visual'])
            
        # Add date_deadline sorting
        activities = await client.search_read(
            'mail.activity',
            domain=domain,
            fields=['res_id', 'summary', 'date_deadline', 'activity_type_id', 'create_date'],
            order='date_deadline ASC, create_date ASC',
            limit=200
        )
        
        if not activities:
             return []

        # Deduplicate res_ids
        odoo_res_ids = []
        activity_map = {}
        for act in activities:
            rid = act['res_id']
            if rid not in activity_map:
                odoo_res_ids.append(rid)
                activity_map[rid] = act

        # ── Step 3: Fetch MO Details (Robust) ──
        # Base fields that should always exist
        safe_fields = ['id', 'name', 'state', 'product_qty', 'x_studio_nome_da_obra', 'origin']
        
        # Try to include date fields if possible, but don't crash if strictly not found (though search_read usually ignores unknowns in some versions, 
        # explicit request might fail in others. We'll try safe first).
        # Actually Odoo API usually ignores unknown fields in read, but let's be safe.
        # We will request them and strict Odoo might error if field doesn't exist.
        # Strategy: Try with date_start. If fails, try without.
        
        mo_domain = [['id', 'in', odoo_res_ids]]
        
        odoo_mos = []
        try:
            # Try preferred fields
            odoo_mos = await client.search_read(
                'mrp.production', 
                domain=mo_domain, 
                fields=safe_fields + ['date_start']
            )
        except Exception as e:
            print(f"Warning: Failed to fetch 'date_start', trying 'date_planned_start': {e}")
            try:
                odoo_mos = await client.search_read(
                    'mrp.production', 
                    domain=mo_domain, 
                    fields=safe_fields + ['date_planned_start']
                )
                # Normalize key
                for m in odoo_mos:
                    m['date_start'] = m.get('date_planned_start')
            except Exception as e2:
                 print(f"Warning: Failed to fetch date fields, fetching base only: {e2}")
                 odoo_mos = await client.search_read(
                    'mrp.production', 
                    domain=mo_domain, 
                    fields=safe_fields
                )

        # ── Step 4: Process & Merge ──
        final_list = []
        mo_map = {m['id']: m for m in odoo_mos}
        
        for rid in odoo_res_ids:
            mo = mo_map.get(rid)
            if not mo:
                continue
                
            act = activity_map[rid]
            
            # Standardize Output
            item = {
                "odoo_mo_id": mo.get('id'),
                "mo_number": mo.get('name', 'N/A'),
                "obra": mo.get('x_studio_nome_da_obra') or 'Sem Obra',
                "product_qty": mo.get('product_qty', 0),
                "date_start": mo.get('date_start'), # Can be None
                "state": mo.get('state', 'unknown'),
                "has_id_activity": True,
                "activity_summary": act.get('summary'),
                "activity_date_deadline": act.get('date_deadline'),
                "origin": mo.get('origin'),
                # Defaults for local decoration
                "source": "odoo",
                "from_production": False,
                "production_requester": None
            }
            final_list.append(item)

        # ── Step 5: Decorate with Transferred Manual Requests ──
        if odoo_res_ids:
            try:
                stmt = (
                    select(IDRequest)
                    .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
                    .where(
                        IDRequest.transferred_to_queue == True,
                        col(ManufacturingOrder.odoo_id).in_(odoo_res_ids)
                    )
                )
                # Need to join correctly. IDRequest.mo_id -> ManufacturingOrder.id. ManufacturingOrder.odoo_id is the link.
                # Optimized query
                transferred_requests = await session.exec(stmt)
                
                # Retrieve Odoo IDs for these requests to map back
                # Since we need to map odoo_id -> requester_name, we might need to fetch MO Odoo ID too.
                # Let's adjust query to select both.
                stmt_map = (
                    select(IDRequest.requester_name, ManufacturingOrder.odoo_id)
                    .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
                    .where(
                        IDRequest.transferred_to_queue == True,
                        col(ManufacturingOrder.odoo_id).in_(odoo_res_ids)
                    )
                )
                map_results = await session.exec(stmt_map)
                transferred_map = {odoo_id: name for name, odoo_id in map_results}

                for item in final_list:
                    if item["odoo_mo_id"] in transferred_map:
                        item["source"] = "producao"
                        item["from_production"] = True
                        item["production_requester"] = transferred_map[item["odoo_mo_id"]]
            except Exception as e:
                print(f"Warning: Failed to decorate with local requests: {e}")
                # Don't fail the whole request just for this decoration

        return final_list

    except Exception as e:
        error_type = type(e).__name__
        safe_msg = str(e).replace(settings.ODOO_PASSWORD, "***")
        logger.error(f"CRITICAL ODOO ERROR [{error_type}]: {safe_msg}")
        traceback.print_exc()
        
        # Se for um erro de timeout mesmo após retentativas
        if "Timeout" in error_type or "deadline" in safe_msg.lower():
            raise HTTPException(
                status_code=504,
                detail="O servidor Odoo demorou muito para responder. Por favor, tente novamente em alguns segundos."
            )
            
        raise HTTPException(
            status_code=502, 
            detail=f"Erro de Conectividade Odoo: {safe_msg}"
        )
    finally:
        await client.close()

import json
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional
from app.core.config import settings

# AsyncOpenAI via OpenRouter
from openai import AsyncOpenAI
import app.services.agent_tools as agent_tools
from app.services.mpr_analytics_service import MPRAnalyticsService
from app.services.odoo_client import OdooClient
from app.api.deps import get_session, get_odoo_client
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# --- Tool Execution Engine ---
async def execute_tool_call(tool_name: str, arguments: Dict[str, Any], session: AsyncSession, odoo: OdooClient) -> str:
    """Executes the dynamically requested tool and returns JSON string result."""
    try:
        if tool_name == "get_business_rules":
            termo = arguments.get("termo", "")
            return json.dumps({"result": agent_tools.resolve_business_rule(termo)})
        
        elif tool_name == "get_kpi_summary":
            start = datetime.fromisoformat(arguments.get("period_start", (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()))
            end = datetime.fromisoformat(arguments.get("period_end", datetime.now(timezone.utc).isoformat()))
            data = await MPRAnalyticsService.get_kpis_resumo(session, start, end)
            return json.dumps({"status": "success", "data": data})

        elif tool_name == "get_andon_history":
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
            end_date = datetime.now(timezone.utc)
            data = await MPRAnalyticsService.get_ranking_workcenters(session, start_date, end_date)
            return json.dumps({"status": "success", "workcenter_ranking": data})
        
        elif tool_name == "get_retrabalho_analysis":
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
            end_date = datetime.now(timezone.utc)
            data = await MPRAnalyticsService.get_motivos_revisao(session, start_date, end_date)
            return json.dumps({"status": "success", "motivos_revisao": data})
        
        elif tool_name == "get_id_details":
            return json.dumps({"status": "info", "message": "Funcionalidade de detalhamento de ID via Chat em implementação."})
        
        elif tool_name == "get_obra_status":
            try:
                obra_id = arguments.get("obra_id", "")
                res = await odoo.search_read(
                    "mrp.production", 
                    domain=[["x_studio_nome_da_obra", "ilike", obra_id]], 
                    fields=["name", "state", "product_qty", "date_start"],
                    limit=5
                )
                return json.dumps({"status": "success", "found_mos": res})
            except Exception as oe:
                logger.error(f"Odoo Tool Error: {oe}")
                return json.dumps({"error": f"Erro ao acessar Odoo: {str(oe)}"})
        
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as e:
        logger.error(f"Tool Execution Error: {e}")
        return json.dumps({"error": f"Error executing {tool_name}: {str(e)}"})

# --- SSE Stream Logic ---
@router.post("/chat")
async def chat_stream(
    request: ChatRequest,
    session: AsyncSession = Depends(get_session),
    odoo: OdooClient = Depends(get_odoo_client)
):
    """
    Recebe as mensagens, chama o modelo openai/gpt-4o-mini, 
    resolve tools localmente e retorna SSE text chunks.
    """
    messages_payload = [{"role": "system", "content": "Você é o ID Visual Co-pilot, assistente de engenharia lean no chão de fábrica."}]
    messages_payload.extend([{"role": m.role, "content": m.content} for m in request.messages])

    async def event_generator():
        try:
            client = AsyncOpenAI(api_key=settings.OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
            
            # 1. Call OpenRouter
            response = await client.chat.completions.create(
                model="openai/gpt-4o-mini",
                messages=messages_payload,
                tools=agent_tools.TOOLS_LIST,
                tool_choice="auto",
                stream=True
            )

            tool_calls_buffer = {}
            
            async for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue

                # Normal Text Streaming
                if delta.content:
                    yield f"data: {json.dumps({'content': delta.content})}\n\n"

                # Tool Calls Streaming Buffering
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.index not in tool_calls_buffer:
                            tool_calls_buffer[tc.index] = {
                                "id": tc.id, 
                                "type": "function", 
                                "function": {"name": tc.function.name, "arguments": ""}
                            }
                        if tc.function.arguments:
                            tool_calls_buffer[tc.index]["function"]["arguments"] += tc.function.arguments

            # 2. Check if we need to execute tools
            if tool_calls_buffer:
                # Add initial assistant message with tool_calls
                messages_payload.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": list(tool_calls_buffer.values())
                })

                # Execute all requested tools
                for index, tc_data in tool_calls_buffer.items():
                    func_name = tc_data["function"]["name"]
                    func_args = json.loads(tc_data["function"]["arguments"])
                    
                    yield f"data: {json.dumps({'content': f'\\n> Executando ferramenta sistêmica: `{func_name}`...\\n'})}\n\n"
                    
                    tool_result = await execute_tool_call(func_name, func_args, session, odoo)
                    
                    messages_payload.append({
                        "tool_call_id": tc_data["id"],
                        "role": "tool",
                        "name": func_name,
                        "content": tool_result
                    })

                # 3. Request final answer from OpenRouter with the tool results
                second_response = await client.chat.completions.create(
                    model="openai/gpt-4o-mini",
                    messages=messages_payload,
                    stream=True
                )

                async for chunk in second_response:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        yield f"data: {json.dumps({'content': delta.content})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.exception("Chat Stream Error")
            yield f"data: {json.dumps({'error': 'Erro interno de processamento.'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

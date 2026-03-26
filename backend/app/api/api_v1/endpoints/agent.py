import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from app.core.config import settings

# AsyncOpenAI via OpenRouter
from openai import AsyncOpenAI
import app.services.agent_tools as agent_tools
from app.services.mpr_analytics_service import MPRAnalyticsService
from app.services.odoo_client import OdooClient
from app.db.session import async_session_factory
from datetime import datetime, timezone, timedelta

router = APIRouter()

# Instantiate OpenRouter client
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.OPENROUTER_API_KEY,
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# --- Tool Execution Engine ---
async def execute_tool_call(tool_name: str, arguments: Dict[str, Any]) -> str:
    """Executes the dynamically requested tool and returns JSON string result."""
    try:
        async with async_session_factory() as session:
            if tool_name == "get_business_rules":
                termo = arguments.get("termo", "")
                return json.dumps({"result": agent_tools.resolve_business_rule(termo)})
            
            elif tool_name == "get_kpi_summary":
                # Real implementation
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
                # Placeholder for direct ID search if needed
                return json.dumps({"status": "info", "message": "Funcionalidade de detalhamento de ID via Chat em implementação."})
            
            elif tool_name == "get_obra_status":
                # Consulta real no Odoo
                try:
                    odoo = OdooClient(
                        url=settings.ODOO_URL, db=settings.ODOO_DB, 
                        auth_type="jsonrpc_password", login=settings.ODOO_LOGIN, 
                        secret=settings.ODOO_PASSWORD
                    )
                    obra_id = arguments.get("obra_id", "")
                    res = await odoo.search_read(
                        "mrp.production", 
                        domain=[["x_studio_nome_da_obra", "ilike", obra_id]], 
                        fields=["name", "state", "product_qty", "date_start"],
                        limit=5
                    )
                    await odoo.close()
                    return json.dumps({"status": "success", "found_mos": res})
                except Exception as oe:
                    return json.dumps({"error": f"Erro Odoo: {str(oe)}"})
            
            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as e:
        return json.dumps({"error": f"Error executing {tool_name}: {str(e)}"})

# --- SSE Stream Logic ---
@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    Recebe as mensagens, chama o modelo openai/gpt-4o-mini, 
    resolve tools localmente e retorna SSE text chunks.
    """
    messages_payload = [{"role": "system", "content": "Você é o ID Visual Co-pilot, assistente de engenharia lean no chão de fábrica."}]
    messages_payload.extend([{"role": m.role, "content": m.content} for m in request.messages])

    async def event_generator():
        try:
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
                            tool_calls_buffer[tc.index] = {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": ""}}
                        if tc.function.arguments:
                            tool_calls_buffer[tc.index]["function"]["arguments"] += tc.function.arguments

            # 2. Check if we need to execute tools
            if tool_calls_buffer:
                # Add initial assistant mesage with tool_calls
                messages_payload.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": list(tool_calls_buffer.values())
                })

                # Execute all requested tools
                for index, tc_data in tool_calls_buffer.items():
                    func_name = tc_data["function"]["name"]
                    func_args = json.loads(tc_data["function"]["arguments"])
                    
                    tool_msg = "\n> Executando ferramenta sistêmica: `" + func_name + "`...\n"
                    yield f"data: {json.dumps({'content': tool_msg})}\n\n"
                    
                    tool_result = await execute_tool_call(func_name, func_args)
                    
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
            # Error handling yielding generic error to client
            yield f"data: {json.dumps({'error': 'Internal reasoning error.'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

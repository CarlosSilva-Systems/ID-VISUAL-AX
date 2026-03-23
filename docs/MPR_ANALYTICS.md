# MPR Analytics - Documentação da Funcionalidade

## Objetivo
O módulo **MPR Analytics** fornece um painel gerencial avançado para acompanhar a performance, gargalos, tempos médios e impacto (OEE) de Identidades Visuais em relação à fabricação e ordens do Odoo. Desenvolvido para transformar "Fabricações" em um ecossistema auto-polsable (WIP ativo) de visualização.

## Estrutura do Backend
O Backend Analytics (desenvolvido através da API FastAPI / SQLModel) abarca:
- **`FabricacaoBlock`**, **`RevisaoIDVisual`**, e **`MPRConfig`**: Modelos de rastreio granulares para atrasos, SLAs e retrabalho.
- **Service Layer (`MPRAnalyticsService`)**: Provê agregações SQL-level para KPIs (ex: Volume por período, Ciclo, Ranking), garantindo o filtro nulo e performance.
- **`endpoints/mpr_analytics.py`**: Todos os endpoints consumidos pelo Front. Cada endpoint roda sob tipagem rígida pelo `schemas/mpr_analytics.py` e validação de `Timezone UTC` (Z no ISO 8601).
- **Gatilhos Automáticos (Idempotência)**: As atualizações das IDs no Endpoint Mestre injetam nativamente o relógio `iniciado_em`, `entregue_em` e `concluido_em` abstraindo toques manuais.
- **Backfill**: Scripts `/backend/scripts/backfill_mpr_timestamps.py` retroativamente normalizam dados de produção sem invencionices (`iniciado_em` nulos preservados para descarte estatístico).

## Estrutura do Frontend
Construído sobre React Hooks, Tailwind e Recharts:
- **`MPRFilterBar`**: Barra de filtro mestra global, disparando requisições e persistindo o estado ao Dashboard para sincronizar Gráficos e APIs.
- **`MPRKPICards`**: Lógica de "SLA Breached" visual de cartões coloridos.
- **`MPRFilaAtivaTable`**: Polling de 60s trazendo IDs (`WIP`) e destacando prazos Aging superiores a 24h.
- **`MPRGraphs`**: Grid modular responsivo usando a abstração Recharts para Pizza, Linha Composta e Barras categorizadas.
- **Exportação CSV**: Botão nativo para extrair os sumários de KPI do Filter selecionado diretamente para o gestor.

## Implantação e Contrato de Uso
É imprescindível para o Frontend sempre rodar a `MPRFilterBar` despachando requests com ISO-8601 (terminando em "Z") para acionar corretamente o parser FastAPI/PostgreSQL UTC e mitigar desvios de Timezone Odoo.

## Testes
Rodar `pytest` para checagem da segurança das rotas (Requires Auth nos endpoints do router Analytics), e `vitest` no frontend para asserção UI dos limites SLA dos Cards.

# Product: ID Visual AX

ID Visual AX is a manufacturing operations management system that integrates with Odoo ERP. It manages the lifecycle of "ID Visual" labels/documents for manufacturing orders (MOs), tracking their production through a 5S task workflow.

## Core Concepts

- **Batch (Lote)**: A group of manufacturing orders processed together. Statuses: `ativo`, `concluido`, `finalizado`, `cancelado`.
- **IDRequest**: A request to produce an ID Visual for a specific MO. Linked to a Batch.
- **IDRequestTask**: Individual 5S workflow tasks per IDRequest (e.g., `DOCS_Epson`, `QA_FINAL`). Statuses: `nao_iniciado`, `montado`, `impresso`, `bloqueado`, `nao_aplicavel`.
- **Andon**: Real-time factory floor alert system (yellow/red calls) with TV display mode.
- **MPR Analytics**: Production analytics and reporting dashboard.

## Domain Language

The UI and much of the codebase uses Brazilian Portuguese. Status values, field names, and user-facing strings are in pt-BR (e.g., `ativo`, `concluido`, `nao_iniciado`). Code identifiers (functions, variables, classes) are in English.

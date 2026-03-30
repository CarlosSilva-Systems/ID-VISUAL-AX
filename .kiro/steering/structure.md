# Project Structure

## Repository Layout

```
/
├── backend/          # FastAPI application
├── frontend/         # React/Vite application
├── docs/             # Project documentation
├── docker-compose.yml
└── .env / .env.example
```

## Backend (`backend/`)

```
backend/
├── app/
│   ├── api/
│   │   └── api_v1/
│   │       ├── api.py              # Router aggregation — all routers registered here
│   │       └── endpoints/          # One file per resource (batches, andon, auth, etc.)
│   ├── core/
│   │   ├── config.py               # Pydantic Settings — all env vars loaded here
│   │   └── security.py             # JWT helpers
│   ├── db/
│   │   └── session.py              # Async engine, session factory, init_db()
│   ├── models/                     # SQLModel table models (one file per domain entity)
│   ├── schemas/                    # Pydantic request/response schemas (not DB tables)
│   ├── services/                   # Business logic, Odoo client, external integrations
│   └── main.py                     # FastAPI app factory, middleware, lifespan
├── alembic/                        # DB migrations
│   └── versions/
├── scripts/                        # One-off utility scripts
└── pyproject.toml
```

### Backend Conventions

- All endpoints are `async`. Use `AsyncSession` from `sqlmodel.ext.asyncio.session`.
- Dependency injection via `app.api.deps` (e.g., `Depends(deps.get_session)`).
- Models live in `app/models/`, response/request shapes in `app/schemas/`.
- Business logic belongs in `app/services/`, not in endpoint handlers.
- Enum string values use pt-BR (e.g., `"ativo"`, `"concluido"`).
- UUIDs are used as primary keys (`uuid.uuid4()`).
- Optimistic locking via a `version` integer field on mutable task records.
- After mutating data that affects sync state, call `update_sync_version()`.

## Frontend (`frontend/`)

```
frontend/src/
├── app/
│   ├── App.tsx                     # Root component, routing, auth state
│   ├── components/                 # Page-level and feature components
│   │   └── ui/                     # Reusable UI primitives (shadcn-style)
│   ├── contexts/
│   │   └── DataContext.tsx         # Global data provider (wrap app-wide state)
│   ├── pages/                      # Route-level page components
│   └── types.ts                    # Shared TypeScript types for this app
├── components/                     # Shared cross-feature components (e.g., ActiveBatch)
├── services/
│   └── api.ts                      # Centralized API client — all fetch calls go here
├── lib/
│   └── utils.ts                    # Utility helpers (cn(), etc.)
├── types/                          # Additional shared types
└── styles/                         # Global CSS, Tailwind, theme vars
```

### Frontend Conventions

- All API calls go through `src/services/api.ts`. Do not use `fetch` directly in components.
- Auth token stored in `localStorage` as `id_visual_token`, sent as `Bearer` header.
- Routes are defined in `App.tsx`. Protected routes check `isAuthenticated`.
- Use `sonner` (`toast`) for user notifications, not `alert()` or custom modals.
- `@` alias resolves to `frontend/src/`.
- UI strings shown to users are in pt-BR.
- Component files use PascalCase; utility/service files use camelCase.

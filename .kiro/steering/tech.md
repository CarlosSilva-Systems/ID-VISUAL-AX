# Tech Stack

## Backend

- **Runtime**: Python 3.11+
- **Framework**: FastAPI with async/await throughout
- **ORM**: SQLModel (built on SQLAlchemy + Pydantic)
- **Database**: PostgreSQL (async via `asyncpg`); SQLite supported for local dev
- **Migrations**: Alembic — uses sync driver (strips `+asyncpg` from URL for migration runs)
- **Auth**: JWT via `python-jose`, passwords via `passlib[bcrypt]`
- **Task Queue**: Celery + Redis
- **Rate Limiting**: `slowapi`
- **AI/Agent**: OpenAI-compatible client via `openai` SDK (routed through OpenRouter)
- **Odoo Integration**: Custom `OdooClient` using JSON-RPC over HTTP (`httpx`)
- **Package Manager**: `uv` (see `pyproject.toml`)

## Frontend

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- **UI Components**: MUI v7 + Radix UI primitives + shadcn-style components
- **Routing**: React Router v7
- **Charts**: Recharts
- **Forms**: React Hook Form
- **Notifications**: Sonner (toasts)
- **Drag & Drop**: react-dnd
- **Package Manager**: npm (lockfile present); pnpm overrides defined for vite

## Infrastructure

- **Containerization**: Docker Compose (services: `db`, `redis`, `api`, `worker`, `frontend`)
- **API base URL**: `/api/v1` — configured via `VITE_API_URL` env var, defaults to `http://localhost:8000/api/v1`
- **Dev proxy**: Vite proxies `/api` → `http://api:8000` in Docker

## Common Commands

### Backend (run from `backend/`)
```bash
# Install dependencies
uv sync

# Run dev server
uvicorn app.main:app --reload --port 8000

# Run migrations
alembic upgrade head

# Create a new migration
alembic revision --autogenerate -m "description"

# Run tests
pytest
```

### Frontend (run from `frontend/`)
```bash
# Install dependencies
npm install

# Dev server
npm run dev

# Production build
npm run build
```

### Docker (run from repo root)
```bash
# Start all services
docker compose up

# Rebuild after dependency changes
docker compose up --build
```

## Environment Variables

Key variables (see `.env.example`):
- `DATABASE_URL` or individual `POSTGRES_*` vars
- `SECRET_KEY`, `ENCRYPTION_KEY`, `ODOO_WEBHOOK_SECRET` — must be changed from defaults before production
- `ODOO_URL`, `ODOO_DB`, `ODOO_LOGIN`, `ODOO_PASSWORD`
- `OPENROUTER_API_KEY`
- `VITE_API_URL` (frontend)

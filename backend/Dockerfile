# =============================================================================
# Backend Dockerfile — Multi-stage build para produção
# Estágio 1 (builder): compila dependências com uv (mais rápido que pip)
# Estágio 2 (runtime): imagem mínima sem ferramentas de build
# =============================================================================

# ── Estágio 1: Builder ────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Dependências de sistema necessárias apenas para compilação
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instala uv — gerenciador de pacotes ultrarrápido
RUN pip install --no-cache-dir uv

# Cria ambiente virtual isolado
RUN uv venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copia somente os arquivos de dependências primeiro
# (melhor aproveitamento do cache de layers)
COPY pyproject.toml README.md ./

# Instala as dependências do projeto via uv
RUN uv pip install --no-cache-dir .

# ── Estágio 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

# Somente bibliotecas de runtime do sistema (sem ferramentas de build)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia o ambiente virtual pronto do estágio builder
COPY --from=builder /opt/venv /opt/venv

# Copia o código da aplicação (muda com frequência — fica por último)
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
# Scripts utilitários (seed, migrações manuais, etc.)
COPY scripts/ ./scripts/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

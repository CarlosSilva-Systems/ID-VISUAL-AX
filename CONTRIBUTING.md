# Guia de Contribuição — ID Visual AX

Guia para desenvolvedores que vão trabalhar neste projeto.

---

## Sumário

- [Configuração do Ambiente](#configuração-do-ambiente)
- [Fluxo de Trabalho Git](#fluxo-de-trabalho-git)
- [Padrões de Código](#padrões-de-código)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Testes](#testes)
- [Convenções de Commit](#convenções-de-commit)

---

## Configuração do Ambiente

### Pré-requisitos

- Docker Engine 24.0+ e Docker Compose 2.20+
- Python 3.11+ com `uv` para desenvolvimento local do backend
- Node.js 20+ e npm para desenvolvimento local do frontend
- PlatformIO (extensão VS Code) para o firmware ESP32
- Git

### Setup inicial

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd id_visual_2

# 2. Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com os valores reais (não commitar!)

cp backend/.env.example backend/.env
# Editar backend/.env com os valores reais

# 3. Subir a stack completa com Docker
docker compose up -d --build

# 4. Rodar as migrações do banco
docker compose exec api alembic upgrade head

# 5. Acessar o sistema
# Frontend: http://localhost:5173
# API docs (Swagger): http://localhost:8000/docs
# MQTT broker: localhost:1883
```

### Desenvolvimento local (sem Docker)

**Backend:**
```bash
cd backend
uv sync
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

> O frontend em dev aponta para `http://localhost:8000` via variável `VITE_API_URL`. Certifique-se de que o backend está rodando antes de iniciar o frontend.

---

## Fluxo de Trabalho Git

1. Sempre trabalhe em uma branch separada, nunca na `main` diretamente.
2. Crie a branch a partir da `main` atualizada:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/minha-feature
   ```
3. Faça commits atômicos e frequentes conforme o trabalho avança.
4. Abra um PR após finalizar e revisar o próprio trabalho.
5. O merge na `main` deve acontecer apenas após revisão.

### Branches

| Prefixo | Uso |
|---|---|
| `feat/` | Nova funcionalidade |
| `fix/` | Correção de bug |
| `refactor/` | Refatoração sem mudança de comportamento |
| `chore/` | Tarefas de manutenção (deps, configs) |
| `docs/` | Apenas documentação |

---

## Padrões de Código

### Backend (Python)

- Todos os endpoints são `async`. Use `AsyncSession` e `await` em todas as operações de I/O.
- Dependency injection via `app.api.deps` — use `Depends(deps.get_session)` para o banco.
- Lógica de negócio pertence a `app/services/`, não aos handlers de endpoint.
- Modelos de banco em `app/models/`, schemas Pydantic em `app/schemas/`.
- Use Type Hints completos. Proibido `Any` ou ausência de tipo.
- Nunca faça log de senhas, tokens ou valores de variáveis sensíveis.
- Mensagens de erro retornadas ao cliente devem ser genéricas (use `request_id` para rastreabilidade).

```python
# ✅ Correto
@router.get("/items", response_model=list[ItemResponse])
async def list_items(
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.get_current_user),
) -> list[ItemResponse]:
    return await item_service.list_items(session)

# ❌ Errado — lógica de negócio no endpoint, tipo ausente
@router.get("/items")
async def list_items(session = Depends(deps.get_session)):
    items = await session.exec(select(Item))
    return items.all()
```

### Frontend (TypeScript)

- Todas as chamadas de API passam por `src/services/api.ts`. Nunca use `fetch` diretamente em componentes.
- Proibido `any`. Crie interfaces ou types precisos para todas as estruturas.
- Use `sonner` (`toast`) para notificações ao usuário.
- Strings visíveis ao usuário devem estar em pt-BR.
- Arquivos de componente em PascalCase (`UserCard.tsx`), utilitários em camelCase (`formatDate.ts`).
- O alias `@` resolve para `frontend/src/`.

```typescript
// ✅ Correto
interface BatchSummary {
  id: string;
  name: string;
  status: "ativo" | "concluido" | "finalizado" | "cancelado";
  createdAt: string;
}

// ❌ Errado
const data: any = await fetch('/api/v1/batches');
```

### Hardware (C++/Arduino)

- Todas as constantes de configuração ficam em `hardware/include/config.h`. Nunca hardcode valores no código.
- Nunca use `delay()` no loop principal — use `millis()` para temporizações não-bloqueantes.
- Atualizar `FIRMWARE_VERSION` a cada release.
- Documentar qualquer mudança de comportamento nos arquivos relevantes em `hardware/docs/`.

---

## Estrutura do Projeto

```
/
├── backend/          # FastAPI — API REST + serviços MQTT/WebSocket
├── frontend/         # React 18 + TypeScript + Vite
├── hardware/         # Firmware ESP32 em C++/PlatformIO
├── agents/
│   └── print_agent/  # Script Python para impressão Zebra (roda no PC da fábrica)
├── mosquitto/        # Configuração do broker MQTT
├── docs/             # Documentação estruturada (ver docs/README.md)
├── CHANGELOG.md      # Histórico de versões
├── CONTRIBUTING.md   # Este arquivo
└── docker-compose.yml
```

Veja [.kiro/steering/structure.md](.kiro/steering/structure.md) para a estrutura detalhada de backend e frontend.

---

## Testes

### Backend

```bash
cd backend

# Rodar todos os testes
pytest

# Rodar com cobertura
pytest --cov=app --cov-report=term-missing

# Rodar um arquivo específico
pytest tests/test_andon.py -v
```

Os testes usam banco SQLite em memória por padrão. Não é necessário ter PostgreSQL rodando para executar os testes unitários.

### Frontend

```bash
cd frontend

# Rodar testes (modo run, sem watch)
npm run test -- --run

# Rodar com cobertura
npm run coverage
```

### Integração manual

Use o Swagger UI em `http://localhost:8000/docs` para testar endpoints manualmente. Consulte [docs/guides/TESTING_GUIDE.md](docs/guides/TESTING_GUIDE.md) para cenários de teste específicos.

---

## Convenções de Commit

Este projeto usa [Conventional Commits](https://www.conventionalcommits.org/) com mensagens em **pt-BR**.

```
tipo(escopo): descrição curta no imperativo

[corpo opcional — explica o porquê, não o como]

[rodapé opcional — breaking changes, closes #issue]
```

### Tipos

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração (sem mudança de comportamento externo) |
| `docs` | Apenas documentação |
| `chore` | Manutenção (deps, configs, CI) |
| `style` | Formatação, linting (sem mudança de lógica) |
| `test` | Adição ou correção de testes |
| `perf` | Melhoria de performance |

### Escopos comuns

`api`, `frontend`, `firmware`, `andon`, `ota`, `auth`, `odoo`, `db`, `mqtt`, `docker`, `deps`, `docs`

### Exemplos

```
feat(andon): adiciona suporte a botão extra no controlador ESP32

fix(api): corrige race condition no handler de pausa MQTT

refactor(frontend): extrai lógica de polling para hook customizado

docs(deployment): atualiza guia de nginx com configuração de websocket

chore(deps): atualiza FastAPI para 0.111.0

feat(ota): implementa rollback automático após falha de boot
```

### Breaking Changes

```
feat(auth)!: renomeia ODOO_LOGIN para ODOO_SERVICE_LOGIN

BREAKING CHANGE: variáveis de ambiente renomeadas.
Ver docs/guides/MIGRATION_GUIDE.md para o guia de migração.
```

---

## Variáveis de Ambiente

Nunca commite arquivos `.env` com valores reais. Use sempre o `.env.example` como template.

Ao adicionar uma nova variável de ambiente:
1. Adicione ao `.env.example` com valor de exemplo e comentário explicativo
2. Documente no `backend/app/core/config.py` com o tipo correto
3. Se for crítica para o startup, adicione à validação em `backend/app/main.py`

---

## Dúvidas Frequentes

**Como adicionar um novo endpoint?**
1. Crie o arquivo em `backend/app/api/api_v1/endpoints/meu_modulo.py`
2. Crie o schema em `backend/app/schemas/meu_modulo.py`
3. Registre o router em `backend/app/api/api_v1/api.py`

**Como adicionar uma migration de banco?**
```bash
cd backend
alembic revision --autogenerate -m "feat: adiciona tabela x"
# Revisar o arquivo gerado em alembic/versions/
alembic upgrade head
```

**Como testar o sistema OTA localmente?**
Veja [docs/guides/OTA_TROUBLESHOOTING.md](docs/guides/OTA_TROUBLESHOOTING.md).

**Como configurar o webhook do Odoo?**
Veja [docs/guides/ODOO_WEBHOOK_SETUP.md](docs/guides/ODOO_WEBHOOK_SETUP.md).

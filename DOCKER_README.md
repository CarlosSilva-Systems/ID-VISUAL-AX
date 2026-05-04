# Docker - Guia Rápido

## TL;DR

```bash
# Desenvolvimento (sem hot-reload no Windows/OneDrive)
docker compose up -d

# Produção (Linux)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Desenvolvimento

### Windows com OneDrive (Recomendado)

Se o projeto está em uma pasta sincronizada pelo OneDrive, **mantenha o `docker-compose.override.yml` desabilitado**:

```bash
# O arquivo já está como .disabled
# Subir containers (código fica dentro do container)
docker compose up -d

# Ver logs
docker compose logs -f

# Rebuild após mudanças no código
docker compose up -d --build
```

**Tradeoff**: Sem hot-reload. Mudanças no código exigem rebuild.

### Linux/Mac ou Windows fora do OneDrive

Se quiser hot-reload (HMR do Vite e reload do FastAPI):

```bash
# Habilitar override
mv docker-compose.override.yml.disabled docker-compose.override.yml

# Subir containers (código via bind mount)
docker compose up -d

# Mudanças no código refletem automaticamente!
```

## Produção

Ver documentação completa em [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
# Build e deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Rodar migrações
docker compose exec api alembic upgrade head

# Ver logs
docker compose logs -f api
```

## Comandos Úteis

```bash
# Parar tudo
docker compose down

# Parar e remover volumes (CUIDADO: apaga banco!)
docker compose down -v

# Rebuild específico
docker compose build frontend
docker compose up -d frontend

# Entrar em um container
docker compose exec api bash
docker compose exec frontend sh

# Ver uso de recursos
docker stats

# Limpar tudo (CUIDADO)
docker system prune -a
```

## Arquivos Docker

- `docker-compose.yml` - Configuração base (dev + prod)
- `docker-compose.override.yml` - Hot-reload para dev (opcional)
- `docker-compose.prod.yml` - Otimizações para produção
- `backend/Dockerfile` - Imagem da API (FastAPI)
- `frontend/Dockerfile` - Imagem do frontend (Vite)
- `mosquitto/Dockerfile` - Imagem do MQTT broker

## Troubleshooting

### Erro "EIO: i/o error" no frontend

**Causa**: Problema do Docker Desktop com OneDrive no Windows.

**Solução**:
```bash
# Desabilitar bind mounts
mv docker-compose.override.yml docker-compose.override.yml.disabled
docker compose down
docker compose up -d --build
```

### Container não inicia

```bash
# Ver logs detalhados
docker compose logs <service-name>

# Exemplo
docker compose logs api
docker compose logs frontend
```

### Porta já em uso

```bash
# Ver o que está usando a porta
netstat -ano | findstr :8000  # Windows
lsof -i :8000                 # Linux/Mac

# Mudar porta no docker-compose.yml
ports:
  - "8001:8000"  # host:container
```

### Banco de dados corrompido

```bash
# Resetar banco (CUIDADO: apaga dados!)
docker compose down -v
docker compose up -d db
# Aguardar inicialização
docker compose exec api alembic upgrade head
docker compose up -d
```

## Documentação Adicional

- [Deployment Completo](docs/DEPLOYMENT.md) - Guia de produção
- [Estratégia Docker](docs/DOCKER_STRATEGY.md) - Por que Docker Compose?
- [Tech Stack](. kiro/steering/tech.md) - Tecnologias usadas
- [Estrutura do Projeto](.kiro/steering/structure.md) - Organização do código

## Por que Docker?

Docker Compose é ideal para ID Visual AX porque:

✅ **Simplicidade** - Um comando para subir toda a stack  
✅ **Portabilidade** - Funciona em qualquer servidor Linux  
✅ **Isolamento** - Cada serviço em container separado  
✅ **Edge Computing** - Perfeito para chão de fábrica  
✅ **Custo Zero** - Open-source, sem licenças  

Ver análise completa em [`docs/DOCKER_STRATEGY.md`](docs/DOCKER_STRATEGY.md).

# Guia de Deploy - ID Visual AX

## Visão Geral

Este documento descreve as melhores práticas para deploy da aplicação ID Visual AX em ambiente de produção.

## Estratégia Recomendada: Docker Compose

**Sim, Docker é a melhor forma de rodar esta aplicação em produção**, pelos seguintes motivos:

### ✅ Vantagens do Docker para este Projeto

1. **Isolamento de Dependências**: Python 3.11, Node 20, PostgreSQL, Redis e Mosquitto MQTT isolados
2. **Portabilidade**: Funciona identicamente em qualquer servidor Linux
3. **Facilidade de Deploy**: Um único comando para subir toda a stack
4. **Rollback Simples**: Voltar para versão anterior é trivial
5. **Consistência Dev/Prod**: Mesmo ambiente em desenvolvimento e produção
6. **Gestão de Recursos**: Fácil limitar CPU/memória por serviço
7. **Escalabilidade**: Preparado para migrar para Kubernetes se necessário

### ⚠️ Considerações

- Para **alta disponibilidade** ou **múltiplas instâncias**, considere Kubernetes
- Para **cargas muito altas**, considere serviços gerenciados (RDS, ElastiCache, etc.)
- Para **edge computing** (chão de fábrica), Docker Compose é ideal

## Ambientes

### Desenvolvimento (Windows/Mac/Linux)

```bash
# Usa docker-compose.override.yml automaticamente (hot-reload)
docker compose up -d

# Se tiver problemas com bind mounts no Windows (OneDrive):
# Renomeie ou delete docker-compose.override.yml
mv docker-compose.override.yml docker-compose.override.yml.disabled
docker compose up -d --build
```

### Produção (Linux recomendado)

```bash
# Usa apenas docker-compose.yml + docker-compose.prod.yml
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Pré-requisitos de Produção

### Hardware Mínimo Recomendado

- **CPU**: 4 cores (2 cores mínimo)
- **RAM**: 8 GB (4 GB mínimo)
- **Disco**: 50 GB SSD (20 GB mínimo)
- **Rede**: 100 Mbps (para comunicação MQTT com ESP32s)

### Software

- **SO**: Ubuntu 22.04 LTS ou Debian 12 (recomendado)
- **Docker Engine**: 24.0+ 
- **Docker Compose**: 2.20+

```bash
# Instalar Docker no Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

## Checklist de Deploy

### 1. Preparar o Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y git curl ufw

# Configurar firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 1883/tcp  # MQTT
sudo ufw enable
```

### 2. Clonar o Repositório

```bash
cd /opt
sudo git clone https://github.com/seu-usuario/id_visual_2.git
cd id_visual_2
```

### 3. Configurar Variáveis de Ambiente

```bash
# Copiar template
cp .env.example .env

# CRÍTICO: Editar e alterar TODAS as senhas e secrets
nano .env
```

**Variáveis OBRIGATÓRIAS para alterar:**

```bash
# Segurança (NUNCA use os valores de exemplo!)
SECRET_KEY=<gerar com: openssl rand -hex 32>
ENCRYPTION_KEY=<gerar com: openssl rand -base64 32>
ODOO_WEBHOOK_SECRET=<gerar com: openssl rand -hex 32>

# Banco de Dados
POSTGRES_PASSWORD=<senha forte>
POSTGRES_USER=idvisual_prod
POSTGRES_DB=idvisual_production

# Redis
REDIS_PASSWORD=<senha forte>

# Odoo
ODOO_URL=https://sua-empresa.odoo.com
ODOO_DB=sua-base-producao
ODOO_LOGIN=usuario@empresa.com
ODOO_PASSWORD=<senha do Odoo>

# OpenRouter (para agente AI)
OPENROUTER_API_KEY=<sua chave>

# MQTT (se exposto publicamente)
MQTT_USERNAME=<usuario>
MQTT_PASSWORD=<senha forte>
```

### 4. Build e Deploy

```bash
# Build das imagens
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Subir os serviços
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verificar logs
docker compose logs -f

# Verificar saúde dos containers
docker compose ps
```

### 5. Inicializar Banco de Dados

```bash
# Rodar migrações
docker compose exec api alembic upgrade head

# (Opcional) Popular dados iniciais
docker compose exec api python -m app.initial_data
```

### 6. Verificar Funcionamento

```bash
# Health check da API
curl http://localhost:8000/api/v1/health

# Verificar frontend
curl http://localhost:5173

# Verificar MQTT
docker compose logs mosquitto
```

## Configuração de Reverse Proxy (Nginx)

Para expor a aplicação na porta 80/443 com SSL:

```bash
# Instalar Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/idvisual
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    # Redirecionar para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (se necessário)
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Ativar site
sudo ln -s /etc/nginx/sites-available/idvisual /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obter certificado SSL
sudo certbot --nginx -d seu-dominio.com
```

## Monitoramento

### Logs

```bash
# Todos os serviços
docker compose logs -f

# Serviço específico
docker compose logs -f api
docker compose logs -f frontend

# Últimas 100 linhas
docker compose logs --tail=100 api
```

### Recursos

```bash
# Uso de CPU/RAM por container
docker stats

# Espaço em disco
docker system df
```

### Health Checks

Adicionar ao `docker-compose.prod.yml`:

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Backup

### Banco de Dados

```bash
# Backup manual
docker compose exec db pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar
docker compose exec -T db psql -U ${POSTGRES_USER} ${POSTGRES_DB} < backup_20240504_120000.sql
```

### Backup Automatizado (Cron)

```bash
# Criar script de backup
sudo nano /opt/scripts/backup_idvisual.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/idvisual"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup do banco
docker compose -f /opt/id_visual_2/docker-compose.yml exec -T db \
  pg_dump -U idvisual_prod idvisual_production > $BACKUP_DIR/db_$DATE.sql

# Backup dos volumes
docker run --rm -v id_visual_2_postgres_data:/data -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/volumes_$DATE.tar.gz /data

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

```bash
# Tornar executável
sudo chmod +x /opt/scripts/backup_idvisual.sh

# Adicionar ao cron (diário às 2h)
sudo crontab -e
0 2 * * * /opt/scripts/backup_idvisual.sh
```

## Atualização da Aplicação

```bash
cd /opt/id_visual_2

# Backup antes de atualizar
./scripts/backup_idvisual.sh

# Baixar nova versão
git pull origin main

# Rebuild e restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Rodar migrações
docker compose exec api alembic upgrade head

# Verificar logs
docker compose logs -f
```

## Rollback

```bash
# Voltar para commit anterior
git log --oneline  # ver histórico
git checkout <commit-hash>

# Rebuild
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Reverter migração (se necessário)
docker compose exec api alembic downgrade -1
```

## Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker compose logs <service-name>

# Inspecionar container
docker inspect <container-id>

# Entrar no container
docker compose exec <service-name> sh
```

### Banco de dados corrompido

```bash
# Restaurar do backup
docker compose down
docker volume rm id_visual_2_postgres_data
docker compose up -d db
# Aguardar inicialização
docker compose exec -T db psql -U ${POSTGRES_USER} ${POSTGRES_DB} < backup.sql
docker compose up -d
```

### Performance ruim

```bash
# Verificar recursos
docker stats

# Aumentar workers da API (docker-compose.prod.yml)
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 8

# Limpar logs antigos
docker system prune -a
```

## Segurança em Produção

- ✅ Alterar TODAS as senhas padrão
- ✅ Usar HTTPS (certificado SSL)
- ✅ Configurar firewall (ufw)
- ✅ Manter Docker e sistema atualizados
- ✅ Limitar acesso SSH (chave pública apenas)
- ✅ Monitorar logs de acesso
- ✅ Backup automático diário
- ✅ Testar restore dos backups mensalmente

## Alternativas ao Docker Compose

Se o projeto crescer muito, considere:

- **Kubernetes (K8s)**: Para múltiplas instâncias, auto-scaling, alta disponibilidade
- **Docker Swarm**: Mais simples que K8s, boa para clusters pequenos
- **Serviços Gerenciados**: AWS ECS, Azure Container Instances, Google Cloud Run

**Para a maioria dos casos de uso em chão de fábrica, Docker Compose é suficiente e recomendado.**

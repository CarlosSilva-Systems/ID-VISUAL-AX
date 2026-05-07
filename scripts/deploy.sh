#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Script de deploy manual de emergência
# Projeto: ID Visual AX
#
# USO: bash /root/id_visual_ax/scripts/deploy.sh
#
# Quando usar: quando o pipeline automático falhar ou você precisar forçar
# uma atualização sem aguardar o GitHub Actions.
# =============================================================================
set -euo pipefail

DEPLOY_PATH="/root/id_visual_ax"
GHCR_OWNER="carlossilva-systems"
COMPOSE_FILE="docker-compose.ci.yml"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "======================================================"
echo "   ID Visual AX — Deploy Manual de Emergência"
echo "======================================================"
echo ""

# Verifica se está no servidor correto
if [[ ! -f "${DEPLOY_PATH}/${COMPOSE_FILE}" ]]; then
    echo -e "${RED}[ERRO]${NC} Arquivo ${COMPOSE_FILE} não encontrado em ${DEPLOY_PATH}"
    echo "Certifique-se de que o pipeline já rodou ao menos uma vez."
    exit 1
fi

cd "$DEPLOY_PATH"

# Solicita o token para autenticação no GHCR
echo -e "${YELLOW}[INFO]${NC} Cole seu GitHub Personal Access Token (escopo: read:packages):"
echo -e "${YELLOW}[INFO]${NC} (O texto não será exibido enquanto você digita)"
read -rs GH_TOKEN
echo ""

echo -e "${YELLOW}[INFO]${NC} Autenticando no GitHub Container Registry..."
echo "$GH_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin
echo -e "${GREEN}[OK]${NC}   Login realizado."

echo ""
echo -e "${YELLOW}[INFO]${NC} Fazendo pull das imagens mais recentes..."
docker compose -f "$COMPOSE_FILE" pull

echo ""
echo -e "${YELLOW}[INFO]${NC} Reiniciando containers..."
docker compose -f "$COMPOSE_FILE" up -d

echo -e "${YELLOW}[INFO]${NC} Logout do registry..."
docker logout ghcr.io

echo -e "${YELLOW}[INFO]${NC} Removendo imagens antigas..."
docker image prune -f

echo ""
echo "======================================================"
echo -e "${GREEN}✅ Deploy concluído em $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo "======================================================"
echo ""
echo "Status dos containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

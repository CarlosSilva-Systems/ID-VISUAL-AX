#!/usr/bin/env bash
# =============================================================================
# server_setup.sh — Instalação do Docker + Configuração do ambiente de deploy
# Projeto: ID Visual AX
# Compatível com: Ubuntu 22.04 LTS / 24.04 LTS
# Uso: curl -fsSL <url_do_script> | bash
#      OU: chmod +x server_setup.sh && ./server_setup.sh
# =============================================================================
set -euo pipefail

# --- Cores para output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}   $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERRO]${NC} $1"; }

# =============================================================================
# CONFIGURAÇÃO — edite esta seção se quiser personalizar
# =============================================================================

# Diretório de deploy do projeto no servidor
# Padrão: /home/<usuário_atual>/id_visual_ax
DEPLOY_USER="${SUDO_USER:-$USER}"
DEPLOY_HOME=$(eval echo "~${DEPLOY_USER}")
DEPLOY_DIR="${DEPLOY_HOME}/id_visual_ax"

# =============================================================================

echo ""
echo "======================================================"
echo "   ID Visual AX — Setup do Servidor Ubuntu"
echo "======================================================"
echo ""

# --- Verificação de pré-requisitos ---
if [[ $EUID -ne 0 ]]; then
    log_error "Este script deve ser executado como root ou via sudo."
    log_error "Uso: sudo ./server_setup.sh"
    exit 1
fi

# Detectar versão do Ubuntu
if ! command -v lsb_release &>/dev/null; then
    log_error "lsb_release não encontrado. Este script é compatível apenas com Ubuntu."
    exit 1
fi

UBUNTU_VERSION=$(lsb_release -rs)
log_info "Ubuntu ${UBUNTU_VERSION} detectado. Usuário de deploy: ${DEPLOY_USER}"
log_info "Diretório de deploy será: ${DEPLOY_DIR}"
echo ""

# =============================================================================
# PASSO 1 — Atualizar pacotes do sistema
# =============================================================================
log_info "Atualizando lista de pacotes do sistema..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    ufw
log_success "Pacotes base instalados."

# =============================================================================
# PASSO 2 — Instalar Docker Engine (método oficial da Docker Inc.)
# =============================================================================
log_info "Configurando repositório oficial do Docker..."

# Remove versões antigas se existirem
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
    apt-get remove -y "$pkg" 2>/dev/null || true
done

# Adiciona a chave GPG oficial do Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Adiciona o repositório estável do Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
log_success "Repositório do Docker configurado."

log_info "Instalando Docker Engine e Docker Compose Plugin..."
apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

log_success "Docker Engine instalado com sucesso."

# =============================================================================
# PASSO 3 — Configurar o grupo docker (sem sudo para operações comuns)
# =============================================================================
log_info "Adicionando '${DEPLOY_USER}' ao grupo docker..."
usermod -aG docker "${DEPLOY_USER}"
log_success "Usuário '${DEPLOY_USER}' adicionado ao grupo docker."
log_warn "IMPORTANTE: O usuário precisará fazer logout/login para o grupo ter efeito."

# Habilita e inicia o serviço Docker
systemctl enable docker --quiet
systemctl start docker
log_success "Serviço Docker habilitado e iniciado."

# =============================================================================
# PASSO 4 — Criar diretório de deploy do projeto
# =============================================================================
log_info "Criando diretório de deploy em: ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_DIR}"
chmod 750 "${DEPLOY_DIR}"
log_success "Diretório criado: ${DEPLOY_DIR}"

# =============================================================================
# PASSO 5 — Configurar chave SSH autorizada para deploy via CI/CD
# =============================================================================
SSH_DIR="${DEPLOY_HOME}/.ssh"
AUTHORIZED_KEYS="${SSH_DIR}/authorized_keys"

if [[ ! -d "$SSH_DIR" ]]; then
    mkdir -p "$SSH_DIR"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "$SSH_DIR"
    chmod 700 "$SSH_DIR"
fi

if [[ ! -f "$AUTHORIZED_KEYS" ]]; then
    touch "$AUTHORIZED_KEYS"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "$AUTHORIZED_KEYS"
    chmod 600 "$AUTHORIZED_KEYS"
fi

log_warn "---------------------------------------------------------------"
log_warn "PRÓXIMO PASSO: Chave SSH para o CI/CD"
log_warn ""
log_warn "Na sua máquina local (Windows), gere um par de chaves SSH:"
log_warn "  ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/id_visual_deploy"
log_warn ""
log_warn "Depois adicione a CHAVE PÚBLICA (id_visual_deploy.pub) ao arquivo:"
log_warn "  ${AUTHORIZED_KEYS}"
log_warn ""
log_warn "A CHAVE PRIVADA (id_visual_deploy) vai no Secret 'DEPLOY_SSH_KEY'"
log_warn "do repositório no GitHub."
log_warn "---------------------------------------------------------------"

# =============================================================================
# PASSO 6 — Configurar firewall básico (UFW)
# =============================================================================
log_info "Configurando firewall (UFW)..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 8000/tcp comment 'API FastAPI'
ufw allow 5173/tcp comment 'Frontend Vite/Nginx'
ufw allow 1883/tcp comment 'MQTT Mosquitto'
ufw --force enable > /dev/null
log_success "Firewall configurado."

# =============================================================================
# PASSO 7 — Verificação final
# =============================================================================
echo ""
echo "======================================================"
echo "   Verificação da Instalação"
echo "======================================================"

DOCKER_VERSION=$(docker --version)
COMPOSE_VERSION=$(docker compose version)

log_success "Docker:         ${DOCKER_VERSION}"
log_success "Compose Plugin: ${COMPOSE_VERSION}"
log_success "Deploy dir:     ${DEPLOY_DIR}"

# =============================================================================
# RESUMO FINAL
# =============================================================================
echo ""
echo "======================================================"
echo "   Setup Concluído! Anote as informações abaixo:"
echo "======================================================"
echo ""
echo "  GitHub Secret DEPLOY_HOST: $(hostname -I | awk '{print $1}') (IP do servidor)"
echo "  GitHub Secret DEPLOY_USER: ${DEPLOY_USER}"
echo "  GitHub Secret DEPLOY_PATH: ${DEPLOY_DIR}"
echo ""
echo "  Após adicionar a chave SSH pública ao arquivo:"
echo "  ${AUTHORIZED_KEYS}"
echo ""
echo "  O pipeline CI/CD estará pronto para se conectar."
echo "======================================================"
echo ""
log_warn "Faça logout e login novamente (ou 'newgrp docker') para"
log_warn "usar o Docker sem sudo."
echo ""

# =============================================================================
# Frontend Dockerfile — Multi-stage build para produção
# Estágio 1 (builder): gera o bundle estático via Vite
# Estágio 2 (runtime): Nginx serve os arquivos estáticos com proxy reverso
# =============================================================================

# ── Estágio 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copia os arquivos de dependências primeiro (melhor cache de layers)
COPY package*.json ./

# Instala dependências de forma determinística e sem devDependencies extras
RUN npm ci

# Copia o código fonte
COPY . .

# Gera o bundle estático de produção
RUN npm run build

# ── Estágio 2: Runtime ────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Remove a config padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia nossa configuração customizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos gerados pelo Vite
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

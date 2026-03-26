# Estágio de desenvolvimento
FROM node:20-alpine

WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o código fonte
COPY . .

# Expõe a porta padrão do Vite
EXPOSE 5173

# Comando para rodar em modo desenvolvimento com host exposto
CMD ["npm", "run", "dev", "--", "--host"]

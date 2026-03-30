# Frontend ID Visual AX

Interface React para o sistema ID Visual AX - Gestão de Identificações Visuais para Manufatura.

## Visão Geral

O frontend do ID Visual AX é uma aplicação React + TypeScript que fornece interface intuitiva para gerenciamento de ordens de manufatura, lotes de IDs visuais, sistema Andon e analytics de produção.

### Principais Funcionalidades

- **Dashboard de IDs Visuais**: Visualização e criação de lotes de identificações
- **Seleção Dinâmica de Banco de Dados**: Interface para alternar entre bancos Odoo (produção/teste)
- **Gestão de Lotes**: Workflow 5S com matriz de tarefas interativa
- **Portal de Produção**: Solicitação manual de IDs visuais com prioridade
- **Sistema Andon**: Painel de alertas de chão de fábrica com modo TV
- **Analytics MPR**: Dashboard de análise de produção e performance
- **Relatórios Customizados**: Geração e visualização de relatórios via IA

## Tecnologias

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS v4
- **UI Components**: MUI v7 + Radix UI + shadcn-style components
- **Routing**: React Router v7
- **Charts**: Recharts
- **Notifications**: Sonner (toasts)
- **Package Manager**: npm

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do diretório `frontend/`:

```bash
VITE_API_URL=http://localhost:8000/api/v1
```

Em produção, ajuste para a URL do backend:
```bash
VITE_API_URL=https://api.idvisual.com/api/v1
```

### Instalação

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Build para produção
npm run build
```

## Novos Componentes: Seleção Dinâmica de Banco de Dados

### DatabaseSelector

Componente dropdown para seleção de banco de dados Odoo na tela de Configurações.

**Localização:** `src/app/components/DatabaseSelector.tsx`

**Funcionalidades:**
- Lista todos os bancos disponíveis no servidor Odoo
- Exibe ícones visuais: 🟢 (production), 🟡 (test)
- Desabilita seleção do banco de produção (`axengenharia1`)
- Testa conexão antes de salvar
- Dispara evento `database-changed` após salvar com sucesso

**Uso:**
```tsx
import { DatabaseSelector } from './components/DatabaseSelector';

<DatabaseSelector />
```

### ConnectionBadge

Indicador visual no header mostrando status da conexão Odoo.

**Localização:** `src/app/components/ConnectionBadge.tsx`

**Estados:**
- 🟢 **ODOO CONECTADO** (verde): Conectado ao banco de produção
- 🟡 **ODOO CONECTADO** (amarelo): Conectado a banco de teste
- 🔴 **ODOO DESCONECTADO** (vermelho): Sem conexão ativa

**Funcionalidades:**
- Atualiza automaticamente ao mudar banco de dados
- Exibe nome do banco ativo
- Animação de pulso no ícone

**Uso:**
```tsx
import { ConnectionBadge } from './components/ConnectionBadge';

<ConnectionBadge />
```

### PollingManager

Gerenciador de polling automático de identificações visuais em background.

**Localização:** `src/services/pollingManager.ts`

**Funcionalidades:**
- **ID_Odoo**: Busca a cada 10 minutos via `GET /odoo/mos`
- **ID_Producao**: Busca a cada 30 segundos via `GET /id-requests/manual`
- Lifecycle gerenciado por autenticação (start no login, stop no logout)
- Reinicia automaticamente ao mudar banco de dados
- Tratamento silencioso de falhas (não interrompe polling)

**Lifecycle:**
```typescript
import { pollingManager } from './services/pollingManager';

// Iniciar polling (chamado automaticamente no login)
pollingManager.start();

// Parar polling (chamado automaticamente no logout)
pollingManager.stop();

// Reiniciar polling (chamado ao mudar banco de dados)
pollingManager.restart();
```

**Integração no App.tsx:**
```tsx
React.useEffect(() => {
  if (isAuthenticated) {
    pollingManager.start();

    const handleDbChange = () => {
      pollingManager.restart();
    };
    window.addEventListener('database-changed', handleDbChange);

    return () => {
      pollingManager.stop();
      window.removeEventListener('database-changed', handleDbChange);
    };
  }
}, [isAuthenticated]);
```

## Estrutura de Diretórios

```
frontend/src/
├── app/
│   ├── App.tsx                     # Root component, routing, auth state
│   ├── components/                 # Page-level components
│   │   ├── DatabaseSelector.tsx    # Seleção de banco Odoo
│   │   ├── ConnectionBadge.tsx     # Badge de status de conexão
│   │   ├── Dashboard.tsx           # Dashboard principal
│   │   ├── Configuracoes.tsx       # Tela de configurações
│   │   └── ui/                     # Reusable UI primitives
│   ├── contexts/
│   │   └── DataContext.tsx         # Global data provider
│   ├── pages/                      # Route-level pages
│   └── types.ts                    # Shared TypeScript types
├── components/                     # Shared cross-feature components
├── services/
│   ├── api.ts                      # Centralized API client
│   └── pollingManager.ts           # Polling manager
├── lib/
│   └── utils.ts                    # Utility helpers
└── styles/                         # Global CSS, Tailwind
```

## API Client

Todas as chamadas de API devem usar o cliente centralizado em `src/services/api.ts`:

```typescript
import { api } from '../services/api';

// Exemplo: Buscar bancos de dados
const databases = await api.get('/odoo/databases');

// Exemplo: Selecionar banco
await api.post('/odoo/databases/select', { database: 'id-visual-3' });
```

**Benefícios:**
- Gerenciamento automático de autenticação (Bearer token)
- Tratamento consistente de erros
- Renovação automática de token em caso de 401
- Tipagem TypeScript

## Fluxo de Autenticação

### Login

1. Usuário fornece email e senha
2. Frontend chama `api.login(username, password)`
3. Backend valida credenciais no Odoo
4. JWT é armazenado em `localStorage` como `id_visual_token`
5. Polling automático é iniciado

### Operações Autenticadas

Todas as requisições incluem automaticamente o token JWT:
```typescript
Authorization: Bearer <token>
```

### Logout

1. Remove token do `localStorage`
2. Para polling automático
3. Recarrega página

## Eventos Customizados

### `database-changed`

Disparado quando o banco de dados Odoo ativo é alterado.

**Uso:**
```typescript
window.addEventListener('database-changed', () => {
  // Atualizar componentes que dependem do banco ativo
  pollingManager.restart();
});

// Disparar evento
window.dispatchEvent(new Event('database-changed'));
```

## Desenvolvimento

### Comandos Úteis

```bash
# Desenvolvimento
npm run dev

# Build
npm run build

# Preview do build
npm run preview

# Lint
npm run lint
```

### Convenções de Código

- **Componentes**: PascalCase (ex: `DatabaseSelector.tsx`)
- **Serviços**: camelCase (ex: `pollingManager.ts`)
- **Strings de UI**: Português do Brasil (pt-BR)
- **Código**: Inglês (variáveis, funções, comentários)

### Toasts (Notificações)

Use `sonner` para notificações:

```typescript
import { toast } from 'sonner';

toast.success('Banco de dados atualizado com sucesso!');
toast.error('Erro ao conectar com Odoo');
toast.info('Processando...');
```

## Integração com Backend

### Endpoints Principais

- `GET /odoo/databases` - Lista bancos disponíveis
- `POST /odoo/databases/select` - Seleciona banco ativo
- `GET /odoo/mos` - Busca ordens de manufatura (polling)
- `GET /id-requests/manual` - Busca solicitações manuais (polling)
- `POST /auth/login` - Autenticação
- `GET /auth/me` - Dados do usuário logado

### Tratamento de Erros

O sistema trata automaticamente:
- **401 Unauthorized**: Remove token e recarrega página
- **502 Bad Gateway**: Exibe mensagem de erro de conectividade
- **504 Gateway Timeout**: Exibe mensagem de timeout

## Troubleshooting

### Erro: "ODOO DESCONECTADO"

1. Verifique se backend está rodando
2. Verifique `VITE_API_URL` no `.env`
3. Verifique configurações Odoo no backend

### Polling Não Funciona

1. Verifique console do navegador para erros
2. Verifique se usuário está autenticado
3. Verifique se endpoints `/odoo/mos` e `/id-requests/manual` estão respondendo

### Banco de Dados Não Muda

1. Verifique se evento `database-changed` está sendo disparado
2. Verifique console para erros de API
3. Verifique se backend persistiu a mudança em `system_setting`

## Contribuindo

1. Crie uma branch para sua feature
2. Faça commits atômicos seguindo Conventional Commits em PT-BR
3. Garanta que working tree está limpa antes de finalizar
4. Teste em diferentes navegadores (Chrome, Firefox)
5. Abra um Pull Request com descrição detalhada

## Licença

Proprietary - AX Engenharia

  
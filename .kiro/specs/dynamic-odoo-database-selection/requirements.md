# Requirements Document

## Introduction

Este documento especifica os requisitos para implementação de duas features principais no sistema ID Visual AX relacionadas à integração com Odoo ERP:

1. **Seleção Dinâmica de Banco de Dados Odoo**: Permitir que o usuário selecione dinamicamente qual banco de dados Odoo será utilizado pelo sistema, listando todos os bancos disponíveis no servidor configurado, com proteção especial para o banco de produção.

2. **Refatoração da Lógica de Autenticação**: Separar claramente o papel de conta de serviço (para operações do sistema) do papel de validação de usuário (para login), eliminando ambiguidade no uso das credenciais Odoo.

## Glossary

- **System**: O sistema ID Visual AX (backend FastAPI + frontend React)
- **Odoo_Server**: Servidor Odoo ERP configurado via ODOO_URL
- **Production_Database**: Banco de dados `axengenharia1` (banco de produção)
- **Test_Database**: Qualquer banco de dados Odoo que não seja `axengenharia1`
- **Service_Account**: Conta técnica usada pelo sistema para realizar operações no Odoo (ODOO_SERVICE_LOGIN/PASSWORD)
- **User_Credentials**: Credenciais fornecidas pelo usuário final durante o login
- **System_Setting_Table**: Tabela `system_setting` no banco de dados local para persistência de configurações
- **Active_Database**: Banco de dados Odoo atualmente selecionado e em uso pelo sistema
- **Database_Selector**: Componente UI (dropdown) para seleção de banco de dados
- **Connection_Badge**: Indicador visual no header mostrando status da conexão Odoo
- **Settings_Card**: Card de Integração Odoo na tela de Configurações do Sistema
- **ID_Odoo**: Identificação visual que entra pelo fluxo padrão do Odoo
- **ID_Producao**: Identificação visual criada manualmente com prioridade de produção

## Requirements

### Requirement 1: Listar Bancos de Dados Disponíveis

**User Story:** Como administrador do sistema, eu quero visualizar todos os bancos de dados disponíveis no servidor Odoo configurado, para que eu possa escolher qual banco utilizar durante testes e desenvolvimento.

#### Acceptance Criteria

1. WHEN o endpoint GET /api/v1/odoo/databases é chamado, THE System SHALL consultar {ODOO_URL}/web/database/list para obter a lista de bancos
2. THE System SHALL classificar cada banco retornado como "production" se o nome for `axengenharia1`, ou "test" para qualquer outro nome
3. THE System SHALL marcar o Production_Database com a propriedade `selectable: false`
4. THE System SHALL incluir na resposta o Active_Database atual (lido da System_Setting_Table com chave "active_odoo_db")
5. IF a chave "active_odoo_db" não existir na System_Setting_Table, THEN THE System SHALL retornar `id-visual-3` como Active_Database padrão
6. THE System SHALL retornar a lista no formato JSON contendo: `[{name, type, selectable, is_active}]`
7. IF a chamada ao Odoo_Server falhar, THEN THE System SHALL retornar erro HTTP 502 com mensagem descritiva

### Requirement 2: Selecionar Banco de Dados

**User Story:** Como administrador do sistema, eu quero selecionar um banco de dados de teste da lista disponível, para que o sistema passe a operar nesse banco sem modificar o arquivo .env.

#### Acceptance Criteria

1. WHEN o endpoint POST /api/v1/odoo/databases/select recebe `{"database": "nome-do-banco"}`, THE System SHALL validar se o banco não é `axengenharia1`
2. IF o banco selecionado for `axengenharia1`, THEN THE System SHALL retornar erro HTTP 403 com mensagem "Banco de produção não pode ser selecionado durante período de testes"
3. THE System SHALL persistir o nome do banco na System_Setting_Table com chave "active_odoo_db"
4. THE System SHALL testar a conexão com o novo banco usando Service_Account (ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD)
5. IF o teste de conexão falhar, THEN THE System SHALL retornar erro HTTP 502 com detalhes da falha
6. IF o teste de conexão for bem-sucedido, THEN THE System SHALL retornar status HTTP 200 com `{"status": "success", "database": "nome-do-banco", "connection_ok": true}`

### Requirement 3: Helper para Banco Ativo

**User Story:** Como desenvolvedor do sistema, eu quero uma função helper centralizada que retorne o banco Odoo ativo, para que todas as partes do código usem consistentemente o banco correto.

#### Acceptance Criteria

1. THE System SHALL implementar função `get_active_odoo_db()` que busca o valor de "active_odoo_db" na System_Setting_Table
2. IF o valor não for encontrado na System_Setting_Table, THEN THE System SHALL retornar `id-visual-3` como padrão
3. IF a System_Setting_Table não estiver disponível (erro de conexão), THEN THE System SHALL fazer fallback para `settings.ODOO_DB` do arquivo .env
4. THE System SHALL usar esta função no dependency `get_odoo_client()` para instanciar OdooClient com o banco correto
5. THE System SHALL garantir que a função seja assíncrona (`async def`) para compatibilidade com o stack FastAPI

### Requirement 4: Interface de Seleção de Banco

**User Story:** Como administrador do sistema, eu quero visualizar e selecionar bancos de dados através de uma interface gráfica intuitiva, para que eu não precise editar arquivos de configuração manualmente.

#### Acceptance Criteria

1. THE Settings_Card SHALL exibir um Database_Selector (dropdown) listando todos os bancos disponíveis
2. WHEN um banco é do tipo "production", THE Database_Selector SHALL exibir ícone verde (🟢) e desabilitar a seleção
3. WHEN um banco é do tipo "test", THE Database_Selector SHALL exibir ícone amarelo (🟡) e permitir seleção
4. THE Database_Selector SHALL exibir tooltip "Banco de produção — seleção desabilitada durante período de testes" ao passar o mouse sobre Production_Database
5. THE Database_Selector SHALL pré-selecionar `id-visual-3` como padrão na primeira carga
6. WHEN o usuário seleciona um banco e clica em "Salvar", THE System SHALL chamar POST /api/v1/odoo/databases/select
7. IF a seleção for bem-sucedida, THEN THE System SHALL exibir toast de sucesso e atualizar o Connection_Badge

### Requirement 5: Badge de Status de Conexão

**User Story:** Como usuário do sistema, eu quero visualizar no header o status da conexão com Odoo e qual tipo de banco está conectado, para que eu saiba se estou operando em ambiente de teste ou produção.

#### Acceptance Criteria

1. THE Connection_Badge SHALL exibir "ODOO CONECTADO" com ícone verde (🟢) WHEN conectado ao Production_Database
2. THE Connection_Badge SHALL exibir "ODOO CONECTADO" com ícone amarelo (🟡) WHEN conectado a um Test_Database
3. THE Connection_Badge SHALL exibir "ODOO DESCONECTADO" com ícone vermelho (🔴) WHEN não houver conexão ativa
4. THE Connection_Badge SHALL atualizar automaticamente após salvar nova configuração de banco
5. WHEN o sistema inicializa, THE Connection_Badge SHALL verificar conexão usando `id-visual-3` como Active_Database padrão

### Requirement 6: Renomear Variáveis de Ambiente

**User Story:** Como desenvolvedor do sistema, eu quero que as variáveis de ambiente reflitam claramente seu propósito (conta de serviço vs credenciais de usuário), para que não haja ambiguidade no código.

#### Acceptance Criteria

1. THE System SHALL renomear `ODOO_LOGIN` para `ODOO_SERVICE_LOGIN` em todos os arquivos do codebase
2. THE System SHALL renomear `ODOO_PASSWORD` para `ODOO_SERVICE_PASSWORD` em todos os arquivos do codebase
3. THE System SHALL atualizar `.env.example` com os novos nomes de variáveis
4. THE System SHALL atualizar `backend/app/core/config.py` com os novos nomes de campos
5. THE System SHALL atualizar todas as referências em `backend/app/services/odoo_client.py`
6. THE System SHALL atualizar todas as referências em `backend/app/api/deps.py`
7. THE System SHALL realizar busca global (grep) para garantir que nenhuma referência antiga permaneceu no código

### Requirement 7: Fluxo de Login com Credenciais do Usuário

**User Story:** Como usuário do sistema, eu quero fazer login usando minhas próprias credenciais do Odoo, para que o sistema valide minha identidade sem armazenar minha senha.

#### Acceptance Criteria

1. WHEN o usuário submete email e senha no formulário de login, THE System SHALL chamar POST {ODOO_URL}/web/session/authenticate com User_Credentials
2. THE System SHALL usar o Active_Database (da System_Setting_Table) na chamada de autenticação
3. IF a autenticação retornar `uid` válido (diferente de `false`), THEN THE System SHALL criar sessão local com `{uid, name, email}`
4. IF a autenticação retornar `uid = false`, THEN THE System SHALL retornar erro HTTP 401 com mensagem "Credenciais inválidas"
5. THE System SHALL NEVER armazenar a senha do usuário na sessão local ou em qualquer tabela do banco de dados
6. THE System SHALL usar apenas `uid`, `name` e `email` para controle de sessão e exibição no header

### Requirement 8: Requisições ao Odoo com Conta de Serviço

**User Story:** Como desenvolvedor do sistema, eu quero que todas as operações no Odoo após o login usem a conta de serviço, para que o sistema tenha permissões consistentes independente do usuário logado.

#### Acceptance Criteria

1. WHEN o sistema precisa fazer qualquer chamada ao Odoo após login do usuário, THE System SHALL usar ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD
2. THE System SHALL usar o Active_Database (da System_Setting_Table) em todas as chamadas ao OdooClient
3. THE System SHALL usar a sessão local do usuário apenas para: exibir nome no header, controle de permissões internas, logs e auditoria
4. THE System SHALL NEVER usar User_Credentials para operações no Odoo após o login inicial
5. THE System SHALL manter a instância de OdooClient no dependency `get_odoo_client()` usando Service_Account

### Requirement 9: Gerenciamento de Sessão

**User Story:** Como usuário do sistema, eu quero que minha sessão seja destruída corretamente ao fazer logout, para que minhas credenciais não fiquem expostas.

#### Acceptance Criteria

1. WHEN o usuário faz logout, THE System SHALL destruir a sessão local (remover token JWT do localStorage)
2. THE System SHALL NEVER chamar `/web/session/destroy` no Odoo para a Service_Account
3. THE System SHALL manter a Service_Account sempre autenticada para operações do sistema
4. WHEN a sessão local expira, THE System SHALL redirecionar o usuário para tela de login
5. THE System SHALL limpar todos os dados de sessão do frontend (localStorage e state)

### Requirement 10: Validação de Segurança

**User Story:** Como administrador de segurança, eu quero garantir que credenciais sensíveis nunca sejam expostas em logs ou respostas HTTP, para que o sistema mantenha conformidade com boas práticas de segurança.

#### Acceptance Criteria

1. THE System SHALL NEVER incluir ODOO_SERVICE_PASSWORD em logs, stack traces ou respostas HTTP
2. THE System SHALL NEVER incluir User_Credentials (senha do usuário) em logs ou banco de dados
3. WHEN ocorrer erro de autenticação, THE System SHALL retornar mensagem genérica sem revelar detalhes internos
4. THE System SHALL usar `request_id` único em logs de erro para rastreabilidade sem expor dados sensíveis
5. THE System SHALL validar que `.env` contém ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD antes de iniciar o servidor

### Requirement 11: Compatibilidade com Código Existente

**User Story:** Como desenvolvedor do sistema, eu quero que as mudanças sejam retrocompatíveis com o código existente, para que não haja quebra de funcionalidades durante a migração.

#### Acceptance Criteria

1. THE System SHALL manter a assinatura do construtor `OdooClient(url, db, auth_type, login, secret)` inalterada
2. THE System SHALL garantir que todos os endpoints existentes continuem funcionando após a refatoração
3. THE System SHALL executar testes manuais em endpoints críticos: `/api/v1/odoo/mos`, `/api/v1/auth/login`, `/api/v1/auth/me`
4. IF algum endpoint quebrar após refatoração, THEN THE System SHALL reverter mudanças e replanejar a implementação
5. THE System SHALL documentar todas as mudanças de breaking changes (se houver) no arquivo CHANGELOG.md

### Requirement 12: Parser e Pretty Printer para Configuração

**User Story:** Como desenvolvedor do sistema, eu quero garantir que a configuração de banco ativo seja sempre válida e bem formatada, para que não haja corrupção de dados na System_Setting_Table.

#### Acceptance Criteria

1. THE System SHALL validar que o nome do banco contém apenas caracteres alfanuméricos, hífens e underscores
2. THE System SHALL rejeitar nomes de banco vazios ou com espaços em branco
3. THE System SHALL normalizar o nome do banco (trim) antes de persistir
4. FOR ALL valores válidos de banco, THE System SHALL garantir que: `parse(format(db_name)) == db_name` (round-trip property)
5. IF o valor na System_Setting_Table estiver corrompido, THEN THE System SHALL fazer fallback para `id-visual-3` e registrar warning no log

### Requirement 13: Polling Automático de Identificações Visuais

**User Story:** Como usuário do sistema, eu quero que o sistema busque automaticamente novas identificações visuais do Odoo em background, para que eu veja as atualizações sem precisar recarregar a página manualmente.

#### Acceptance Criteria

1. THE System SHALL implementar polling automático para buscar ID_Odoo a cada 10 minutos
2. THE System SHALL implementar polling automático para buscar ID_Producao a cada 30 segundos
3. WHEN o usuário faz login, THE System SHALL iniciar ambos os pollings automaticamente
4. WHEN o usuário faz logout, THE System SHALL parar ambos os pollings
5. THE System SHALL usar Service_Account (ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD) para ambos os pollings
6. THE System SHALL usar Active_Database (da System_Setting_Table) para ambos os pollings
7. IF o Active_Database mudar durante uma sessão ativa, THE System SHALL reiniciar os pollings com o novo banco
8. THE System SHALL tratar falhas de polling de forma silenciosa (log de erro mas não interrompe o polling)
9. THE System SHALL garantir que apenas uma instância de cada polling esteja ativa por sessão de usuário


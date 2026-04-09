# Requirements Document

## Introduction

Este documento especifica melhorias na tela de "Pendências de Justificativa" do sistema ID Visual AX. A tela exibe chamados Andon resolvidos que aguardam justificativa, agrupados por workcenter (mesa de trabalho). As melhorias visam aumentar a clareza e utilidade das informações exibidas, substituindo identificadores técnicos por dados mais significativos para os operadores.

## Glossary

- **Andon_System**: Sistema de alertas em tempo real do chão de fábrica que gerencia chamados amarelos e vermelhos
- **Pendencias_Page**: Tela de interface que exibe chamados Andon resolvidos aguardando justificativa
- **Workcenter**: Centro de trabalho (mesa) no chão de fábrica, identificado por um ID do Odoo
- **Owner_Name**: Nome do responsável atual pela mesa de trabalho, obtido do campo `user_id` da Work Order ativa no Odoo
- **Work_Type**: Tipo de montagem sendo executada na mesa (ex: "Pré Montagem", "Completo", "Montagem"), extraído do campo `name` da Work Order no Odoo
- **AndonCall**: Registro de chamado Andon no banco de dados local
- **Backend_Endpoint**: Endpoint `/calls/pending-justification` que retorna chamados pendentes enriquecidos com dados do Odoo
- **Frontend_Component**: Componente React `AndonPendenciasPage.tsx` que renderiza a interface

## Requirements

### Requirement 1: Exibir Nome do Responsável no Cabeçalho do Grupo

**User Story:** Como operador do sistema, eu quero ver o nome do responsável pela mesa no cabeçalho de cada grupo de pendências, para que eu possa identificar rapidamente quem deve justificar as paradas.

#### Acceptance Criteria

1. WHEN THE Pendencias_Page renderiza um grupo de chamados, THE Frontend_Component SHALL exibir o campo `owner_name` no cabeçalho do grupo
2. THE Frontend_Component SHALL substituir a exibição do `workcenter_name` isolado por uma combinação de `workcenter_name` e `owner_name`
3. WHEN o campo `owner_name` não está disponível, THE Frontend_Component SHALL exibir "—" como placeholder
4. THE Frontend_Component SHALL manter o ícone de usuário (User) ao lado do nome do responsável para clareza visual
5. FOR ALL grupos de chamados, o nome do responsável exibido SHALL ser consistente com o valor retornado pelo Backend_Endpoint

### Requirement 2: Adicionar Coluna "Tipo" na Tabela de Paradas

**User Story:** Como operador do sistema, eu quero ver o tipo de montagem de cada parada na tabela, para que eu possa entender o contexto da operação que foi interrompida.

#### Acceptance Criteria

1. THE Frontend_Component SHALL adicionar uma nova coluna "Tipo" na tabela de paradas expandida
2. THE Frontend_Component SHALL exibir o campo `work_type` na coluna "Tipo" para cada linha de chamado
3. WHEN o campo `work_type` não está disponível, THE Frontend_Component SHALL exibir "—" como placeholder
4. THE Frontend_Component SHALL posicionar a coluna "Tipo" após a coluna "Responsável" e antes da coluna "Parou às"
5. THE Frontend_Component SHALL aplicar estilo de texto consistente com as demais colunas da tabela (text-sm text-slate-600)
6. THE Frontend_Component SHALL incluir cabeçalho "Tipo" na linha de cabeçalhos da tabela com estilo uppercase e tracking-wider

### Requirement 3: Garantir Disponibilidade dos Dados no Backend

**User Story:** Como desenvolvedor, eu quero garantir que os campos `owner_name` e `work_type` estejam disponíveis no endpoint, para que o frontend possa exibi-los corretamente.

#### Acceptance Criteria

1. THE Backend_Endpoint SHALL incluir o campo `owner_name` em cada objeto AndonCall retornado
2. THE Backend_Endpoint SHALL incluir o campo `work_type` em cada objeto AndonCall retornado
3. WHEN uma Work Order ativa existe para o workcenter, THE Backend_Endpoint SHALL extrair `owner_name` do campo `user_id` da Work Order
4. WHEN uma Work Order ativa existe para o workcenter, THE Backend_Endpoint SHALL extrair `work_type` do campo `name` da Work Order
5. WHEN múltiplas Work Orders existem para o mesmo workcenter, THE Backend_Endpoint SHALL priorizar Work Orders com `state == 'progress'`
6. WHEN nenhuma Work Order está disponível, THE Backend_Endpoint SHALL retornar "—" para ambos os campos
7. THE Backend_Endpoint SHALL normalizar os valores usando a função `normalize_label` antes de retornar

### Requirement 4: Manter Compatibilidade com Interface TypeScript

**User Story:** Como desenvolvedor frontend, eu quero que a interface TypeScript reflita os campos disponíveis, para que eu tenha type safety ao acessar os dados.

#### Acceptance Criteria

1. THE Frontend_Component SHALL utilizar a interface `AndonCall` existente em `types.ts`
2. THE AndonCall interface SHALL incluir o campo opcional `owner_name?: string`
3. THE AndonCall interface SHALL incluir o campo opcional `work_type?: string`
4. FOR ALL acessos aos campos `owner_name` e `work_type`, o TypeScript compiler SHALL validar a tipagem sem erros

### Requirement 5: Preservar Funcionalidade Existente

**User Story:** Como usuário do sistema, eu quero que todas as funcionalidades existentes continuem operando normalmente após as mudanças, para que não haja regressão no sistema.

#### Acceptance Criteria

1. THE Frontend_Component SHALL manter a funcionalidade de agrupamento por `workcenter_id`
2. THE Frontend_Component SHALL manter a funcionalidade de expansão/colapso de grupos
3. THE Frontend_Component SHALL manter todos os filtros existentes (cor, data inicial, data final)
4. THE Frontend_Component SHALL manter a funcionalidade de atualização via WebSocket
5. THE Frontend_Component SHALL manter a funcionalidade do botão "Justificar"
6. THE Frontend_Component SHALL manter a exibição de todas as colunas existentes na tabela
7. WHEN um chamado é justificado, THE Frontend_Component SHALL remover o chamado da lista conforme comportamento atual


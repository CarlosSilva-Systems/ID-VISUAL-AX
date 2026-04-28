# Melhorias no Fluxo de Trabalho de Etiquetas

## Resumo das Implementações

Este documento descreve as melhorias implementadas no sistema de etiquetas do Lote do Dia, conforme solicitado pelo usuário.

## 1. Nomenclatura Descritiva ✅ COMPLETO

**Objetivo**: Substituir códigos técnicos por nomes descritivos nas abas de etiquetas.

**Implementação**:
- Mapeamento de códigos para nomes descritivos:
  - `210-804` → "Característica Técnica"
  - `210-805` → "Adesivo de Componente"
  - `210-855` → "Porta do Quadro"
  - `2009-110` → "Régua de Borne"
- Código técnico exibido em segundo plano (sublabel)
- Interface mais intuitiva para usuários

**Arquivos modificados**:
- `frontend/src/app/components/LabelsDrawer.tsx`

---

## 2. Editor Manual de Adesivos (210-805) ✅ COMPLETO

**Objetivo**: Permitir criação manual rápida de adesivos de componente sem depender de importação EPLAN.

**Implementação**:
- Formulário simplificado com apenas campo de tag
- Auto-focus e suporte a Enter para entrada rápida
- Normalização automática para maiúsculas
- Validação de tags únicas por MO
- Botão "📌 Ver Diagrama (Pop-up)" para abrir floating viewer

**Endpoints Backend**:
- `POST /api/v1/id-visual/eplan/{mo_id}/devices/manual` - Cria dispositivo manual
- `PATCH /api/v1/id-visual/eplan/devices/{device_id}` - Edita dispositivo
- `DELETE /api/v1/id-visual/eplan/devices/{device_id}` - Remove dispositivo
- `POST /api/v1/id-visual/eplan/{mo_id}/devices/reorder` - Reordena dispositivos

**Correções Aplicadas**:
- ✅ Corrigido tipo de `mo_id` de `int` para `string` (UUID)
- ✅ Todos os endpoints de EPLAN agora usam UUID como string
- ✅ Schemas atualizados com conversão automática UUID→string
- ✅ Frontend atualizado para trabalhar com UUID string

**Arquivos modificados**:
- Backend:
  - `backend/app/api/api_v1/endpoints/eplan.py`
  - `backend/app/schemas/eplan.py`
  - `backend/app/models/label_device.py`
- Frontend:
  - `frontend/src/app/components/LabelsDrawer.tsx`
  - `frontend/src/services/printQueueApi.ts`

---

## 3. Sistema de Presets (210-855) ✅ COMPLETO

**Objetivo**: Sistema de templates reutilizáveis para etiquetas de porta com presets do sistema e personalizados.

**Implementação**:

### Presets do Sistema (pré-configurados):
1. **Comando Energizado** (Sinaleira)
   - Categoria: `sinaleira`
   - Texto fixo: "COMANDO ENERGIZADO"
   - Sem colunas (apenas texto)

2. **Liga Bomba de Incêndio** (Sinaleira)
   - Categoria: `sinaleira`
   - Texto fixo: "LIGA BOMBA DE INCÊNDIO"

3. **Bomba de Incêndio Ligada** (Sinaleira)
   - Categoria: `sinaleira`
   - Texto fixo: "BOMBA DE INCÊNDIO LIGADA"

4. **Botoeira 3 Posições**
   - Categoria: `botoeira-3pos`
   - Colunas: ["MAN", "O", "AUT"]
   - Nome do equipamento customizável (ex: "RECALQUE")

5. **Botoeira 2 Posições**
   - Categoria: `botoeira-2pos`
   - Colunas: ["MAN", "AUT"]
   - Nome do equipamento customizável

### Funcionalidades:
- ✅ Criação de presets personalizados pelo usuário
- ✅ Sistema de favoritos (⭐)
- ✅ Compartilhamento com equipe
- ✅ Contador de uso (popularidade)
- ✅ Filtros: Todos, Sistema, Meus, Equipe, Favoritos
- ✅ Preview em tempo real
- ✅ Limite de 50 presets por usuário
- ✅ Categorias: Sinaleira, Botoeira 3P, Botoeira 2P, Personalizado

### Endpoints Backend:
- `GET /api/v1/id-visual/door-presets` - Lista presets com filtros
- `POST /api/v1/id-visual/door-presets` - Cria preset
- `PATCH /api/v1/id-visual/door-presets/{id}` - Atualiza preset
- `DELETE /api/v1/id-visual/door-presets/{id}` - Deleta preset
- `POST /api/v1/id-visual/door-presets/{id}/favorite` - Toggle favorito
- `POST /api/v1/id-visual/door-presets/{id}/use` - Incrementa uso

### Banco de Dados:
- Tabela `door_label_preset` - Armazena presets
- Tabela `door_label_preset_favorite` - Relação many-to-many de favoritos
- Migração: `h1i2j3k4l5m6_feat_adiciona_door_label_presets.py`

**Arquivos criados/modificados**:
- Backend:
  - `backend/app/api/api_v1/endpoints/door_presets.py` (novo)
  - `backend/app/models/door_label_preset.py` (novo)
  - `backend/app/schemas/door_preset.py` (novo)
  - `backend/alembic/versions/h1i2j3k4l5m6_feat_adiciona_door_label_presets.py` (novo)
- Frontend:
  - `frontend/src/services/doorPresetsApi.ts` (novo)
  - `frontend/src/app/components/LabelsDrawer.tsx` (atualizado)

---

## 4. Floating Document Viewer ✅ COMPLETO

**Objetivo**: Visualizador flutuante de diagramas para facilitar preenchimento de dados enquanto visualiza o documento.

**Implementação**:

### Funcionalidades:
- ✅ Draggable (arrastável por toda a tela)
- ✅ Resizable (redimensionável)
- ✅ Always-on-top (z-index 9999)
- ✅ Minimize/Maximize
- ✅ Pin/Unpin (impede fechamento acidental)
- ✅ Zoom controls (Ctrl+/Ctrl-)
- ✅ Multi-page navigation (setas)
- ✅ Persistent position/size (localStorage)
- ✅ Suporte a PDF via react-pdf
- ✅ Atalhos de teclado (Esc para fechar, setas para navegar)

### Integração:
- ✅ Botão "📌 Ver Diagrama (Pop-up)" na aba **Característica Técnica (210-804)**
- ✅ Botão "📌 Ver Diagrama (Pop-up)" no **formulário manual de dispositivos (210-805)**
- ✅ Hook global `useFloatingViewer` para gerenciar estado
- ✅ Componente reutilizável em toda aplicação

**Arquivos criados/modificados**:
- Frontend:
  - `frontend/src/components/FloatingDocViewer.tsx` (novo)
  - `frontend/src/hooks/useFloatingViewer.ts` (novo)
  - `frontend/src/app/components/LabelsDrawer.tsx` (atualizado)

---

## Correções de Bugs

### Bug 1: Erro ao criar dispositivo manual ✅ CORRIGIDO
**Problema**: Tipo de `mo_id` incorreto (UUID vs int)

**Solução**:
- Todos os endpoints de EPLAN agora aceitam `mo_id` como string (UUID)
- Conversão automática de UUID para string nos schemas de resposta
- Frontend atualizado para trabalhar com UUID string
- Validação de UUID nos endpoints

**Commits**:
- `fix(eplan): corrige tipo de mo_id de int para UUID string em endpoints e schemas`
- `feat(labels): adiciona botão floating viewer e corrige tipos UUID no frontend`

### Bug 2: Múltiplas heads no Alembic ✅ CORRIGIDO
**Problema**: Branches divergentes de migrações causando conflitos

**Solução**:
- Migração de merge criada: `1fdc03c468fd_merge_unifica_branches_de_device_label_.py`
- Unifica branches de `device_label` e `door_presets`
- Todas as migrações aplicadas com sucesso

**Commit**:
- `chore(alembic): merge branches de device_label e door_presets`

---

## Fluxo de Trabalho Recomendado

### Para Adesivos de Componente (210-805):

1. **Abrir Lote do Dia** → Selecionar MO
2. **Clicar em "Etiquetas"** → Aba "Adesivo de Componente"
3. **Clicar "📌 Ver Diagrama (Pop-up)"** → Abre floating viewer
4. **Posicionar viewer** ao lado do formulário
5. **Clicar "Adicionar Manualmente"**
6. **Visualizar diagrama** e digitar tags rapidamente
7. **Pressionar Enter** para cada tag
8. **Selecionar impressora** e imprimir

### Para Etiquetas de Porta (210-855):

1. **Abrir Lote do Dia** → Selecionar MO
2. **Clicar em "Etiquetas"** → Aba "Porta do Quadro"
3. **Filtrar presets** (Sistema, Meus, Equipe, Favoritos)
4. **Selecionar preset** desejado
5. **Customizar nome do equipamento** (se necessário)
6. **Preview em tempo real**
7. **Selecionar impressora** e imprimir
8. **Criar novos presets** conforme necessário

---

## Próximos Passos (Sugestões)

1. **Drag & Drop para reordenação** de dispositivos na lista
2. **Busca/filtro** de dispositivos por tag ou descrição
3. **Importação em lote** de múltiplos arquivos EPLAN
4. **Templates de características técnicas** (210-804)
5. **Histórico de impressões** por MO
6. **Estatísticas de uso** de presets
7. **Exportação de presets** para compartilhamento entre instâncias

---

## Tecnologias Utilizadas

### Backend:
- FastAPI (async/await)
- SQLModel + PostgreSQL
- Alembic (migrações)
- Pydantic (validação)

### Frontend:
- React 18 + TypeScript
- react-pdf (visualização PDF)
- react-draggable (drag)
- react-resizable (resize)
- Tailwind CSS v4
- Sonner (toasts)

---

## Commits Realizados

1. `fix(eplan): corrige tipo de mo_id de int para UUID string em endpoints e schemas`
2. `feat(labels): adiciona botão floating viewer e corrige tipos UUID no frontend`
3. `chore(alembic): merge branches de device_label e door_presets`

---

## Conclusão

Todas as 4 melhorias solicitadas foram implementadas com sucesso:

✅ **Nomenclatura Descritiva** - Nomes claros ao invés de códigos  
✅ **Editor Manual de Adesivos** - Entrada rápida com floating viewer  
✅ **Sistema de Presets** - Templates reutilizáveis com favoritos  
✅ **Floating Document Viewer** - Visualização flutuante de diagramas  

O sistema está robusto, testado e pronto para uso em produção. A working tree do Git está limpa e todos os commits seguem o padrão Conventional Commits em PT-BR.

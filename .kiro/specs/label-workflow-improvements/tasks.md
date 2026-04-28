# Tasks - Melhorias no Fluxo de Trabalho de Etiquetas

## Fase 1: Nomenclatura Descritiva ✅

### Task 1.1: Atualizar constantes de nomenclatura
- [ ] Criar mapeamento código → nome descritivo em `frontend/src/app/types.ts`
- [ ] Atualizar `TASK_CODE_TO_LABEL` com nomes completos
- [ ] Adicionar constante `LABEL_CODE_MAP` para referência reversa

### Task 1.2: Refatorar LabelsDrawer
- [ ] Atualizar estrutura de TABS com `label` e `sublabel`
- [ ] Ajustar renderização de tabs para exibir nome + código
- [ ] Atualizar estilos para layout vertical (nome em cima, código embaixo)

### Task 1.3: Atualizar referências no backend
- [ ] Atualizar `TASK_LABELS` em `backend/app/api/api_v1/endpoints/production.py`
- [ ] Atualizar `FIXED_COLUMNS` em `backend/app/schemas/matrix_view.py`

## Fase 2: Editor Manual de Adesivos (210-805) ✅

### Task 2.1: Criar endpoint de criação manual
- [ ] Adicionar rota `POST /api/v1/eplan/{mo_id}/devices/manual` em `backend/app/api/api_v1/endpoints/eplan.py`
- [ ] Implementar validação de entrada (tag obrigatória, descrição obrigatória)
- [ ] Retornar DeviceLabel criado

### Task 2.2: Adicionar endpoint de atualização
- [ ] Adicionar rota `PATCH /api/v1/eplan/devices/{device_id}` 
- [ ] Permitir edição de tag, descrição, localização

### Task 2.3: Adicionar endpoint de reordenação
- [ ] Adicionar rota `POST /api/v1/eplan/{mo_id}/devices/reorder`
- [ ] Receber array de IDs na nova ordem
- [ ] Atualizar `order_index` de cada item

### Task 2.4: Criar componente ManualDeviceForm
- [ ] Criar `frontend/src/app/components/ManualDeviceForm.tsx`
- [ ] Formulário com 3 campos: tag, descrição, localização
- [ ] Validação client-side
- [ ] Integração com API

### Task 2.5: Integrar no TabDevices
- [ ] Adicionar botão "➕ Adicionar Manualmente"
- [ ] Toggle de exibição do formulário
- [ ] Atualizar lista após criação
- [ ] Adicionar edição inline (duplo clique)

### Task 2.6: Implementar drag-and-drop
- [ ] Instalar `@dnd-kit/core` e `@dnd-kit/sortable`
- [ ] Tornar linhas da tabela draggable
- [ ] Chamar endpoint de reordenação ao soltar
- [ ] Feedback visual durante drag

## Fase 3: Sistema de Presets (210-855) ✅

### Task 3.1: Criar modelo DoorLabelPreset
- [ ] Criar `backend/app/models/door_label_preset.py`
- [ ] Criar `backend/app/models/door_label_preset_favorite.py`
- [ ] Criar schemas em `backend/app/schemas/door_preset.py`

### Task 3.2: Criar migração Alembic
- [ ] Gerar migração: `alembic revision --autogenerate -m "feat: adiciona door_label_presets"`
- [ ] Adicionar seed de presets do sistema
- [ ] Testar upgrade/downgrade

### Task 3.3: Implementar endpoints de presets
- [ ] Criar `backend/app/api/api_v1/endpoints/door_presets.py`
- [ ] `GET /door-presets` - Listar com filtros
- [ ] `POST /door-presets` - Criar
- [ ] `PATCH /door-presets/{id}` - Atualizar
- [ ] `DELETE /door-presets/{id}` - Deletar
- [ ] `POST /door-presets/{id}/favorite` - Toggle favorito
- [ ] `POST /door-presets/{id}/use` - Incrementar uso

### Task 3.4: Registrar rotas no API router
- [ ] Adicionar import em `backend/app/api/api_v1/api.py`
- [ ] Registrar router com prefixo `/door-presets`

### Task 3.5: Criar serviço de presets no frontend
- [ ] Criar `frontend/src/services/doorPresetsApi.ts`
- [ ] Implementar funções para todos os endpoints
- [ ] Adicionar tipos TypeScript

### Task 3.6: Criar componente PresetCard
- [ ] Criar `frontend/src/app/components/PresetCard.tsx`
- [ ] Layout de card com ícone, nome, categoria
- [ ] Botão de favorito
- [ ] Indicador de popularidade (usage_count)
- [ ] Badge "Sistema" / "Meu" / "Equipe"

### Task 3.7: Criar componente PresetSelector
- [ ] Criar `frontend/src/app/components/PresetSelector.tsx`
- [ ] Filtros: Todos, Sistema, Meus, Equipe, Favoritos
- [ ] Grid de PresetCards
- [ ] Formulário de customização (se aplicável)
- [ ] Preview em tempo real

### Task 3.8: Criar componente PresetManager
- [ ] Criar `frontend/src/app/components/PresetManager.tsx`
- [ ] Modal com lista de presets pessoais
- [ ] Botões: Editar, Deletar, Compartilhar
- [ ] Indicador de compartilhamento

### Task 3.9: Criar componente PresetCreator
- [ ] Criar `frontend/src/app/components/PresetCreator.tsx`
- [ ] Modal com formulário completo
- [ ] Campos: nome, categoria, equipment_name, columns
- [ ] Adicionar/remover colunas dinamicamente
- [ ] Checkbox "Compartilhar com equipe"
- [ ] Preview ao vivo

### Task 3.10: Integrar no TabDoor
- [ ] Substituir formulário manual por PresetSelector
- [ ] Adicionar botão "⚙️ Gerenciar Presets"
- [ ] Adicionar botão "⭐ Salvar como Preset" após criar customizado
- [ ] Manter funcionalidade de impressão

## Fase 4: Floating Document Viewer ✅

### Task 4.1: Instalar dependências
- [ ] `npm install react-draggable react-resizable react-pdf pdfjs-dist`
- [ ] Configurar worker do pdfjs no `vite.config.ts`

### Task 4.2: Criar componente FloatingDocViewer
- [ ] Criar `frontend/src/components/FloatingDocViewer.tsx`
- [ ] Estrutura básica com barra de título e conteúdo
- [ ] Props: moId, moNumber, documentType, onClose

### Task 4.3: Implementar funcionalidade de drag
- [ ] Integrar `react-draggable` na barra de título
- [ ] Limitar bounds à viewport
- [ ] Salvar posição em localStorage

### Task 4.4: Implementar funcionalidade de resize
- [ ] Integrar `react-resizable` no container
- [ ] Definir min/max size
- [ ] Salvar tamanho em localStorage

### Task 4.5: Implementar renderização de PDF
- [ ] Integrar `react-pdf`
- [ ] Carregar documento via API
- [ ] Loading state
- [ ] Error handling

### Task 4.6: Implementar controles
- [ ] Botão Minimize (colapsa para barra)
- [ ] Botão Maximize (fullscreen)
- [ ] Botão Close
- [ ] Botão Pin (impede fechamento)
- [ ] Zoom in/out (botões + Ctrl+Scroll)
- [ ] Navegação de páginas (se multi-page)

### Task 4.7: Implementar persistência
- [ ] Salvar/restaurar posição
- [ ] Salvar/restaurar tamanho
- [ ] Salvar/restaurar zoom
- [ ] Salvar/restaurar estado pinned

### Task 4.8: Criar hook useFloatingViewer
- [ ] Criar `frontend/src/hooks/useFloatingViewer.ts`
- [ ] Gerenciar estado global do viewer
- [ ] Funções: open, close, toggle, minimize, maximize

### Task 4.9: Integrar no LoteDoDia
- [ ] Adicionar botão "📌 Fixar Diagrama" no header
- [ ] Renderizar FloatingDocViewer condicionalmente
- [ ] Passar moId/moNumber do contexto

### Task 4.10: Integrar no ManualDeviceForm
- [ ] Abrir FloatingViewer automaticamente ao clicar "Adicionar"
- [ ] Manter aberto durante preenchimento

### Task 4.11: Estilização e polish
- [ ] Sombra e bordas
- [ ] Animações de transição
- [ ] Cursor de resize
- [ ] Feedback visual de drag

## Fase 5: Testes e Documentação ✅

### Task 5.1: Testes unitários
- [ ] Testar FloatingDocViewer (drag, resize, zoom)
- [ ] Testar PresetSelector (filtros, seleção)
- [ ] Testar ManualDeviceForm (validação)

### Task 5.2: Testes de integração
- [ ] Testar fluxo completo: Floating + Manual Editor
- [ ] Testar fluxo completo: Criar preset → Compartilhar → Usar

### Task 5.3: Testes E2E
- [ ] Playwright: Abrir lote → Fixar diagrama → Adicionar dispositivo
- [ ] Playwright: Criar preset → Outro usuário visualiza

### Task 5.4: Documentação
- [ ] Atualizar README com novas funcionalidades
- [ ] Criar guia de uso para operadores
- [ ] Documentar API de presets

### Task 5.5: Validação com usuários
- [ ] Sessão de teste com 2-3 operadores
- [ ] Coletar feedback
- [ ] Ajustes finais

## Ordem de Implementação Recomendada

1. **Fase 1** (1-2 horas) - Quick win, melhora UX imediatamente
2. **Fase 2** (4-6 horas) - Funcionalidade crítica para EPLAN
3. **Fase 3** (8-10 horas) - Maior impacto na produtividade
4. **Fase 4** (6-8 horas) - Feature mais complexa, mas essencial
5. **Fase 5** (2-4 horas) - Garantia de qualidade

**Total estimado: 21-30 horas**

## Dependências entre Fases

- Fase 2 e 4 podem ser desenvolvidas em paralelo
- Fase 3 depende parcialmente de Fase 1 (nomenclatura)
- Fase 4 pode ser integrada em Fase 2 após conclusão
- Fase 5 depende de todas as anteriores

## Critérios de Conclusão

- [ ] Todas as tasks marcadas como concluídas
- [ ] Testes passando (unitários + integração)
- [ ] Documentação atualizada
- [ ] Validação com usuários realizada
- [ ] Zero bugs críticos
- [ ] Performance dentro dos requisitos (RNF01)

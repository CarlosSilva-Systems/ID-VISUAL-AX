# Melhorias no Fluxo de Trabalho de Etiquetas

## Contexto

O sistema atual de etiquetas no "Lote do Dia" possui limitações que dificultam o trabalho dos operadores:
- Códigos técnicos (210-804, 210-805) não são intuitivos
- Impossível preencher características técnicas enquanto visualiza o diagrama
- Adesivos de componente só podem ser importados via EPLAN (ainda em implantação)
- Adesivos de porta exigem preenchimento manual repetitivo de padrões comuns

## Objetivos

1. **Melhorar Identificação Visual**: Exibir nomes descritivos ao invés de códigos técnicos
2. **Visualização Simultânea**: Permitir ver diagrama enquanto preenche dados
3. **Flexibilidade de Entrada**: Adicionar criação manual de adesivos de componente
4. **Agilizar Padrões**: Sistema de templates para adesivos de porta recorrentes
5. **Colaboração**: Compartilhar presets personalizados entre usuários

## Requisitos Funcionais

### RF01 - Nomenclatura Descritiva de Etiquetas
- Exibir nome principal em destaque (ex: "Característica Técnica")
- Mostrar código técnico em segundo plano (ex: "210-804")
- Manter consistência em todas as interfaces (abas, matriz, drawers)

**Mapeamento:**
- `210-804` → "Característica Técnica"
- `210-805` → "Adesivo de Componente"
- `210-855` → "Porta do Quadro"
- `2009-110` → "Régua de Borne"

### RF02 - Visualizador Flutuante de Documentos
- Componente draggable e resizable
- Always-on-top (z-index 9999)
- Controles: minimize, maximize, close, pin
- Zoom in/out no documento
- Navegação multi-página (se aplicável)
- Persistência de posição/tamanho (localStorage)
- Disponível em todo o contexto do "Lote do Dia"
- Ativação via botão "📌 Fixar Diagrama"

**Dimensões:**
- Mínimo: 300x400px
- Máximo: 80% da viewport
- Padrão: 600x800px

### RF03 - Editor Manual de Adesivos de Componente (210-805)
- Botão "➕ Adicionar Manualmente" na aba 210-805
- Formulário inline com campos:
  - Tag do Dispositivo (obrigatório, ex: K1, DJ1)
  - Descrição (obrigatório, ex: "Contator principal bomba 1")
  - Localização (opcional, ex: "QCC-01")
- Edição inline na tabela (duplo clique)
- Reordenação via drag-and-drop
- Coexistir com importação EPLAN
- Integração automática com Floating Viewer ao adicionar item

### RF04 - Sistema de Presets para Adesivos de Porta (210-855)
- Biblioteca de templates pré-definidos:
  - **Sinaleiras**: Comando Energizado, Liga Bomba, Bomba Ligada
  - **Botoeiras 3 Posições**: MAN | O | AUT (customizável)
  - **Botoeiras 2 Posições**: MAN | AUT (customizável)
- Interface de seleção visual (cards)
- Criação de presets personalizados pelo usuário
- Salvamento local (localStorage) e remoto (banco de dados)
- Visualização de presets de outros usuários
- Favoritos pessoais
- Preview em tempo real

**Estrutura de Preset:**
```typescript
{
  id: string;
  name: string;
  category: 'sinaleira' | 'botoeira-3pos' | 'botoeira-2pos' | 'custom';
  equipment_name: string;
  columns: string[];
  rows: number;
  is_system: boolean; // true para presets padrão
  created_by?: string; // usuário criador
  is_favorite?: boolean; // favorito do usuário atual
  usage_count?: number; // popularidade
}
```

### RF05 - Compartilhamento de Presets
- Presets do sistema (não editáveis)
- Presets pessoais (privados por padrão)
- Opção "Compartilhar com equipe"
- Visualização de presets compartilhados
- Indicador de popularidade (mais usados)
- Filtros: Meus / Equipe / Sistema / Favoritos

## Requisitos Não-Funcionais

### RNF01 - Performance
- Floating Viewer deve renderizar PDF em < 2s
- Drag/resize sem lag (60fps)
- Salvamento de preset instantâneo (< 500ms)

### RNF02 - Usabilidade
- Floating Viewer não deve bloquear interação com página
- Presets devem reduzir tempo de preenchimento em 70%
- Interface intuitiva, sem necessidade de treinamento

### RNF03 - Compatibilidade
- Suporte a navegadores modernos (Chrome, Edge, Firefox)
- Responsivo (mínimo 1280px de largura)
- Funcionar offline (presets locais)

### RNF04 - Segurança
- Validação de entrada em todos os formulários
- Sanitização de nomes de presets
- Limite de 50 presets personalizados por usuário

## Casos de Uso

### UC01 - Preencher Características Técnicas com Diagrama Visível
1. Operador abre Lote do Dia
2. Clica em "Característica Técnica (210-804)"
3. Clica em "📌 Fixar Diagrama"
4. Floating Viewer abre com diagrama da MO
5. Operador arrasta viewer para lado da tela
6. Preenche dados técnicos consultando diagrama
7. Floating Viewer permanece aberto para próximas MOs

### UC02 - Adicionar Adesivo de Componente Manualmente
1. Operador abre aba "Adesivo de Componente (210-805)"
2. Clica "➕ Adicionar Manualmente"
3. Sistema abre Floating Viewer automaticamente
4. Operador visualiza diagrama e preenche:
   - Tag: K1
   - Descrição: Contator principal bomba 1
   - Localização: QCC-01
5. Clica "Salvar"
6. Item aparece na lista
7. Floating Viewer permanece aberto para próximos itens

### UC03 - Criar Adesivo de Porta com Preset
1. Operador abre aba "Porta do Quadro (210-855)"
2. Clica em card "🎛️ Botoeira 3 Posições"
3. Sistema preenche automaticamente: MAN | O | AUT
4. Operador digita nome: "RECALQUE"
5. Preview atualiza em tempo real
6. Clica "Imprimir"
7. Job criado na fila

### UC04 - Salvar Preset Personalizado
1. Operador cria adesivo de porta customizado
2. Clica "⭐ Salvar como Preset"
3. Preenche nome: "Bomba Recalque 3P"
4. Escolhe categoria: Botoeira 3 Posições
5. Marca "Compartilhar com equipe"
6. Salva
7. Preset aparece em "Meus Presets" e "Equipe"

## Critérios de Aceitação

- [ ] Todas as abas exibem nome descritivo + código
- [ ] Floating Viewer funciona em todo Lote do Dia
- [ ] Floating Viewer é draggable, resizable e persistente
- [ ] Editor manual 210-805 coexiste com importação EPLAN
- [ ] Sistema de presets reduz tempo de criação em 70%
- [ ] Usuários podem criar e compartilhar presets
- [ ] Presets compartilhados são visíveis para toda equipe
- [ ] Interface não sobrecarrega visualmente
- [ ] Testes manuais validam todos os fluxos

## Dependências

- `react-draggable` - Drag functionality
- `react-resizable` - Resize functionality  
- `react-pdf` ou `pdfjs-dist` - PDF rendering
- Backend: Novos endpoints para CRUD de presets

## Riscos

- **Performance do PDF**: Diagramas grandes podem demorar a renderizar
  - Mitigação: Loading state, lazy loading de páginas
- **Conflito de z-index**: Floating Viewer pode conflitar com modais
  - Mitigação: z-index strategy bem definida
- **Sobrecarga de presets**: Muitos presets compartilhados
  - Mitigação: Filtros, busca, ordenação por popularidade

## Métricas de Sucesso

- Redução de 70% no tempo de preenchimento de adesivos de porta
- 80% dos operadores usam Floating Viewer regularmente
- Média de 5+ presets personalizados criados por usuário
- Zero reclamações sobre usabilidade após 1 semana

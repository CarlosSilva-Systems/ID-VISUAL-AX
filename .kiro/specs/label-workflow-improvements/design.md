# Design - Melhorias no Fluxo de Trabalho de Etiquetas

## Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────┐
│                    Lote do Dia (Matriz)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Fabricação 1 │  │ Fabricação 2 │  │ Fabricação 3 │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  [📌 Fixar Diagrama] ← Botão global                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─── Abre LabelsDrawer
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                      LabelsDrawer                          │
├────────────────────────────────────────────────────────────┤
│  Tabs:                                                     │
│  [Característica Técnica] [Adesivo Componente]            │
│  [Porta do Quadro] [Régua de Borne]                       │
│         210-804            210-805                         │
│                                                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Tab Content (210-805 exemplo)                   │    │
│  │  [➕ Adicionar Manual] [📤 Importar EPLAN]       │    │
│  │                                                   │    │
│  │  Tabela de dispositivos...                       │    │
│  └──────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
                              │
                              ├─── Trigger
                              │
┌─────────────────────────────▼─────────────────────────────┐
│              FloatingDocViewer (z-index: 9999)            │
├────────────────────────────────────────────────────────────┤
│  [📌 Pin] [─ Minimize] [□ Maximize] [✕ Close]            │
│  ┌──────────────────────────────────────────────────┐    │
│  │                                                   │    │
│  │         PDF Viewer (react-pdf)                   │    │
│  │                                                   │    │
│  │         [Diagrama Elétrico]                      │    │
│  │                                                   │    │
│  └──────────────────────────────────────────────────┘    │
│  [🔍-] [🔍+] [◀ Página 1/3 ▶]                            │
└────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. FloatingDocViewer

**Localização:** `frontend/src/components/FloatingDocViewer.tsx`

**Props:**
```typescript
interface FloatingDocViewerProps {
  moId: string;
  moNumber: string;
  documentType: 'diagrama' | 'legenda';
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
}
```

**Estado Interno:**
```typescript
{
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMinimized: boolean;
  isPinned: boolean;
  zoom: number; // 0.5 a 2.0
  currentPage: number;
  totalPages: number;
  pdfUrl: string | null;
  loading: boolean;
  error: string | null;
}
```

**Persistência (localStorage):**
```typescript
{
  'floating-viewer-position': { x, y },
  'floating-viewer-size': { width, height },
  'floating-viewer-zoom': number,
  'floating-viewer-pinned': boolean
}
```

**Bibliotecas:**
- `react-draggable` - Drag
- `react-resizable` - Resize
- `react-pdf` - PDF rendering

**Comportamento:**
- Draggable pela barra de título
- Resizable pelas bordas/cantos
- Minimize → Colapsa para barra no canto inferior direito
- Pin → Impede fechamento acidental
- Zoom → Ctrl+Scroll ou botões
- Escape → Fecha (se não pinned)

### 2. LabelsDrawer (Refatorado)

**Mudanças:**

**Antes:**
```typescript
const TABS = [
  { id: 'quadro', label: '210-804', icon: <Tag /> },
  { id: 'devices', label: '210-805', icon: <FileSpreadsheet /> },
  // ...
];
```

**Depois:**
```typescript
const TABS = [
  { 
    id: 'quadro', 
    label: 'Característica Técnica',
    sublabel: '210-804',
    icon: <Tag /> 
  },
  { 
    id: 'devices', 
    label: 'Adesivo de Componente',
    sublabel: '210-805',
    icon: <FileSpreadsheet /> 
  },
  { 
    id: 'door', 
    label: 'Porta do Quadro',
    sublabel: '210-855',
    icon: <DoorOpen /> 
  },
  { 
    id: 'terminals', 
    label: 'Régua de Borne',
    sublabel: '2009-110',
    icon: <Terminal /> 
  },
];
```

**Renderização de Tab:**
```tsx
<button className="tab">
  {tab.icon}
  <div className="flex flex-col items-start">
    <span className="text-sm font-bold">{tab.label}</span>
    <span className="text-[10px] text-slate-400">{tab.sublabel}</span>
  </div>
  <Badge count={count} />
</button>
```

### 3. TabDevices (210-805) - Editor Manual

**Novo Estado:**
```typescript
{
  items: DeviceLabelItem[];
  editingId: number | null;
  showManualForm: boolean;
  manualFormData: {
    device_tag: string;
    description: string;
    location: string;
  };
}
```

**Novo Componente: ManualDeviceForm**
```tsx
<div className="border rounded-lg p-4 bg-blue-50">
  <div className="flex items-center justify-between mb-3">
    <h4 className="font-bold">Adicionar Dispositivo Manualmente</h4>
    <button onClick={openFloatingViewer}>
      📌 Ver Diagrama
    </button>
  </div>
  
  <div className="grid grid-cols-3 gap-3">
    <input placeholder="Tag (ex: K1)" />
    <input placeholder="Descrição" className="col-span-2" />
    <input placeholder="Localização (opcional)" />
  </div>
  
  <div className="flex gap-2 mt-3">
    <button onClick={handleSave}>Salvar</button>
    <button onClick={handleCancel}>Cancelar</button>
  </div>
</div>
```

**Drag-and-Drop (Reordenação):**
- Biblioteca: `react-dnd` ou `@dnd-kit/core`
- Atualiza `order_index` no backend ao soltar

### 4. TabDoor (210-855) - Sistema de Presets

**Novo Estado:**
```typescript
{
  presets: DoorLabelPreset[];
  selectedPreset: DoorLabelPreset | null;
  customEquipmentName: string;
  showPresetManager: boolean;
  filterCategory: 'all' | 'system' | 'mine' | 'team' | 'favorites';
}
```

**Novo Componente: PresetSelector**
```tsx
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <h4 className="font-bold">Usar Template</h4>
    <button onClick={() => setShowPresetManager(true)}>
      ⚙️ Gerenciar Presets
    </button>
  </div>
  
  {/* Filtros */}
  <div className="flex gap-2">
    <button className={filter === 'all' ? 'active' : ''}>
      Todos
    </button>
    <button className={filter === 'system' ? 'active' : ''}>
      Sistema
    </button>
    <button className={filter === 'mine' ? 'active' : ''}>
      Meus
    </button>
    <button className={filter === 'team' ? 'active' : ''}>
      Equipe
    </button>
    <button className={filter === 'favorites' ? 'active' : ''}>
      ⭐ Favoritos
    </button>
  </div>
  
  {/* Cards de Presets */}
  <div className="grid grid-cols-3 gap-3">
    {filteredPresets.map(preset => (
      <PresetCard
        key={preset.id}
        preset={preset}
        onSelect={handleSelectPreset}
        onFavorite={handleToggleFavorite}
      />
    ))}
  </div>
  
  {/* Formulário de Customização */}
  {selectedPreset && selectedPreset.customizable && (
    <div className="border-t pt-4">
      <label>Nome do Equipamento</label>
      <input
        value={customEquipmentName}
        onChange={e => setCustomEquipmentName(e.target.value)}
        placeholder="ex: RECALQUE"
      />
    </div>
  )}
  
  {/* Preview */}
  {selectedPreset && (
    <DoorLabelPreview
      equipmentName={customEquipmentName || selectedPreset.equipment_name}
      columns={selectedPreset.columns}
    />
  )}
</div>
```

**Novo Componente: PresetManager (Modal)**
```tsx
<Modal open={showPresetManager} onClose={...}>
  <div className="space-y-4">
    <h3>Gerenciar Presets</h3>
    
    {/* Lista de Presets Pessoais */}
    <div>
      <h4>Meus Presets</h4>
      {myPresets.map(preset => (
        <div key={preset.id} className="flex items-center justify-between">
          <span>{preset.name}</span>
          <div className="flex gap-2">
            <button onClick={() => handleShare(preset.id)}>
              {preset.is_shared ? '🌐 Compartilhado' : '🔒 Privado'}
            </button>
            <button onClick={() => handleEdit(preset.id)}>✏️</button>
            <button onClick={() => handleDelete(preset.id)}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
    
    {/* Criar Novo */}
    <button onClick={handleCreateNew}>
      ➕ Criar Novo Preset
    </button>
  </div>
</Modal>
```

**Novo Componente: PresetCreator (Modal)**
```tsx
<Modal open={showCreator} onClose={...}>
  <form onSubmit={handleCreatePreset}>
    <h3>Criar Preset Personalizado</h3>
    
    <input
      label="Nome do Preset"
      placeholder="ex: Bomba Recalque 3P"
    />
    
    <select label="Categoria">
      <option value="sinaleira">Sinaleira</option>
      <option value="botoeira-3pos">Botoeira 3 Posições</option>
      <option value="botoeira-2pos">Botoeira 2 Posições</option>
      <option value="custom">Personalizado</option>
    </select>
    
    <input
      label="Nome do Equipamento"
      placeholder="ex: RECALQUE"
    />
    
    <div>
      <label>Posições (colunas)</label>
      {columns.map((col, i) => (
        <div key={i} className="flex gap-2">
          <input value={col} onChange={e => updateColumn(i, e.target.value)} />
          <button onClick={() => removeColumn(i)}>🗑️</button>
        </div>
      ))}
      <button onClick={addColumn}>➕ Adicionar Posição</button>
    </div>
    
    <checkbox
      label="Compartilhar com equipe"
      checked={shareWithTeam}
      onChange={setShareWithTeam}
    />
    
    <div className="flex gap-2">
      <button type="submit">Salvar Preset</button>
      <button type="button" onClick={onClose}>Cancelar</button>
    </div>
  </form>
</Modal>
```

## Backend - Novos Endpoints

### Modelo: DoorLabelPreset

**Localização:** `backend/app/models/door_label_preset.py`

```python
class DoorLabelPreset(SQLModel, table=True):
    """Preset para etiquetas de porta (210-855)."""
    
    __tablename__ = "door_label_preset"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    name: str = Field(index=True)  # "Bomba Recalque 3P"
    category: str  # "sinaleira", "botoeira-3pos", "botoeira-2pos", "custom"
    
    equipment_name: str  # "RECALQUE" ou vazio se customizável
    columns: List[str] = Field(sa_column=Column(JSON))  # ["MAN", "O", "AUT"]
    rows: int = Field(default=1)
    
    is_system: bool = Field(default=False)  # Preset padrão do sistema
    is_shared: bool = Field(default=False)  # Compartilhado com equipe
    
    created_by: Optional[str] = Field(default=None)  # Username do criador
    usage_count: int = Field(default=0)  # Contador de uso
    
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
```

### Endpoints

**Localização:** `backend/app/api/api_v1/endpoints/door_presets.py`

```python
# GET /api/v1/door-presets
# Lista todos os presets (sistema + pessoais + compartilhados)
@router.get("/", response_model=List[DoorLabelPresetOut])
async def list_presets(
    category: Optional[str] = None,
    filter_type: str = "all",  # all, system, mine, team, favorites
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
):
    """Lista presets de etiquetas de porta."""
    pass

# POST /api/v1/door-presets
# Cria novo preset
@router.post("/", response_model=DoorLabelPresetOut)
async def create_preset(
    payload: DoorLabelPresetCreate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
):
    """Cria novo preset personalizado."""
    pass

# PATCH /api/v1/door-presets/{preset_id}
# Atualiza preset (apenas se criador)
@router.patch("/{preset_id}", response_model=DoorLabelPresetOut)
async def update_preset(
    preset_id: int,
    payload: DoorLabelPresetUpdate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
):
    """Atualiza preset (apenas criador)."""
    pass

# DELETE /api/v1/door-presets/{preset_id}
# Deleta preset (apenas se criador)
@router.delete("/{preset_id}")
async def delete_preset(
    preset_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
):
    """Deleta preset (apenas criador)."""
    pass

# POST /api/v1/door-presets/{preset_id}/favorite
# Marca/desmarca como favorito
@router.post("/{preset_id}/favorite")
async def toggle_favorite(
    preset_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
):
    """Marca/desmarca preset como favorito."""
    pass

# POST /api/v1/door-presets/{preset_id}/use
# Incrementa contador de uso
@router.post("/{preset_id}/use")
async def increment_usage(
    preset_id: int,
    session: AsyncSession = Depends(deps.get_session),
):
    """Incrementa contador de uso do preset."""
    pass
```

### Tabela de Favoritos

**Localização:** `backend/app/models/door_label_preset_favorite.py`

```python
class DoorLabelPresetFavorite(SQLModel, table=True):
    """Relação many-to-many entre usuários e presets favoritos."""
    
    __tablename__ = "door_label_preset_favorite"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    preset_id: int = Field(foreign_key="door_label_preset.id", index=True)
    username: str = Field(index=True)  # Username do usuário
    
    created_at: datetime = Field(default_factory=_now)
```

## Migração Alembic

**Arquivo:** `backend/alembic/versions/xxx_feat_adiciona_door_label_presets.py`

```python
def upgrade():
    # Criar tabela door_label_preset
    op.create_table(
        'door_label_preset',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('equipment_name', sa.String(), nullable=False),
        sa.Column('columns', sa.JSON(), nullable=False),
        sa.Column('rows', sa.Integer(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False),
        sa.Column('is_shared', sa.Boolean(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_door_label_preset_name', 'door_label_preset', ['name'])
    
    # Criar tabela door_label_preset_favorite
    op.create_table(
        'door_label_preset_favorite',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('preset_id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['preset_id'], ['door_label_preset.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_door_label_preset_favorite_preset_id', 'door_label_preset_favorite', ['preset_id'])
    op.create_index('ix_door_label_preset_favorite_username', 'door_label_preset_favorite', ['username'])
    
    # Inserir presets do sistema
    op.execute("""
        INSERT INTO door_label_preset (name, category, equipment_name, columns, rows, is_system, is_shared, usage_count, created_at, updated_at)
        VALUES
        ('Comando Energizado', 'sinaleira', 'COMANDO ENERGIZADO', '[]', 1, true, true, 0, NOW(), NOW()),
        ('Liga Bomba de Incêndio', 'sinaleira', 'LIGA BOMBA DE INCÊNDIO', '[]', 1, true, true, 0, NOW(), NOW()),
        ('Bomba de Incêndio Ligada', 'sinaleira', 'BOMBA DE INCÊNDIO LIGADA', '[]', 1, true, true, 0, NOW(), NOW()),
        ('Botoeira 3 Posições', 'botoeira-3pos', '', '["MAN", "O", "AUT"]', 1, true, true, 0, NOW(), NOW()),
        ('Botoeira 2 Posições', 'botoeira-2pos', '', '["MAN", "AUT"]', 1, true, true, 0, NOW(), NOW())
    """)

def downgrade():
    op.drop_table('door_label_preset_favorite')
    op.drop_table('door_label_preset')
```

## Fluxo de Dados

### Floating Viewer

```
1. Usuário clica "📌 Fixar Diagrama"
2. Frontend busca documento: GET /api/v1/documents/{mo_id}/diagrama
3. Backend retorna URL assinada do S3 ou base64
4. FloatingDocViewer renderiza PDF com react-pdf
5. Usuário arrasta/redimensiona
6. Posição/tamanho salvos em localStorage
7. Próxima abertura restaura estado
```

### Editor Manual 210-805

```
1. Usuário clica "➕ Adicionar Manualmente"
2. FloatingDocViewer abre automaticamente
3. Usuário preenche formulário
4. Clica "Salvar"
5. POST /api/v1/eplan/{mo_id}/devices/manual
6. Backend cria DeviceLabel
7. Frontend atualiza lista local
8. Toast de sucesso
```

### Sistema de Presets

```
1. Usuário abre aba "Porta do Quadro"
2. GET /api/v1/door-presets?filter_type=all
3. Backend retorna presets (sistema + pessoais + compartilhados)
4. Frontend renderiza cards
5. Usuário seleciona preset "Botoeira 3P"
6. Preenche nome: "RECALQUE"
7. Preview atualiza
8. Clica "Imprimir"
9. POST /api/v1/door-presets/{id}/use (incrementa contador)
10. POST /api/v1/print-wago/door (enfileira impressão)
```

## Estratégia de z-index

```
Base Layer (z-0):       Página principal
Drawer Layer (z-40):    LabelsDrawer
Modal Layer (z-50):     Modais gerais
Floating Layer (z-9999): FloatingDocViewer
Toast Layer (z-10000):  Notificações (sonner)
```

## Responsividade

- **Desktop (>= 1280px)**: Layout completo
- **Tablet (768-1279px)**: FloatingViewer ocupa 50% da tela
- **Mobile (< 768px)**: FloatingViewer fullscreen quando aberto

## Acessibilidade

- Floating Viewer: `role="dialog"`, `aria-label="Visualizador de Documentos"`
- Keyboard navigation: Tab, Escape, Arrow keys
- Focus trap quando minimizado
- Screen reader announcements para mudanças de estado

## Performance

- **Lazy loading**: Carregar react-pdf apenas quando necessário
- **Memoization**: React.memo em PresetCard
- **Debounce**: Salvamento de posição (500ms)
- **Virtual scrolling**: Lista de presets se > 50 itens

## Testes

### Unitários
- FloatingDocViewer: drag, resize, minimize, zoom
- PresetSelector: filtros, seleção, favoritos
- ManualDeviceForm: validação, salvamento

### Integração
- Floating Viewer + Editor Manual
- Preset creation + sharing
- Drag-and-drop reordering

### E2E
- Fluxo completo: Abrir lote → Fixar diagrama → Adicionar dispositivo
- Fluxo completo: Criar preset → Compartilhar → Outro usuário usa

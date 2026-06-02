# Correção do Bug de Pulo do Carrossel Andon TV

## Problema Identificado

O carrossel da Andon TV apresentava **pulos de seção** quando a lista de painéis mudava dinamicamente. Especificamente:

**Cenário problemático**:
1. Carrossel está exibindo "Produção" (índice 2 em `['summary', 'stopped', 'production', 'idvisual']`)
2. Todos os chamados Andon são resolvidos → "Mesas Paradas" sai da lista
3. Nova lista: `['summary', 'production', 'idvisual']`
4. **Bug**: Índice 2 agora aponta para "ID Visual" em vez de "Produção"
5. **Resultado**: Carrossel "pula" de "Produção" para "ID Visual" instantaneamente

## Causa Raiz

### Rastreamento por Índice Numérico

```typescript
// ANTES (código problemático)
const [panelIndex, setPanelIndex] = useState(0);

// Quando lista muda de tamanho, índice numérico aponta para painel diferente
// Exemplo: índice 2 em [A, B, C, D] é C, mas em [A, C, D] é D
```

O problema é que **índices numéricos não são estáveis** quando a lista muda. Remover um item no meio desloca todos os índices subsequentes.

## Solução Implementada

### Rastreamento por ID de Painel

```typescript
// Rastrear o ID do painel atual (não o índice)
const currentPanelIdRef = useRef<string>('summary');

// Sincronizar índice com o ID quando a lista muda
useEffect(() => {
    const currentId = currentPanelIdRef.current;
    const newIndex = panels.findIndex(p => p.id === currentId);
    
    if (newIndex !== -1 && newIndex !== panelIndex) {
        // Painel atual ainda existe, mas mudou de posição → ajustar índice
        setPanelIndex(newIndex);
    } else if (newIndex === -1) {
        // Painel atual foi removido → manter no índice atual
        const safeIdx = Math.min(panelIndex, panels.length - 1);
        setPanelIndex(safeIdx);
        // Atualizar ref para o novo painel atual
        if (panels[safeIdx]) {
            currentPanelIdRef.current = panels[safeIdx].id;
        }
    }
}, [panels, panelIndex]);

// Atualizar ID ao rotacionar
useEffect(() => {
    // ... rotação ...
    const next = (prev + 1) % panels.length;
    if (panels[next]) {
        currentPanelIdRef.current = panels[next].id;
    }
    return next;
}, [panelIndex, panels.length, panels]);
```

## Comportamento Esperado Após a Correção

### Cenário 1: "Mesas Paradas" Sai Durante Exibição de "Produção"

**Antes**:
- Lista: `['summary', 'stopped', 'production', 'idvisual']` → índice 2 = "Produção"
- "Mesas Paradas" sai
- Lista: `['summary', 'production', 'idvisual']` → índice 2 = "ID Visual" ❌
- **Resultado**: Pula de "Produção" para "ID Visual"

**Depois**:
- Lista: `['summary', 'stopped', 'production', 'idvisual']` → índice 2 = "Produção", ID = `'production'`
- "Mesas Paradas" sai
- `findIndex('production')` retorna 1 → ajusta índice para 1
- Lista: `['summary', 'production', 'idvisual']` → índice 1 = "Produção" ✅
- **Resultado**: Continua exibindo "Produção" normalmente

### Cenário 2: "Mesas Paradas" Entra Durante Exibição de "Produção"

**Antes**:
- Lista: `['summary', 'production', 'idvisual']` → índice 1 = "Produção"
- Chamado Andon aberto → "Mesas Paradas" entra
- Lista: `['summary', 'stopped', 'production', 'idvisual']` → índice 1 = "Mesas Paradas" ❌
- **Resultado**: Pula de "Produção" para "Mesas Paradas"

**Depois**:
- Lista: `['summary', 'production', 'idvisual']` → índice 1 = "Produção", ID = `'production'`
- Chamado Andon aberto → "Mesas Paradas" entra
- `findIndex('production')` retorna 2 → ajusta índice para 2
- Lista: `['summary', 'stopped', 'production', 'idvisual']` → índice 2 = "Produção" ✅
- **Resultado**: Continua exibindo "Produção" normalmente

### Cenário 3: Painel Atual é Removido

Se o painel sendo exibido for removido (ex: "Mesas Paradas" sai enquanto está sendo exibido):
- `findIndex` retorna -1
- Mantém o índice atual (ou ajusta se inválido)
- Atualiza o `currentPanelIdRef` para o novo painel naquela posição
- Rotação continua normalmente a partir do novo painel

## Testes Recomendados

1. **Teste de Saída de "Mesas Paradas"**:
   - Deixar carrossel exibindo "Produção" com "Mesas Paradas" na lista
   - Resolver todos os chamados Andon
   - ✅ Verificar que continua exibindo "Produção" (não pula)

2. **Teste de Entrada de "Mesas Paradas"**:
   - Deixar carrossel exibindo "Produção" sem "Mesas Paradas" na lista
   - Abrir um chamado Andon
   - ✅ Verificar que continua exibindo "Produção" (não pula)

3. **Teste de Remoção do Painel Atual**:
   - Deixar carrossel exibindo "Mesas Paradas"
   - Resolver todos os chamados Andon
   - ✅ Verificar que avança para o próximo painel válido

4. **Teste de Rotação Normal**:
   - Deixar carrossel rodando sem mudanças na lista
   - ✅ Verificar que rotação continua a cada 20 segundos

## Métricas de Sucesso

- ✅ Zero pulos de seção quando painéis entram/saem da lista
- ✅ Painel atual permanece visível quando lista muda
- ✅ Rotação continua normalmente após mudanças
- ✅ Tempo de exibição de 20 segundos por painel
- ✅ Transições visuais suaves

## Notas Técnicas

- **`useRef` para ID**: Não causa re-renders, apenas rastreia estado
- **`findIndex`**: Busca o painel pelo ID, não pelo índice
- **Sincronização**: `useEffect` roda sempre que `panels` muda, ajustando o índice
- **Fallback**: Se painel atual for removido, mantém índice (ou ajusta se inválido)
- **Atualização de ID**: Toda rotação atualiza o `currentPanelIdRef` para o novo painel

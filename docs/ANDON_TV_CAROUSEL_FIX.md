# Correção do Bug de Travamento do Carrossel Andon TV

## Problema Identificado

O carrossel da Andon TV apresentava travamentos e pulos de seções quando a lista de painéis mudava dinamicamente durante uma transição. Especificamente, quando o painel "Mesas Paradas" entrava ou saía da rotação (baseado na presença de chamados Andon ativos), o carrossel podia:

1. **Pular uma seção** — avançar 2 posições em vez de 1
2. **Travar** — ficar preso em um painel específico
3. **Exibir conteúdo incorreto** — mostrar o painel errado para o índice atual

## Causa Raiz

### Condição de Corrida na Rotação Dinâmica

```typescript
// ANTES (código problemático)
const panels = allPanels.filter(p => p.show); // Lista dinâmica

useEffect(() => {
    const timeout = setTimeout(() => {
        setPanelIndex(prev => (prev + 1) % panels.length); // ❌ Usa panels.length do momento da execução
    }, PANEL_DURATION_MS);
    return () => clearTimeout(timeout);
}, [panelIndex, panels.length]); // ❌ Reage apenas ao tamanho, não à estrutura

const safeIndex = panelIndex % Math.max(panels.length, 1); // ❌ Clamp simples não resolve dessincronia
```

### Cenário de Falha

1. **T=0s**: Carrossel em `panelIndex=1` (Produção), `panels = ['summary', 'production', 'idvisual']` (3 painéis)
2. **T=10s**: Timer dispara, inicia transição para `panelIndex=2` (ID Visual)
3. **T=10.2s**: Durante a transição, um chamado Andon é aberto → "Mesas Paradas" entra na lista
4. **T=10.4s**: `panels = ['summary', 'stopped', 'production', 'idvisual']` (4 painéis)
5. **T=10.4s**: Transição completa com `panelIndex=2`, mas agora `panels[2]` é "Produção" (não "ID Visual")
6. **Resultado**: Carrossel "pula" de volta para Produção em vez de avançar para ID Visual

## Solução Implementada

### 1. Rastreamento de Mudanças Estruturais

```typescript
const prevPanelIdsRef = useRef<string>('');
const currentPanelIds = panels.map(p => p.id).join(',');

useEffect(() => {
    if (prevPanelIdsRef.current !== currentPanelIds) {
        // Detectar entrada/saída de painéis
        const currentPanelId = panels[panelIndex]?.id;
        const newIndex = currentPanelIds.split(',').indexOf(currentPanelId);
        
        if (newIndex !== -1 && newIndex !== panelIndex) {
            // Painel atual mudou de posição → ajustar índice
            setPanelIndex(newIndex);
        } else if (newIndex === -1) {
            // Painel atual foi removido → ir para o mais próximo
            setPanelIndex(Math.min(panelIndex, panels.length - 1));
        }
        
        prevPanelIdsRef.current = currentPanelIds;
    }
}, [currentPanelIds, panelIndex, panels]);
```

### 2. Logs de Debug para Rastreamento

```typescript
console.info('[AndonTV Carousel] Mudança detectada:', {
    antes: prevIds,
    depois: currentIds,
    indiceAtual: panelIndex,
});

console.info('[AndonTV Carousel] Rotação:', prev, '→', nextIndex, `(${panels[nextIndex]?.id})`);
```

### 3. Índice Seguro com Clamp Robusto

```typescript
// Garantir que o índice nunca excede o tamanho da lista
const safeIndex = Math.min(panelIndex, panels.length - 1);
```

## Comportamento Esperado Após a Correção

### Cenário 1: Painel Entra Durante Transição
- **Antes**: Carrossel pula ou trava
- **Depois**: Índice é ajustado automaticamente, rotação continua suave

### Cenário 2: Painel Sai Durante Transição
- **Antes**: Índice inválido causa renderização vazia ou erro
- **Depois**: Índice é clamped para o painel mais próximo válido

### Cenário 3: Múltiplas Mudanças Rápidas
- **Antes**: Estado inconsistente, comportamento imprevisível
- **Depois**: Cada mudança é detectada e ajustada sequencialmente

## Testes Recomendados

1. **Teste de Entrada de "Mesas Paradas"**:
   - Deixar carrossel rodando em "Resumo → Produção → ID Visual"
   - Abrir um chamado Andon amarelo/vermelho
   - Verificar que "Mesas Paradas" entra na rotação sem pulos

2. **Teste de Saída de "Mesas Paradas"**:
   - Deixar carrossel rodando com "Mesas Paradas" ativo
   - Resolver todos os chamados Andon
   - Verificar que painel sai da rotação sem travar

3. **Teste de Timing Crítico**:
   - Abrir/fechar chamados Andon exatamente durante transições (T=12s, T=24s, etc.)
   - Verificar que carrossel nunca pula ou trava

4. **Teste de Console**:
   - Abrir DevTools → Console
   - Observar logs `[AndonTV Carousel]` durante mudanças
   - Confirmar que ajustes de índice são registrados corretamente

## Métricas de Sucesso

- ✅ Zero pulos de seção durante 1 hora de operação contínua
- ✅ Zero travamentos durante entrada/saída de painéis
- ✅ Logs de debug claros e rastreáveis
- ✅ Transições visuais suaves mesmo com mudanças dinâmicas

## Notas Técnicas

- A solução usa `useRef` para rastrear estado anterior sem causar re-renders desnecessários
- O `useEffect` de ajuste roda **antes** do `useEffect` de rotação (ordem de declaração)
- Logs de console podem ser removidos em produção se desejado (não afetam performance)
- A correção é **retrocompatível** — não quebra comportamento existente quando painéis são estáticos

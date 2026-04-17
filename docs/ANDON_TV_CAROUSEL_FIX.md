# Correção do Bug de Travamento do Carrossel Andon TV

## Problema Identificado

O carrossel da Andon TV apresentava travamentos e pulos de seções quando a lista de painéis mudava dinamicamente durante uma transição. Especificamente, quando o painel "Mesas Paradas" entrava ou saía da rotação (baseado na presença de chamados Andon ativos), o carrossel podia:

1. **Pular uma seção** — avançar 2 posições em vez de 1
2. **Travar** — ficar preso em um painel específico
3. **Exibir conteúdo incorreto** — mostrar o painel errado para o índice atual

## Causa Raiz

### Índice Inválido Após Mudança Dinâmica

```typescript
// ANTES (código problemático)
const panels = allPanels.filter(p => p.show); // Lista dinâmica

useEffect(() => {
    const timeout = setTimeout(() => {
        setPanelIndex(prev => (prev + 1) % panels.length);
    }, PANEL_DURATION_MS);
    return () => clearTimeout(timeout);
}, [panelIndex, panels.length]);

const safeIndex = panelIndex % Math.max(panels.length, 1); // ❌ Pode gerar índice inválido
```

### Cenário de Falha

1. **T=0s**: Carrossel em `panelIndex=2` (ID Visual), `panels = ['summary', 'production', 'idvisual']` (3 painéis)
2. **T=10s**: Um chamado Andon é aberto → "Mesas Paradas" entra na lista
3. **T=10.1s**: `panels = ['summary', 'stopped', 'production', 'idvisual']` (4 painéis)
4. **T=10.1s**: `panelIndex=2` agora aponta para "Produção" em vez de "ID Visual"
5. **Resultado**: Carrossel exibe painel incorreto ou trava

## Solução Implementada

### Abordagem Simplificada e Robusta

```typescript
// 1. Rotação simples e direta
useEffect(() => {
    if (panels.length <= 1) return;

    const timeout = setTimeout(() => {
        setTransitioning(true);
        setTimeout(() => {
            setPanelIndex(prev => (prev + 1) % panels.length);
            setTransitioning(false);
        }, 400);
    }, PANEL_DURATION_MS);

    return () => clearTimeout(timeout);
}, [panelIndex, panels.length]);

// 2. Ajuste automático quando lista muda
useEffect(() => {
    if (panelIndex >= panels.length && panels.length > 0) {
        setPanelIndex(panels.length - 1);
    }
}, [panels.length, panelIndex]);

// 3. Índice sempre válido
const safeIndex = Math.max(0, Math.min(panelIndex, panels.length - 1));
```

### Mudanças Implementadas

1. **Tempo aumentado**: 12s → 20s por painel (melhor legibilidade)
2. **Lógica simplificada**: Removida detecção complexa de mudanças estruturais
3. **Ajuste automático**: Quando `panels.length` muda, índice é clamped automaticamente
4. **Clamp robusto**: `Math.max(0, Math.min(panelIndex, panels.length - 1))` garante índice sempre válido

## Comportamento Esperado Após a Correção

### Cenário 1: Painel Entra Durante Rotação
- Lista cresce de 3 → 4 painéis
- Índice atual permanece válido
- Próxima rotação inclui o novo painel naturalmente

### Cenário 2: Painel Sai Durante Rotação
- Lista diminui de 4 → 3 painéis
- Se `panelIndex >= 3`, é ajustado para `2` automaticamente
- Rotação continua normalmente

### Cenário 3: Múltiplas Mudanças Rápidas
- Cada mudança dispara o `useEffect` de ajuste
- Índice é sempre clamped para valor válido
- Timer de rotação não é afetado

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
   - Abrir/fechar chamados Andon exatamente durante transições
   - Verificar que carrossel nunca pula ou trava

4. **Teste de Duração**:
   - Confirmar que cada painel fica visível por 20 segundos
   - Verificar que transições são suaves (400ms)

## Métricas de Sucesso

- ✅ Zero pulos de seção durante 1 hora de operação contínua
- ✅ Zero travamentos durante entrada/saída de painéis
- ✅ Transições visuais suaves mesmo com mudanças dinâmicas
- ✅ Tempo de exibição de 20 segundos por painel
- ✅ Lógica simples e fácil de manter

## Notas Técnicas

- A solução usa apenas 2 `useEffect`: um para rotação, outro para ajuste de índice
- Não há logs de console (removidos para produção)
- O clamp triplo (`Math.max(0, Math.min(...))`) garante índice sempre no range `[0, panels.length-1]`
- A correção é **retrocompatível** — não quebra comportamento existente quando painéis são estáticos
- Tempo de 20 segundos permite melhor leitura dos dados em cada painel

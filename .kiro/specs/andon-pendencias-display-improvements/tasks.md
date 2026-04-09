# Implementation Plan: Andon Pendências Display Improvements

## Overview

Esta feature já está **completamente implementada e funcional**. O backend retorna os campos `owner_name` e `work_type`, o frontend renderiza corretamente, e os tipos TypeScript estão atualizados.

Este plano de tasks foca em **validação, testes automatizados e documentação** para garantir qualidade e manutenibilidade da solução implementada.

## Tasks

- [ ] 1. Validar implementação atual
  - Verificar que backend retorna `owner_name` e `work_type` corretamente
  - Verificar que frontend renderiza campos no cabeçalho e tabela
  - Verificar que tipos TypeScript estão corretos
  - Testar com dados reais do Odoo
  - _Requirements: 1.1-1.5, 2.1-2.6, 3.1-3.7, 4.1-4.4_

- [ ] 2. Criar testes unitários do backend
  - [ ] 2.1 Implementar teste de enriquecimento com dados do Odoo
    - Mockar resposta do Odoo com Work Order válida
    - Verificar extração correta de `owner_name` do campo `user_id`
    - Verificar extração correta de `work_type` do campo `name`
    - _Requirements: 3.1-3.4_
  
  - [ ]* 2.2 Implementar teste de fallback quando Odoo falha
    - Mockar exceção durante `search_read` do Odoo
    - Verificar que endpoint retorna `owner_name="—"` e `work_type="—"`
    - Verificar que exceção não é propagada ao cliente
    - _Requirements: 3.6_
  
  - [ ]* 2.3 Implementar teste de priorização de WO em progresso
    - Mockar múltiplas Work Orders para o mesmo workcenter
    - Incluir WO com `state="ready"` e outra com `state="progress"`
    - Verificar que dados são extraídos da WO com `state="progress"`
    - _Requirements: 3.5_
  
  - [ ]* 2.4 Implementar teste de parsing de tipos de montagem
    - Testar diferentes formatos: "Montagem Pré", "Completo", "Montagem Final", "Outro Tipo"
    - Verificar mapeamento correto para "Pré Montagem", "Completo", "Montagem", "Outro Tipo"
    - _Requirements: 3.4, 3.7_
  
  - [ ]* 2.5 Implementar teste de normalização de labels
    - Mockar `user_id` com espaços extras: `[1, "  João  Silva  "]`
    - Verificar que `owner_name` retorna "João Silva" (normalizado)
    - _Requirements: 3.7_

- [ ] 3. Criar testes de integração do backend
  - [ ]* 3.1 Implementar teste de endpoint completo
    - Criar 3 chamados pendentes de 2 workcenters diferentes
    - Mockar respostas do Odoo para ambos workcenters
    - Verificar que response contém 3 objetos com `owner_name` e `work_type` corretos
    - _Requirements: 3.1-3.7_
  
  - [ ]* 3.2 Implementar teste de filtros aplicados
    - Testar filtro por cor: `color=RED`
    - Testar filtro por intervalo de datas: `from_date`, `to_date`
    - Verificar que dados enriquecidos persistem após aplicação de filtros
    - _Requirements: 5.3_

- [ ] 4. Criar testes do frontend
  - [ ]* 4.1 Implementar teste de renderização do cabeçalho
    - Mockar chamado com `owner_name` e `work_type` disponíveis
    - Verificar que cabeçalho exibe ícone de usuário + nome
    - Verificar que cabeçalho exibe ícone de ferramenta + tipo
    - _Requirements: 1.1-1.5_
  
  - [ ]* 4.2 Implementar teste de fallback para "—"
    - Mockar chamado sem `owner_name` ou `work_type`
    - Verificar que campos exibem "—" como placeholder
    - _Requirements: 1.3, 2.3_
  
  - [ ]* 4.3 Implementar teste da coluna "Tipo" na tabela
    - Mockar grupo expandido com 2 chamados
    - Verificar que tabela possui coluna "Tipo"
    - Verificar posicionamento entre "Responsável" e "Parou às"
    - Verificar estilo consistente com outras colunas
    - _Requirements: 2.1-2.6_
  
  - [ ]* 4.4 Implementar teste de agrupamento por workcenter
    - Mockar 5 chamados de 3 workcenters diferentes
    - Verificar que 3 grupos são renderizados
    - Verificar que cada grupo contém chamados corretos
    - _Requirements: 5.1_
  
  - [ ]* 4.5 Implementar teste de atualização via WebSocket
    - Simular evento `andon_call_justified`
    - Verificar que chamado é removido da lista sem reload completo
    - _Requirements: 5.4_

- [ ] 5. Checkpoint - Executar todos os testes
  - Executar suite de testes do backend: `pytest backend/app/tests/`
  - Executar suite de testes do frontend: `npm test` (se configurado)
  - Verificar que todos os testes passam
  - Corrigir falhas identificadas
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Validação manual em staging
  - Abrir página de Pendências com chamados existentes
  - Verificar que cabeçalho exibe nome do responsável e tipo de montagem
  - Verificar que coluna "Tipo" aparece na tabela expandida
  - Testar filtros (cor, datas) e verificar que dados enriquecidos persistem
  - Simular falha do Odoo (desligar serviço temporariamente)
  - Verificar que "—" é exibido quando Odoo está indisponível
  - Justificar um chamado e verificar remoção da lista
  - Verificar atualização em tempo real via WebSocket
  - _Requirements: 1.1-1.5, 2.1-2.6, 3.6, 5.1-5.7_

- [ ] 7. Atualizar documentação
  - [ ] 7.1 Atualizar CHANGELOG.md
    - Adicionar entrada na seção "Unreleased" ou versão atual
    - Documentar melhorias na tela de Pendências
    - Mencionar novos campos: `owner_name` e `work_type`
    - _Requirements: 1.1, 2.1_
  
  - [ ] 7.2 Atualizar documentação técnica (se existir)
    - Documentar estrutura de dados do endpoint `/calls/pending-justification`
    - Documentar lógica de enriquecimento com dados do Odoo
    - Documentar tratamento de erros e fallbacks
    - _Requirements: 3.1-3.7_
  
  - [ ] 7.3 Criar guia de troubleshooting
    - Documentar cenário: "Campos exibem '—' constantemente"
    - Solução: Verificar conectividade com Odoo, logs do backend
    - Documentar cenário: "Tipo de montagem incorreto"
    - Solução: Verificar formato do campo `name` na Work Order do Odoo
    - _Requirements: 3.6_

- [ ] 8. Configurar monitoramento (opcional)
  - [ ]* 8.1 Adicionar métricas de observabilidade
    - Adicionar contador de falhas de comunicação com Odoo
    - Adicionar métrica de latência do endpoint `/calls/pending-justification`
    - Adicionar contador de valores "—" retornados (indica problemas)
  
  - [ ]* 8.2 Configurar alertas
    - Alerta: Taxa de erro > 10% em 5 minutos
    - Alerta: Latência > 5s no endpoint
    - Notificar equipe de infraestrutura

- [ ] 9. Final checkpoint - Validação completa
  - Revisar todos os testes implementados
  - Verificar que documentação está atualizada
  - Confirmar que validação manual foi bem-sucedida
  - Verificar que não há regressões em funcionalidades existentes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- A implementação já está completa — foco é em qualidade e documentação
- Testes garantem que futuras mudanças não quebrem a funcionalidade
- Monitoramento (task 8) é altamente recomendado para produção
- Validação manual (task 6) é crítica antes de considerar a feature completa

# Implementation Plan: ESP32 OTA Management

## Overview

Este plano implementa a infraestrutura completa de OTA (Over-The-Air) Management para dispositivos ESP32 do sistema Andon. O sistema permite gerenciamento centralizado de firmware através do backend FastAPI, interface React, e comunicação MQTT. A implementação segue uma estratégia de commits atômicos e granulares, com cada tarefa representando um commit independente seguindo o padrão Conventional Commits em PT-BR.

## Tasks

- [ ] 1. Configurar infraestrutura base de OTA
  - [ ] 1.1 Adicionar variáveis de ambiente para OTA
    - Adicionar `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_TOKEN`, `OTA_STORAGE_PATH` ao `.env.example`
    - Documentar cada variável com comentários descritivos
    - _Requirements: 3.1, 25.1, 25.2_

  - [ ] 1.2 Configurar volume Docker para armazenamento de firmware
    - Adicionar volume `ota_firmware` ao `docker-compose.yml`
    - Montar volume em `/app/storage/ota/firmware` no serviço `api`
    - Adicionar comentários explicativos no docker-compose
    - _Requirements: 6.1, 25.7_

  - [ ] 1.3 Criar estrutura de diretórios para OTA
    - Criar `backend/app/models/ota.py`
    - Criar `backend/app/schemas/ota.py`
    - Criar `backend/app/services/ota_service.py`
    - Criar `backend/app/services/github_client.py`
    - Criar `backend/app/api/api_v1/endpoints/ota.py`
    - _Requirements: Estrutura do projeto_

- [ ] 2. Implementar modelos de dados e migration
  - [ ] 2.1 Criar modelo FirmwareRelease
    - Implementar SQLModel `FirmwareRelease` com todos os campos
    - Adicionar enums `FirmwareSource`
    - Implementar validações de campo (file_size > 0, version format)
    - _Requirements: 1.1, 1.2, 1.3_


  - [ ] 2.2 Criar modelo OTAUpdateLog
    - Implementar SQLModel `OTAUpdateLog` com todos os campos
    - Adicionar enum `OTAStatus`
    - Implementar constraints (progress_percent 0-100, status values)
    - Adicionar foreign keys para `esp_devices` e `firmware_releases`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 2.3 Gerar migration Alembic para tabelas OTA
    - Executar `alembic revision --autogenerate -m "feat: adiciona tabelas firmware_releases e ota_update_logs"`
    - Revisar migration gerada para garantir índices corretos
    - Adicionar índices: `idx_firmware_releases_version`, `idx_ota_logs_device_started`, `idx_ota_logs_firmware_release`, `idx_ota_logs_status`
    - _Requirements: 1.5, 2.5_

  - [ ] 2.4 Aplicar migration e validar schema
    - Executar `alembic upgrade head`
    - Validar que todas as tabelas, constraints e índices foram criados
    - _Requirements: 1.5, 2.5_

- [ ] 3. Implementar schemas Pydantic para OTA
  - [ ] 3.1 Criar schemas de request
    - Implementar `CheckGitHubRequest`, `DownloadGitHubRequest`, `TriggerOTARequest`
    - Configurar `extra="forbid"` em todos os schemas
    - Adicionar validadores de campo (version format, UUID validation)
    - _Requirements: 23.5, 26.2_

  - [ ] 3.2 Criar schemas de response
    - Implementar `FirmwareReleaseOut`, `CheckGitHubResponse`, `TriggerOTAResponse`
    - Implementar `DeviceOTAStatus`, `OTAStatusResponse`, `OTAHistoryItem`
    - Configurar `from_attributes=True` para conversão de modelos
    - _Requirements: 7.3, 7.4, 7.5, 12.2_

  - [ ] 3.3 Criar schemas de payload MQTT
    - Implementar `OTATriggerPayload` com validação de URL e size
    - Implementar `OTAProgressPayload` com validação de status e progress
    - Adicionar regex patterns para validação de campos
    - _Requirements: 26.2, 26.3, 26.4, 26.8, 26.9_


- [ ] 4. Implementar GitHub Client
  - [ ] 4.1 Criar classe GitHubClient base
    - Implementar `__init__` com configuração de base_url, owner, repo, token
    - Configurar httpx.AsyncClient com timeout de 30s
    - Implementar método `close()` para cleanup
    - _Requirements: 3.2, 3.7_

  - [ ] 4.2 Implementar fetch de latest release
    - Implementar método `get_latest_release()` com chamada à API GitHub
    - Extrair campos `tag_name`, `id`, `assets` da resposta
    - Filtrar assets para encontrar arquivo .bin
    - Tratar erros de timeout e HTTP (404, 403)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.8_

  - [ ] 4.3 Implementar fetch de release por tag
    - Implementar método `get_release_by_tag(tag)` 
    - Chamar endpoint `/repos/{owner}/{repo}/releases/tags/{tag}`
    - Reutilizar lógica de extração de assets
    - _Requirements: 9.4_

  - [ ] 4.4 Implementar download de firmware via streaming
    - Implementar método `download_asset(download_url, dest_path)`
    - Usar `httpx.stream()` para download em chunks
    - Configurar timeout de 300s (5 minutos)
    - Validar tamanho do arquivo baixado
    - Deletar arquivo parcial em caso de erro
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.8, 4.9_

- [ ] 5. Implementar OTA Service
  - [ ] 5.1 Criar classe OTAService base
    - Implementar `__init__` com session, github_client, storage_path
    - Criar diretório de storage se não existir
    - _Requirements: 4.2_

  - [ ] 5.2 Implementar validação de arquivo de firmware
    - Implementar função `validate_firmware_file(file)`
    - Validar extensão .bin
    - Validar tamanho entre 100KB e 2MB
    - Validar nome de arquivo (sem path traversal)
    - Retornar HTTPException 422 para validações falhadas
    - _Requirements: 5.2, 5.3, 23.1, 23.2_


  - [ ] 5.3 Implementar validação de versão semântica
    - Implementar função `validate_version(version)`
    - Validar formato com regex `^\d+\.\d+\.\d+$`
    - Retornar HTTPException 422 para formato inválido
    - _Requirements: 5.4, 23.3_

  - [ ] 5.4 Implementar upload manual de firmware
    - Implementar método `save_uploaded_firmware(file, version, username)`
    - Validar arquivo e versão
    - Verificar unicidade de versão no banco
    - Salvar arquivo como `firmware-{version}.bin`
    - Criar registro FirmwareRelease com source=manual_upload
    - Registrar log de operação
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ] 5.5 Implementar download de firmware do GitHub
    - Implementar método `download_firmware_from_github(release_info, username)`
    - Baixar arquivo .bin via GitHubClient
    - Validar tamanho do arquivo baixado
    - Criar registro FirmwareRelease com source=github
    - Registrar log de operação
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ] 5.6 Implementar trigger de atualização OTA
    - Implementar método `trigger_ota_update(firmware_release_id, username)`
    - Validar que firmware_release_id existe
    - Validar que arquivo .bin existe no storage
    - Buscar todos os dispositivos ESP32 cadastrados
    - Criar registros OTAUpdateLog para cada dispositivo
    - Construir payload MQTT com version, url, size
    - Publicar payload no tópico `andon/ota/trigger`
    - Emitir evento WebSocket `ota_triggered`
    - Registrar log de operação
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 23.6_

  - [ ] 5.7 Implementar cálculo de status de dispositivos
    - Implementar método `get_fleet_status()`
    - Buscar todos os dispositivos com OTAUpdateLog
    - Calcular current_version (última versão com status=success)
    - Calcular target_version (versão do log mais recente)
    - Retornar lista de DeviceOTAStatus
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6_


  - [ ] 5.8 Implementar histórico de atualizações por dispositivo
    - Implementar método `get_device_history(mac_address)`
    - Buscar dispositivo por MAC address
    - Buscar todos os OTAUpdateLog do dispositivo ordenados por started_at desc
    - Calcular duration_seconds para cada log
    - Retornar lista de OTAHistoryItem
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 6. Implementar endpoints de API OTA
  - [ ] 6.1 Criar router OTA base
    - Criar APIRouter com prefix="/ota" e tags=["OTA Management"]
    - Registrar router no `backend/app/api/api_v1/api.py`
    - _Requirements: Estrutura de endpoints_

  - [ ] 6.2 Implementar endpoint GET /firmware/releases
    - Implementar handler que lista todos os FirmwareRelease
    - Ordenar por uploaded_at descendente
    - Calcular is_latest para cada release
    - Calcular device_count consultando OTAUpdateLog
    - Retornar lista de FirmwareReleaseOut
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ] 6.3 Implementar endpoint POST /firmware/check-github
    - Implementar handler que verifica nova versão no GitHub
    - Chamar GitHubClient.get_latest_release()
    - Comparar tag_name com versão mais recente no banco
    - Retornar CheckGitHubResponse com update_available
    - Tratar erro 503 se GitHub API falhar
    - Registrar log de operação
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 6.4 Implementar endpoint POST /firmware/download-github
    - Implementar handler que baixa firmware do GitHub
    - Aceitar version opcional no body
    - Buscar release específico ou latest
    - Chamar OTAService.download_firmware_from_github()
    - Retornar 201 com FirmwareReleaseOut
    - Tratar erro 409 se versão já existir
    - Tratar erro 500 se download falhar
    - Registrar log de operação
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_


  - [ ] 6.5 Implementar endpoint POST /firmware/upload
    - Implementar handler que aceita multipart/form-data
    - Extrair file e version do form-data
    - Chamar OTAService.save_uploaded_firmware()
    - Retornar 201 com FirmwareReleaseOut
    - Tratar erro 422 para validação de arquivo/versão
    - Tratar erro 409 se versão já existir
    - Registrar log de operação
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ] 6.6 Implementar endpoint POST /trigger
    - Implementar handler que dispara atualização OTA
    - Aceitar firmware_release_id no body
    - Chamar OTAService.trigger_ota_update()
    - Retornar 202 com TriggerOTAResponse
    - Tratar erro 404 se firmware_release_id não existir
    - Tratar erro 500 se arquivo .bin não existir ou MQTT falhar
    - Implementar rate limiting de 1 req/sec
    - Registrar log de operação
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 22.5_

  - [ ] 6.7 Implementar endpoint GET /status
    - Implementar handler que retorna status de todos os dispositivos
    - Chamar OTAService.get_fleet_status()
    - Retornar OTAStatusResponse
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ] 6.8 Implementar endpoint GET /history/{mac_address}
    - Implementar handler que retorna histórico de um dispositivo
    - Validar que mac_address existe
    - Chamar OTAService.get_device_history()
    - Retornar lista de OTAHistoryItem
    - Tratar erro 404 se dispositivo não existir
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [ ] 6.9 Implementar endpoint DELETE /firmware/{release_id}
    - Implementar handler que deleta firmware release
    - Validar que release_id existe
    - Deletar arquivo .bin do storage
    - Deletar registro FirmwareRelease do banco
    - Retornar 204 No Content
    - Tratar erro 404 se release não existir
    - _Requirements: Gerenciamento de releases_


- [ ] 7. Configurar hospedagem estática de firmware
  - [ ] 7.1 Configurar StaticFiles no FastAPI
    - Adicionar mount de StaticFiles em `/static/ota/` apontando para OTA_STORAGE_PATH
    - Configurar headers `Content-Type: application/octet-stream`
    - Configurar header `Cache-Control: no-cache`
    - _Requirements: 6.2, 6.3, 6.5, 6.6_

  - [ ] 7.2 Implementar logging de downloads de firmware
    - Adicionar middleware para registrar requisições a `/static/ota/`
    - Registrar IP de origem e arquivo solicitado
    - _Requirements: 6.7_

- [ ] 8. Estender MQTT Service com handlers OTA
  - [ ] 8.1 Adicionar subscrição ao tópico andon/ota/progress/#
    - Modificar `_mqtt_loop()` para subscrever `andon/ota/progress/#`
    - _Requirements: 11.1_

  - [ ] 8.2 Implementar handler de progresso OTA
    - Implementar função `_handle_ota_progress(mac, payload_raw)`
    - Extrair payload JSON com status, progress, error
    - Buscar dispositivo ESP32 por MAC address
    - Buscar OTAUpdateLog ativo do dispositivo
    - Criar novo log se não existir
    - Atualizar status, progress_percent, error_message
    - Definir completed_at quando status=success ou failed
    - Emitir evento WebSocket `ota_progress`
    - Registrar log de operação
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11_

  - [ ] 8.3 Implementar retry com backoff para publicação MQTT
    - Modificar lógica de publicação para tentar 3 vezes
    - Implementar backoff exponencial (2^attempt segundos)
    - _Requirements: 22.8_

  - [ ] 8.4 Implementar task de monitoramento de timeout
    - Criar função `monitor_ota_timeouts()` como background task
    - Executar a cada 60 segundos
    - Buscar logs com status downloading/installing há mais de 10 minutos
    - Marcar como failed com error_message "Timeout - dispositivo não respondeu"
    - _Requirements: 22.1_


- [ ] 9. Implementar componentes frontend - Aba OTA Settings
  - [ ] 9.1 Criar componente OTASettings base
    - Criar `frontend/src/app/components/OTASettings.tsx`
    - Implementar estrutura base com estados (releases, loading, modals)
    - Implementar useEffect para buscar releases ao montar
    - _Requirements: 14.1_

  - [ ] 9.2 Implementar card de Versão Atual da Frota
    - Buscar status de dispositivos via API
    - Calcular versão mais comum
    - Exibir card com versão atual
    - _Requirements: 14.2, 14.3_

  - [ ] 9.3 Implementar card de Nova Versão Disponível
    - Exibir card quando houver release mais recente
    - Adicionar botão "Baixar Versão {version}"
    - _Requirements: 14.4, 14.7_

  - [ ] 9.4 Implementar botão Verificar GitHub
    - Adicionar botão que chama endpoint check-github
    - Exibir spinner durante verificação
    - Atualizar estado com nova versão disponível
    - _Requirements: 14.5, 14.6_

  - [ ] 9.5 Implementar botão Upload Manual
    - Adicionar botão que abre modal de upload
    - _Requirements: 14.8_

  - [ ] 9.6 Implementar lista de Versões Disponíveis
    - Buscar releases via API
    - Exibir tabela com versão, data, origem, tamanho, device_count
    - Adicionar botão "Atualizar Todos" para cada versão
    - _Requirements: 14.9, 14.10_

- [ ] 10. Implementar componente OTAUploadModal
  - [ ] 10.1 Criar estrutura base do modal
    - Criar `frontend/src/app/components/OTAUploadModal.tsx`
    - Implementar estados (file, version, uploading, progress, errors)
    - _Requirements: 15.1_

  - [ ] 10.2 Implementar campos de input
    - Adicionar input de arquivo que aceita apenas .bin
    - Adicionar campo de texto para versão
    - _Requirements: 15.2, 15.3_


  - [ ] 10.3 Implementar validação de inputs
    - Validar formato de versão (regex X.Y.Z)
    - Validar extensão .bin e tamanho 100KB-2MB
    - Exibir mensagens de erro abaixo dos campos
    - _Requirements: 15.4, 15.5, 15.6_

  - [ ] 10.4 Implementar upload com progress
    - Implementar handleUpload com FormData
    - Usar XHR para capturar progresso de upload
    - Exibir barra de progresso durante upload
    - Chamar onSuccess e fechar modal ao completar
    - Exibir toast de sucesso/erro
    - _Requirements: 15.7, 15.8, 15.9, 15.10_

- [ ] 11. Implementar componente OTAConfirmModal
  - [ ] 11.1 Criar estrutura base do modal
    - Criar `frontend/src/app/components/OTAConfirmModal.tsx`
    - Receber props: open, release, deviceCount, onConfirm, onClose
    - _Requirements: 16.1_

  - [ ] 11.2 Implementar conteúdo do modal
    - Exibir título "Confirmar Atualização OTA"
    - Exibir ícone de alerta
    - Exibir mensagem com quantidade de dispositivos e versão
    - Adicionar botões Cancelar e Confirmar Atualização
    - _Requirements: 16.2, 16.3, 16.4, 16.5_

  - [ ] 11.3 Implementar lógica de confirmação
    - Implementar handler de cancelamento
    - Implementar handler de confirmação que chama API
    - Navegar para dashboard de progresso ao confirmar
    - Exibir erro se API falhar
    - _Requirements: 16.6, 16.7, 16.8, 16.9_

- [ ] 12. Implementar componente OTAProgressDashboard
  - [ ] 12.1 Criar estrutura base do dashboard
    - Criar `frontend/src/app/components/OTAProgressDashboard.tsx`
    - Implementar estados (devices, targetVersion)
    - Implementar useEffect para buscar status inicial
    - _Requirements: 17.1_

  - [ ] 12.2 Implementar cabeçalho e resumo
    - Exibir título com versão alvo
    - Calcular e exibir contadores (concluídos, em progresso, falharam, total)
    - Usar chips coloridos para cada contador
    - _Requirements: 17.2, 17.3_


  - [ ] 12.3 Implementar lista de dispositivos agrupada
    - Separar dispositivos em Gateways e Nós
    - Usar Accordion para cada grupo
    - Exibir lista de dispositivos com DeviceProgressItem
    - _Requirements: 17.4, 17.5_

  - [ ] 12.4 Implementar componente DeviceProgressItem
    - Exibir ícone de status colorido (🟢🟡🔴⚪)
    - Exibir nome e MAC address do dispositivo
    - Exibir barra de progresso para downloading/installing
    - Exibir ícone de check para success
    - Exibir ícone de erro com tooltip para failed
    - Adicionar animação de pulso para progresso ativo
    - _Requirements: 17.6, 17.7, 17.8, 17.9, 24.6_

  - [ ] 12.5 Implementar integração WebSocket
    - Conectar ao WebSocket existente
    - Subscrever eventos `ota_progress`
    - Atualizar estado de dispositivos ao receber eventos
    - _Requirements: 17.11, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_

  - [ ] 12.6 Implementar botão de fechar
    - Exibir botão "Fechar" quando todos os dispositivos terminarem
    - Retornar à aba OTA Settings ao clicar
    - _Requirements: 17.10_

- [ ] 13. Estender API client com métodos OTA
  - [ ] 13.1 Adicionar métodos de firmware management
    - Implementar `getFirmwareReleases()`
    - Implementar `checkGitHub()`
    - Implementar `downloadFromGitHub(version?)`
    - Implementar `uploadFirmware(formData, onProgress)`
    - _Requirements: API client integration_

  - [ ] 13.2 Adicionar métodos de OTA operations
    - Implementar `triggerOTAUpdate(firmwareReleaseId)`
    - Implementar `getOTAStatus()`
    - Implementar `getOTAHistory(macAddress)`
    - _Requirements: API client integration_

  - [ ] 13.3 Implementar tratamento de erros
    - Adicionar try-catch em todos os métodos
    - Lançar erros descritivos
    - _Requirements: Error handling_


- [ ] 14. Integrar aba OTA Settings na interface
  - [ ] 14.1 Adicionar rota para OTA Settings
    - Adicionar rota `/settings/ota` no React Router
    - Importar e renderizar componente OTASettings
    - _Requirements: Frontend routing_

  - [ ] 14.2 Adicionar sub-aba em Configurações
    - Modificar componente Settings para incluir sub-aba "Atualizações"
    - Adicionar navegação entre sub-abas
    - _Requirements: 14.1_

- [ ] 15. Implementar tratamento de erros e segurança
  - [ ] 15.1 Implementar global exception handler
    - Adicionar exception handler no FastAPI
    - Gerar request_id único para cada erro
    - Registrar erro completo no log com stack trace
    - Retornar erro sanitizado ao cliente (sem stack trace)
    - _Requirements: 23.6_

  - [ ] 15.2 Implementar rate limiting no endpoint trigger
    - Adicionar decorator `@limiter.limit("1/second")` no endpoint POST /trigger
    - Configurar slowapi limiter
    - _Requirements: 22.5_

  - [ ] 15.3 Implementar validação de checksum (opcional)
    - Adicionar validação SHA-256 se GitHub fornecer hash
    - _Requirements: 23.10_

  - [ ] 15.4 Implementar auditoria de operações OTA
    - Garantir que todos os logs incluem username e timestamp
    - Formato: "OTA: {operação} {detalhes} by {username}"
    - _Requirements: 23.7_

- [ ] 16. Checkpoint - Validar backend completo
  - Executar migration e verificar schema do banco
  - Testar todos os endpoints via Postman/curl
  - Verificar logs de operações OTA
  - Validar que arquivos .bin são servidos corretamente
  - Testar MQTT handlers com mensagens simuladas
  - Garantir que todos os testes passam
  - Perguntar ao usuário se há dúvidas ou ajustes necessários


- [ ] 17. Implementar firmware ESP32 - Estrutura base OTA
  - [ ] 17.1 Criar arquivos de cabeçalho e implementação
    - Criar `hardware/include/ota.h` com declarações de funções
    - Criar `hardware/src/ota.cpp` com implementações
    - Adicionar constante `FIRMWARE_VERSION` no código
    - _Requirements: Estrutura ESP32_

  - [ ] 17.2 Implementar subscrição ao tópico OTA trigger
    - Modificar `mqttCallback` para tratar tópico `andon/ota/trigger`
    - Adicionar subscrição no `setup()`
    - _Requirements: 19.1_

  - [ ] 17.3 Implementar função handleOTATrigger
    - Criar função que recebe payload JSON
    - Desserializar JSON com ArduinoJson
    - Extrair campos version, url, size
    - Validar que JSON é válido
    - _Requirements: 19.2, 26.5, 26.6, 26.7_

  - [ ] 17.4 Implementar validação de versão
    - Comparar version do payload com FIRMWARE_VERSION
    - Ignorar comando se versões são iguais
    - Publicar log message se versão já instalada
    - _Requirements: 19.3, 19.4_

- [ ] 18. Implementar firmware ESP32 - Download de firmware
  - [ ] 18.1 Implementar publicação de progresso inicial
    - Publicar mensagem com status=downloading, progress=0
    - _Requirements: 19.5_

  - [ ] 18.2 Configurar HTTPUpdate
    - Inicializar HTTPUpdate com LED indicator
    - Configurar callback de progresso
    - Configurar timeout de 300 segundos
    - _Requirements: 19.6, 19.9_

  - [ ] 18.3 Implementar callback de progresso
    - Calcular porcentagem de progresso
    - Publicar mensagem a cada 10% de progresso
    - _Requirements: 19.7, 19.8_


  - [ ] 18.4 Implementar tratamento de erros de download
    - Tratar HTTP_UPDATE_FAILED
    - Publicar mensagem com status=failed e error message
    - _Requirements: 19.10_

  - [ ] 18.5 Implementar função publishOTAProgress
    - Criar função que serializa payload JSON
    - Publicar no tópico `andon/ota/progress/{mac}`
    - _Requirements: MQTT publishing_

- [ ] 19. Implementar firmware ESP32 - Instalação e validação
  - [ ] 19.1 Implementar validação de checksum
    - Validar checksum do firmware baixado
    - Publicar erro se validação falhar
    - _Requirements: 20.3, 20.4_

  - [ ] 19.2 Implementar escrita na OTA partition
    - Usar biblioteca Update para escrever firmware
    - Marcar nova partição como bootável
    - _Requirements: 20.2, 20.5_

  - [ ] 19.3 Implementar publicação de sucesso e reboot
    - Publicar mensagem com status=success, progress=100
    - Aguardar 3 segundos
    - Chamar ESP.restart()
    - _Requirements: 20.6, 20.7_

  - [ ] 19.4 Implementar validação de boot
    - Validar conexão WiFi e MQTT após boot
    - Rollback automático se validação falhar
    - Publicar log message se rollback ocorrer
    - _Requirements: 20.8, 20.9, 20.10_

- [ ] 20. Implementar firmware ESP32 - Propagação Mesh (opcional)
  - [ ] 20.1 Implementar delay antes de reboot em Gateway
    - Aguardar 30 segundos antes de reiniciar Gateway
    - _Requirements: 21.1_

  - [ ] 20.2 Implementar republicação de comando OTA
    - Gateway republica comando OTA após reiniciar
    - _Requirements: 21.2_

  - [ ] 20.3 Implementar delay aleatório em Nós
    - Adicionar delay aleatório de 0-60s antes de download
    - Evitar sobrecarga simultânea do servidor
    - _Requirements: 21.4_


- [ ] 21. Implementar testes unitários backend
  - [ ]* 21.1 Criar testes de upload de firmware
    - Testar upload bem-sucedido
    - Testar rejeição de versão duplicada (409)
    - Testar rejeição de arquivo inválido (422)
    - Testar rejeição de tamanho inválido (422)
    - _Requirements: 5.2, 5.3, 5.5, 5.6_

  - [ ]* 21.2 Criar testes de trigger OTA
    - Testar que trigger cria logs para todos os dispositivos
    - Testar que trigger retorna 404 para firmware inexistente
    - Testar que trigger publica mensagem MQTT
    - _Requirements: 10.3, 10.4, 10.7_

  - [ ]* 21.3 Criar testes de MQTT progress handler
    - Testar que mensagem de progresso atualiza log
    - Testar que status=success define completed_at
    - Testar que dispositivo inexistente é ignorado
    - _Requirements: 11.3, 11.4, 11.7_

  - [ ]* 21.4 Criar testes de endpoints de API
    - Testar GET /firmware/releases retorna lista ordenada
    - Testar GET /status retorna status de dispositivos
    - Testar GET /history/{mac} retorna histórico
    - Testar POST /check-github retorna update_available
    - _Requirements: 7.2, 12.2, 13.4, 8.3_

- [ ] 22. Implementar testes property-based backend
  - [ ]* 22.1 Criar teste de Property 1: File Upload Validation
    - Gerar file_size e extension aleatórios
    - Validar que apenas .bin entre 100KB-2MB é aceito
    - _Requirements: Property 1_

  - [ ]* 22.2 Criar teste de Property 2: Version Uniqueness
    - Gerar version aleatória
    - Validar que segunda criação com mesma versão falha
    - _Requirements: Property 2_

  - [ ]* 22.3 Criar teste de Property 5: Semantic Version Format
    - Gerar string aleatória
    - Validar que apenas formato X.Y.Z é aceito
    - _Requirements: Property 5_


  - [ ]* 22.4 Criar teste de Property 6: Path Traversal Prevention
    - Gerar filename aleatório
    - Validar que nomes com .., /, \ são rejeitados
    - _Requirements: Property 6_

  - [ ]* 22.5 Criar teste de Property 11: MQTT Trigger Payload Round-Trip
    - Gerar version, url, size aleatórios
    - Validar que serialize → deserialize → serialize é equivalente
    - _Requirements: Property 11_

  - [ ]* 22.6 Criar teste de Property 12: MQTT Progress Payload Round-Trip
    - Gerar status, progress, error aleatórios
    - Validar que serialize → deserialize → serialize é equivalente
    - _Requirements: Property 12_

- [ ] 23. Implementar testes frontend
  - [ ]* 23.1 Criar testes de componente OTASettings
    - Testar que releases são exibidos
    - Testar que botão de atualização abre modal
    - Testar que verificação GitHub funciona
    - _Requirements: 14.2, 14.5, 14.9_

  - [ ]* 23.2 Criar testes de componente OTAUploadModal
    - Testar validação de arquivo
    - Testar validação de versão
    - Testar upload com progresso
    - _Requirements: 15.4, 15.5, 15.7_

  - [ ]* 23.3 Criar testes de componente OTAProgressDashboard
    - Testar que dispositivos são exibidos
    - Testar que progresso é atualizado via WebSocket
    - Testar que contadores são calculados corretamente
    - _Requirements: 17.3, 17.7, 18.5_

  - [ ]* 23.4 Criar testes property-based de validação
    - Testar Property 5: Semantic Version Format
    - Testar Property 6: Path Traversal Prevention
    - _Requirements: Property 5, Property 6_

- [ ] 24. Checkpoint - Validar frontend completo
  - Testar fluxo completo de upload manual
  - Testar fluxo completo de download do GitHub
  - Testar fluxo completo de trigger OTA
  - Validar que dashboard atualiza em tempo real
  - Validar que todos os componentes renderizam corretamente
  - Garantir que todos os testes passam
  - Perguntar ao usuário se há dúvidas ou ajustes necessários


- [ ] 25. Documentação e finalização
  - [ ] 25.1 Atualizar README do backend
    - Adicionar seção "OTA Management"
    - Documentar endpoints da API com exemplos
    - Documentar tópicos MQTT e payloads
    - Adicionar seção "Troubleshooting OTA"
    - _Requirements: 25.3, 25.4, 25.5, 25.6, 25.8_

  - [ ] 25.2 Atualizar README do frontend
    - Documentar novos componentes OTA
    - Adicionar screenshots da interface
    - _Requirements: Documentação frontend_

  - [ ] 25.3 Atualizar README do hardware
    - Documentar processo de OTA no firmware
    - Documentar tópicos MQTT usados
    - Adicionar troubleshooting de OTA
    - _Requirements: 25.9_

  - [ ] 25.4 Atualizar CHANGELOG.md
    - Adicionar entrada para feature OTA Management
    - Listar todos os endpoints, componentes e funcionalidades
    - _Requirements: Documentação de mudanças_

  - [ ] 25.5 Criar guia de teste de OTA em desenvolvimento
    - Documentar como testar atualização OTA localmente
    - Documentar como simular dispositivos ESP32
    - _Requirements: 25.9_

  - [ ] 25.6 Validar variáveis de ambiente
    - Verificar que todas as variáveis estão em .env.example
    - Verificar que comentários são descritivos
    - _Requirements: 25.1, 25.2_

- [ ] 26. Checkpoint final - Validar sistema completo
  - Executar teste de integração end-to-end
  - Validar fluxo completo: upload → trigger → progresso → sucesso
  - Validar tratamento de erros em todos os pontos
  - Validar logs de auditoria
  - Validar que documentação está completa
  - Garantir que todos os testes passam
  - Perguntar ao usuário se há dúvidas ou ajustes finais necessários


## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and user feedback
- All commits should follow Conventional Commits format in PT-BR
- Backend tasks use async/await throughout
- Frontend tasks use React hooks and TypeScript
- ESP32 tasks use Arduino framework with PlatformIO
- Property-based tests validate universal correctness properties
- Unit tests validate specific examples and edge cases

## Commit Strategy

Each task should result in an atomic commit following this pattern:

**Backend commits:**
- `feat(ota): implementa modelo FirmwareRelease`
- `feat(ota): adiciona endpoint POST /firmware/upload`
- `feat(ota): estende MQTT service com handler de progresso OTA`
- `refactor(ota): adiciona validação de path traversal em uploads`
- `test(ota): adiciona testes property-based de validação de versão`

**Frontend commits:**
- `feat(ui): implementa componente OTASettings`
- `feat(ui): adiciona modal de upload manual de firmware`
- `feat(ui): implementa dashboard de progresso OTA em tempo real`
- `ui(ota): adiciona animação de pulso em barras de progresso`
- `test(ui): adiciona testes de componente OTAProgressDashboard`

**Hardware commits:**
- `feat(firmware): implementa handler de comando OTA via MQTT`
- `feat(firmware): adiciona download e instalação de firmware OTA`
- `feat(firmware): implementa validação de boot e rollback automático`

**Infrastructure commits:**
- `chore(docker): adiciona volume para armazenamento de firmware OTA`
- `chore(env): adiciona variáveis de ambiente para GitHub integration`
- `docs(ota): documenta endpoints de API e tópicos MQTT`

**Migration commits:**
- `feat(db): adiciona tabelas firmware_releases e ota_update_logs`

## Implementation Order Rationale

1. **Infrastructure first**: Setup environment, volumes, and directory structure
2. **Data layer**: Models and migrations ensure database is ready
3. **Business logic**: Services implement core functionality
4. **API layer**: Endpoints expose functionality to clients
5. **MQTT integration**: Real-time communication with devices
6. **Frontend UI**: User interface for management
7. **ESP32 firmware**: Device-side OTA processing
8. **Testing**: Validate all components work correctly
9. **Documentation**: Ensure system is maintainable

This order minimizes dependencies and allows incremental testing at each stage.

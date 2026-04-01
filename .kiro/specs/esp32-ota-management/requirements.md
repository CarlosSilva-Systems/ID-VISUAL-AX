# Requirements Document

## Introduction

Esta feature implementa a infraestrutura completa de OTA (Over-The-Air) Management para a rede de dispositivos ESP32 do sistema Andon do ID Visual AX. O sistema permitirá que gestores de TI gerenciem, hospedem e disparem atualizações de firmware para dezenas ou centenas de dispositivos ESP32 de forma centralizada através do backend FastAPI e interface React. O backend atuará como "garçom de firmware", integrando-se com a API de Releases do GitHub para baixar automaticamente novas versões, hospedando os arquivos .bin em rota HTTP estática não criptografada (otimizada para ESP32), e orquestrando o processo de atualização via mensageria MQTT. O frontend fornecerá uma interface de controle com dashboard de progresso em tempo real via WebSocket, permitindo que gestores monitorem o status de atualização de cada dispositivo individualmente durante a propagação pela rede Mesh.

## Glossary

- **OTA_Update**: Atualização de firmware Over-The-Air que permite reprogramar ESP32 remotamente sem acesso físico.
- **Firmware_Binary**: Arquivo .bin compilado contendo o código executável do firmware ESP32.
- **GitHub_Release**: Release publicado no repositório GitHub contendo o Firmware_Binary como asset.
- **Static_Firmware_Host**: Rota HTTP estática do backend que serve arquivos .bin para download pelos ESP32.
- **OTA_Trigger**: Comando MQTT publicado no tópico `andon/ota/trigger` contendo URL e versão do firmware.
- **OTA_Progress**: Mensagem MQTT publicada por cada ESP32 no tópico `andon/ota/progress/{mac}` reportando porcentagem de download/instalação.
- **OTA_Dashboard**: Interface React que exibe progresso em tempo real de todos os dispositivos durante atualização.
- **Patient_Zero_OTA**: Primeiro dispositivo (Gateway Mesh) que recebe a atualização e a propaga para nós filhos via rede Mesh.
- **Firmware_Version**: String semântica (ex: "1.2.0") identificando a versão do firmware.
- **OTA_Manager_Service**: Serviço backend responsável por gerenciar o ciclo de vida de atualizações OTA.
- **MQTT_OTA_Listener**: Componente que escuta mensagens de progresso no tópico `andon/ota/progress/#`.
- **Firmware_Storage**: Volume Docker (SSD) onde arquivos .bin são armazenados persistentemente.
- **Manual_Upload**: Método alternativo de upload de firmware via interface web para cenários sem internet.
- **GitHub_API_Integration**: Integração com GitHub REST API para buscar releases e baixar assets.
- **OTA_State**: Estado do processo de atualização: `idle`, `downloading`, `installing`, `success`, `failed`.
- **Rollback_Mechanism**: Mecanismo de segurança do ESP32 que reverte para firmware anterior se a nova versão falhar na inicialização.
- **OTA_Partition**: Partição de memória flash do ESP32 dedicada a armazenar firmware alternativo para atualizações.
- **Mesh_Propagation**: Propagação de atualização OTA através da rede ESP-MESH, onde Gateway atualiza primeiro e nós filhos seguem em cascata.
- **WebSocket_OTA_Event**: Evento WebSocket transmitido para frontend contendo progresso de atualização de um dispositivo.
- **Confirmation_Modal**: Modal React que solicita confirmação do usuário antes de disparar atualização em massa.
- **Progress_Bar**: Componente visual que exibe porcentagem de progresso de download/instalação de cada dispositivo.
- **Current_Fleet_Version**: Versão de firmware rodando na maioria dos dispositivos da rede.
- **Available_Update**: Nova versão de firmware disponível para instalação (detectada via GitHub ou upload manual).

---

## Requirements

### Requirement 1: Modelo de Dados — Firmware Release

**User Story:** Como gestor de TI, quero que o sistema registre metadados de cada versão de firmware disponível, para que eu possa rastrear histórico de releases e auditar atualizações.

#### Acceptance Criteria

1. THE System SHALL armazenar cada Firmware_Release com os campos: `id` (UUID), `version` (string, formato semântico), `filename` (string, nome do arquivo .bin), `file_size` (inteiro, bytes), `source` (enum: `github` | `manual_upload`), `github_release_id` (inteiro, opcional), `download_url` (string, URL do GitHub ou null), `local_path` (string, caminho no Firmware_Storage), `uploaded_at` (timestamp com timezone), `uploaded_by` (string, usuário ou "system").
2. THE System SHALL garantir unicidade do campo `version` na tabela `firmware_releases`.
3. THE System SHALL criar índice de banco de dados no campo `version` para otimizar buscas por versão específica.
4. WHEN um Firmware_Release é criado, THE System SHALL definir `uploaded_at` como o timestamp UTC corrente.
5. THE System SHALL gerar uma migration Alembic para criar a tabela `firmware_releases` com todos os campos, constraints e índices definidos.

---

### Requirement 2: Modelo de Dados — OTA Update Log

**User Story:** Como engenheiro de suporte, quero que cada tentativa de atualização OTA seja registrada com status e detalhes, para que eu possa diagnosticar falhas e auditar o histórico de atualizações de cada dispositivo.

#### Acceptance Criteria

1. THE System SHALL armazenar cada OTA_Update_Log com os campos: `id` (UUID), `device_id` (UUID, FK para ESP32_Device), `firmware_release_id` (UUID, FK para Firmware_Release), `started_at` (timestamp com timezone), `completed_at` (timestamp com timezone, opcional), `status` (enum: `downloading` | `installing` | `success` | `failed`), `progress_percent` (inteiro, 0-100), `error_message` (string, opcional), `previous_version` (string, opcional), `target_version` (string).
2. THE System SHALL criar índice composto de banco de dados nos campos `device_id` e `started_at` para otimizar consultas de histórico por dispositivo.
3. THE System SHALL criar índice de banco de dados no campo `firmware_release_id` para otimizar consultas de dispositivos atualizados para uma versão específica.
4. WHEN um OTA_Update_Log é criado, THE System SHALL definir `status = downloading` e `progress_percent = 0`.
5. THE System SHALL gerar uma migration Alembic para criar a tabela `ota_update_logs` com todos os campos, constraints e índices definidos.

---

### Requirement 3: Backend — Integração com GitHub Releases API

**User Story:** Como gestor de TI, quero que o sistema verifique automaticamente novas versões de firmware no GitHub, para que eu não precise fazer upload manual a cada release.

#### Acceptance Criteria

1. THE System SHALL adicionar as variáveis de ambiente `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` e `GITHUB_TOKEN` (opcional, para repos privados) ao arquivo `.env.example`.
2. THE System SHALL implementar uma função `fetch_latest_github_release()` que consulta a API `GET /repos/{owner}/{repo}/releases/latest` do GitHub.
3. WHEN a função `fetch_latest_github_release()` é chamada, THE System SHALL extrair os campos `tag_name`, `id`, `assets` da resposta JSON.
4. THE System SHALL filtrar a lista de `assets` para encontrar o primeiro arquivo com extensão `.bin`.
5. IF nenhum asset `.bin` for encontrado no release, THEN THE System SHALL retornar erro com mensagem "Nenhum arquivo .bin encontrado no release".
6. WHEN um asset `.bin` é encontrado, THE System SHALL extrair `name`, `size` e `browser_download_url` do asset.
7. THE System SHALL usar a biblioteca `httpx` com timeout de 30 segundos para todas as requisições à API do GitHub.
8. IF a requisição à API do GitHub falhar (timeout, 404, 403), THEN THE System SHALL registrar o erro no log e retornar exceção descritiva.

---

### Requirement 4: Backend — Download de Firmware do GitHub

**User Story:** Como sistema backend, quero baixar automaticamente o arquivo .bin do GitHub Release, para que ele fique disponível para os ESP32 via rota HTTP local.

#### Acceptance Criteria

1. THE System SHALL implementar uma função `download_firmware_from_github(release_info)` que baixa o arquivo .bin do GitHub.
2. WHEN a função é chamada, THE System SHALL criar o diretório `{DOCKER_VOLUME}/ota/firmware/` se não existir.
3. THE System SHALL baixar o arquivo .bin usando streaming (`httpx.stream()`) para evitar carregar o arquivo inteiro na memória.
4. WHEN o download inicia, THE System SHALL salvar o arquivo com o nome `firmware-{version}.bin` no diretório `{DOCKER_VOLUME}/ota/firmware/`.
5. THE System SHALL validar que o tamanho do arquivo baixado corresponde ao `size` reportado pela API do GitHub.
6. IF o tamanho do arquivo baixado for diferente do esperado, THEN THE System SHALL deletar o arquivo parcial e retornar erro "Download incompleto".
7. WHEN o download é concluído com sucesso, THE System SHALL criar um registro `Firmware_Release` no banco de dados com `source = github`.
8. THE System SHALL usar timeout de 300 segundos (5 minutos) para o download completo do arquivo.
9. IF o download falhar (timeout, erro de rede), THEN THE System SHALL deletar o arquivo parcial e retornar exceção descritiva.

---

### Requirement 5: Backend — Upload Manual de Firmware

**User Story:** Como gestor de TI, quero fazer upload manual de arquivos .bin via interface web, para que eu possa atualizar dispositivos em cenários sem acesso à internet.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `POST /api/v1/ota/firmware/upload` que aceita upload de arquivo via `multipart/form-data`.
2. THE System SHALL validar que o arquivo enviado tem extensão `.bin` e tamanho entre 100KB e 2MB.
3. IF a validação de extensão ou tamanho falhar, THEN THE System SHALL retornar HTTP 422 com mensagem descritiva.
4. THE System SHALL extrair o campo `version` do form-data (string obrigatória no formato semântico, ex: "1.2.0").
5. THE System SHALL validar que a `version` fornecida não existe na tabela `firmware_releases`.
6. IF a `version` já existir, THEN THE System SHALL retornar HTTP 409 com mensagem "Versão {version} já existe".
7. WHEN a validação é bem-sucedida, THE System SHALL salvar o arquivo como `firmware-{version}.bin` no diretório `{DOCKER_VOLUME}/ota/firmware/`.
8. THE System SHALL criar um registro `Firmware_Release` no banco de dados com `source = manual_upload` e `download_url = null`.
9. THE System SHALL retornar HTTP 201 com o objeto `Firmware_Release` criado.
10. THE System SHALL registrar no log da aplicação "OTA: Firmware {version} uploaded manually by user {username}".

---

### Requirement 6: Backend — Hospedagem Estática de Firmware

**User Story:** Como dispositivo ESP32, quero baixar o arquivo .bin via HTTP simples sem SSL, para que o download seja rápido e não sobrecarregue o microcontrolador com overhead de criptografia.

#### Acceptance Criteria

1. THE System SHALL montar o diretório `{DOCKER_VOLUME}/ota/firmware/` como volume Docker persistente no `docker-compose.yml`.
2. THE System SHALL configurar o FastAPI para servir arquivos estáticos do diretório `{DOCKER_VOLUME}/ota/firmware/` na rota `/static/ota/`.
3. WHEN um arquivo `firmware-1.2.0.bin` existe no diretório, THE System SHALL torná-lo acessível via `http://{BACKEND_HOST}/static/ota/firmware-1.2.0.bin`.
4. THE System SHALL configurar o servidor de arquivos estáticos SEM criptografia SSL (HTTP puro) para otimizar performance de download pelos ESP32.
5. THE System SHALL configurar headers HTTP `Content-Type: application/octet-stream` para todos os arquivos `.bin`.
6. THE System SHALL configurar header HTTP `Cache-Control: no-cache` para evitar cache de versões antigas pelos ESP32.
7. THE System SHALL registrar no log da aplicação cada requisição de download de firmware com IP de origem e arquivo solicitado.

---

### Requirement 7: Backend — Endpoint de Listagem de Versões

**User Story:** Como frontend React, quero consultar todas as versões de firmware disponíveis, para que eu possa exibir a lista de releases e identificar a versão mais recente.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `GET /api/v1/ota/firmware/releases` que retorna a lista de Firmware_Releases.
2. THE System SHALL ordenar a lista por `uploaded_at` descendente (mais recente primeiro).
3. THE System SHALL incluir todos os campos do modelo `Firmware_Release` na resposta JSON.
4. THE System SHALL incluir um campo calculado `is_latest` (booleano) indicando se aquele release é o mais recente.
5. THE System SHALL incluir um campo calculado `device_count` (inteiro) indicando quantos dispositivos estão rodando aquela versão.
6. THE System SHALL calcular `device_count` consultando a tabela `ota_update_logs` e contando dispositivos com `status = success` para aquele `firmware_release_id`.
7. THE System SHALL retornar HTTP 200 com array JSON de releases.

---

### Requirement 8: Backend — Endpoint de Verificação de Nova Versão no GitHub

**User Story:** Como gestor de TI, quero verificar manualmente se há nova versão no GitHub, para que eu possa decidir quando baixar e instalar.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `POST /api/v1/ota/firmware/check-github` que verifica nova versão no GitHub.
2. WHEN o endpoint é chamado, THE System SHALL executar `fetch_latest_github_release()` conforme Requirement 3.
3. THE System SHALL comparar o `tag_name` do GitHub com a versão mais recente na tabela `firmware_releases`.
4. IF o `tag_name` do GitHub for mais recente (comparação semântica), THEN THE System SHALL retornar HTTP 200 com `{"update_available": true, "version": "1.2.0", "download_url": "..."}`.
5. IF o `tag_name` do GitHub for igual ou mais antigo, THEN THE System SHALL retornar HTTP 200 com `{"update_available": false}`.
6. IF a consulta ao GitHub falhar, THEN THE System SHALL retornar HTTP 503 com mensagem "Falha ao consultar GitHub API".
7. THE System SHALL registrar no log da aplicação "OTA: GitHub check - latest version: {version}".

---

### Requirement 9: Backend — Endpoint de Download de Firmware do GitHub

**User Story:** Como gestor de TI, quero baixar manualmente uma versão específica do GitHub, para que ela fique disponível para instalação nos dispositivos.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `POST /api/v1/ota/firmware/download-github` que baixa firmware do GitHub.
2. THE System SHALL aceitar um body JSON com campo `version` (string, opcional - se omitido, baixa a versão mais recente).
3. WHEN o endpoint é chamado sem `version`, THE System SHALL executar `fetch_latest_github_release()` e baixar o release mais recente.
4. WHEN o endpoint é chamado com `version` específica, THE System SHALL buscar o release correspondente via API `GET /repos/{owner}/{repo}/releases/tags/{version}`.
5. THE System SHALL executar `download_firmware_from_github()` conforme Requirement 4.
6. WHEN o download é concluído com sucesso, THE System SHALL retornar HTTP 201 com o objeto `Firmware_Release` criado.
7. IF a versão já existir na tabela `firmware_releases`, THEN THE System SHALL retornar HTTP 409 com mensagem "Versão {version} já existe".
8. IF o download falhar, THEN THE System SHALL retornar HTTP 500 com mensagem descritiva do erro.
9. THE System SHALL registrar no log da aplicação "OTA: Firmware {version} downloaded from GitHub by user {username}".

---

### Requirement 10: Backend — MQTT Trigger de Atualização

**User Story:** Como backend OTA Manager, quero publicar um comando MQTT para disparar atualização em todos os dispositivos, para que eles iniciem o download e instalação do novo firmware.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `POST /api/v1/ota/trigger` que dispara atualização OTA em massa.
2. THE System SHALL aceitar um body JSON com campo `firmware_release_id` (UUID obrigatório).
3. THE System SHALL validar que o `firmware_release_id` existe na tabela `firmware_releases`.
4. IF o `firmware_release_id` não existir, THEN THE System SHALL retornar HTTP 404 com mensagem "Firmware release não encontrado".
5. WHEN a validação é bem-sucedida, THE System SHALL construir um payload JSON contendo `{"version": "1.2.0", "url": "http://{BACKEND_HOST}/static/ota/firmware-1.2.0.bin", "size": 1234567}`.
6. THE System SHALL publicar o payload JSON no tópico MQTT `andon/ota/trigger` com QoS 1.
7. THE System SHALL criar registros `OTA_Update_Log` com `status = downloading` para todos os dispositivos ESP32 cadastrados na tabela `esp_devices`.
8. THE System SHALL retornar HTTP 202 com mensagem "Atualização OTA disparada para {N} dispositivos".
9. THE System SHALL registrar no log da aplicação "OTA: Update triggered for version {version} by user {username}".
10. THE System SHALL emitir um evento WebSocket `ota_triggered` com payload `{"version": "1.2.0", "device_count": N}`.

---

### Requirement 11: Backend — MQTT Listener de Progresso OTA

**User Story:** Como backend OTA Manager, quero escutar mensagens de progresso dos ESP32, para que eu possa atualizar o status de cada dispositivo no banco de dados e notificar o frontend via WebSocket.

#### Acceptance Criteria

1. THE MQTT_Service SHALL se inscrever no tópico `andon/ota/progress/#` com QoS 1 quando a conexão MQTT é estabelecida.
2. WHEN uma mensagem é recebida no tópico `andon/ota/progress/{mac}`, THE MQTT_Service SHALL extrair o payload JSON contendo `{"status": "downloading", "progress": 45, "error": null}`.
3. THE MQTT_Service SHALL buscar o dispositivo ESP32 correspondente ao `{mac}` na tabela `esp_devices`.
4. IF o dispositivo não for encontrado, THEN THE MQTT_Service SHALL registrar um aviso no log e descartar a mensagem.
5. THE MQTT_Service SHALL buscar o registro `OTA_Update_Log` mais recente do dispositivo com `status != success` e `status != failed`.
6. IF nenhum registro `OTA_Update_Log` ativo for encontrado, THEN THE MQTT_Service SHALL criar um novo registro com `status = downloading`.
7. WHEN um registro `OTA_Update_Log` é encontrado, THE MQTT_Service SHALL atualizar os campos `status`, `progress_percent` e `error_message` conforme o payload recebido.
8. WHEN `status = success`, THE MQTT_Service SHALL definir `completed_at` como o timestamp UTC corrente.
9. WHEN `status = failed`, THE MQTT_Service SHALL definir `completed_at` como o timestamp UTC corrente e salvar `error_message`.
10. THE MQTT_Service SHALL emitir um evento WebSocket `ota_progress` com payload `{"mac": "AA:BB:CC:DD:EE:FF", "status": "downloading", "progress": 45}`.
11. THE MQTT_Service SHALL registrar no log da aplicação "OTA: Device {mac} - {status} - {progress}%".

---

### Requirement 12: Backend — Endpoint de Status de Atualização

**User Story:** Como frontend React, quero consultar o status de atualização de todos os dispositivos, para que eu possa exibir o dashboard de progresso em tempo real.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `GET /api/v1/ota/status` que retorna o status de atualização de todos os dispositivos.
2. THE System SHALL retornar um array JSON com objetos contendo: `device_id`, `mac_address`, `device_name`, `current_version`, `target_version`, `status`, `progress_percent`, `error_message`, `started_at`, `completed_at`.
3. THE System SHALL calcular `current_version` consultando o último `OTA_Update_Log` com `status = success` do dispositivo.
4. THE System SHALL calcular `target_version` consultando o `OTA_Update_Log` mais recente com `status != success` do dispositivo.
5. THE System SHALL incluir apenas dispositivos que possuem pelo menos um registro `OTA_Update_Log`.
6. THE System SHALL ordenar a lista por `started_at` descendente (mais recente primeiro).
7. THE System SHALL retornar HTTP 200 com array JSON de status.

---

### Requirement 13: Backend — Endpoint de Histórico de Atualizações

**User Story:** Como gestor de TI, quero consultar o histórico completo de atualizações de um dispositivo específico, para que eu possa auditar tentativas de atualização e diagnosticar falhas recorrentes.

#### Acceptance Criteria

1. THE System SHALL implementar um endpoint `GET /api/v1/ota/history/{mac_address}` que retorna o histórico de atualizações de um dispositivo.
2. THE System SHALL validar que o `{mac_address}` existe na tabela `esp_devices`.
3. IF o `{mac_address}` não existir, THEN THE System SHALL retornar HTTP 404 com mensagem "Dispositivo não encontrado".
4. THE System SHALL retornar um array JSON de registros `OTA_Update_Log` ordenados por `started_at` descendente.
5. THE System SHALL incluir todos os campos do modelo `OTA_Update_Log` na resposta.
6. THE System SHALL incluir um campo calculado `duration_seconds` (inteiro, opcional) representando `completed_at - started_at` em segundos.
7. THE System SHALL retornar HTTP 200 com array JSON de histórico.

---

### Requirement 14: Frontend — Aba "Atualizações" em Configurações

**User Story:** Como gestor de TI, quero uma aba dedicada em Configurações para gerenciar atualizações de firmware, para que eu tenha controle centralizado sobre o processo de OTA.

#### Acceptance Criteria

1. THE Frontend SHALL adicionar uma sub-aba "Atualizações" dentro da tela de Configurações do sistema.
2. THE Frontend SHALL exibir um card "Versão Atual da Frota" mostrando a versão de firmware rodando na maioria dos dispositivos.
3. THE Frontend SHALL calcular a "Versão Atual da Frota" consultando o endpoint `GET /api/v1/ota/status` e identificando a versão mais comum.
4. THE Frontend SHALL exibir um card "Nova Versão Disponível" quando houver um release mais recente que a versão da frota.
5. THE Frontend SHALL exibir um botão "Verificar GitHub" que chama o endpoint `POST /api/v1/ota/firmware/check-github`.
6. WHEN o botão "Verificar GitHub" é clicado e uma nova versão é encontrada, THE Frontend SHALL exibir um botão "Baixar Versão {version}".
7. WHEN o botão "Baixar Versão" é clicado, THE Frontend SHALL chamar o endpoint `POST /api/v1/ota/firmware/download-github` e exibir um spinner de loading.
8. THE Frontend SHALL exibir um botão "Upload Manual" que abre um modal de upload de arquivo.
9. THE Frontend SHALL exibir uma lista de "Versões Disponíveis" consultando o endpoint `GET /api/v1/ota/firmware/releases`.
10. THE Frontend SHALL exibir para cada versão: número da versão, data de upload, origem (GitHub/Manual), tamanho do arquivo e quantidade de dispositivos rodando aquela versão.

---

### Requirement 15: Frontend — Modal de Upload Manual

**User Story:** Como gestor de TI, quero fazer upload de arquivos .bin via interface web, para que eu possa atualizar dispositivos sem depender do GitHub.

#### Acceptance Criteria

1. WHEN o botão "Upload Manual" é clicado, THE Frontend SHALL abrir um modal com título "Upload Manual de Firmware".
2. THE Modal SHALL conter um campo de input de arquivo que aceita apenas arquivos `.bin`.
3. THE Modal SHALL conter um campo de texto para inserir a versão (formato: "X.Y.Z").
4. THE Modal SHALL validar que a versão inserida segue o formato semântico (regex: `^\d+\.\d+\.\d+$`).
5. THE Modal SHALL validar que o arquivo selecionado tem extensão `.bin` e tamanho entre 100KB e 2MB.
6. IF a validação falhar, THEN THE Modal SHALL exibir mensagem de erro abaixo do campo correspondente.
7. WHEN o botão "Fazer Upload" é clicado, THE Modal SHALL chamar o endpoint `POST /api/v1/ota/firmware/upload` com `multipart/form-data`.
8. WHEN o upload é concluído com sucesso, THE Modal SHALL fechar e exibir um toast de sucesso "Firmware {version} enviado com sucesso".
9. WHEN o upload falha, THE Modal SHALL exibir mensagem de erro retornada pela API.
10. THE Modal SHALL exibir uma barra de progresso durante o upload do arquivo.

---

### Requirement 16: Frontend — Modal de Confirmação de Atualização

**User Story:** Como gestor de TI, quero confirmar explicitamente antes de disparar atualização em massa, para que eu não acione o processo acidentalmente.

#### Acceptance Criteria

1. WHEN o usuário clica em "Atualizar Todos os Dispositivos" para uma versão específica, THE Frontend SHALL abrir um modal de confirmação.
2. THE Modal SHALL exibir o título "Confirmar Atualização OTA".
3. THE Modal SHALL exibir a mensagem "Você está prestes a atualizar {N} dispositivos para a versão {version}. Este processo pode levar alguns minutos via rede Mesh. Deseja continuar?".
4. THE Modal SHALL exibir um ícone de alerta (⚠️) em destaque.
5. THE Modal SHALL conter dois botões: "Cancelar" (secundário) e "Confirmar Atualização" (primário, vermelho).
6. WHEN o botão "Cancelar" é clicado, THE Modal SHALL fechar sem executar ação.
7. WHEN o botão "Confirmar Atualização" é clicado, THE Frontend SHALL chamar o endpoint `POST /api/v1/ota/trigger` com o `firmware_release_id`.
8. WHEN a atualização é disparada com sucesso, THE Modal SHALL fechar e o Frontend SHALL navegar automaticamente para o Dashboard de Progresso.
9. WHEN a atualização falha, THE Modal SHALL exibir mensagem de erro retornada pela API.

---

### Requirement 17: Frontend — Dashboard de Progresso OTA

**User Story:** Como gestor de TI, quero visualizar o progresso de atualização de cada dispositivo em tempo real, para que eu possa monitorar o processo e identificar dispositivos com falha.

#### Acceptance Criteria

1. WHEN a atualização OTA é disparada, THE Frontend SHALL exibir automaticamente o Dashboard de Progresso OTA.
2. THE Dashboard SHALL exibir um cabeçalho com título "Atualização OTA em Andamento - Versão {version}".
3. THE Dashboard SHALL exibir um resumo com contadores: "Concluídos: X", "Em Progresso: Y", "Falharam: Z", "Total: N".
4. THE Dashboard SHALL exibir uma lista de dispositivos agrupados por tipo: "Gateways Mesh" e "Nós Mesh".
5. THE Dashboard SHALL exibir para cada dispositivo: nome, MAC address, status (ícone colorido), barra de progresso e mensagem de erro (se houver).
6. THE Dashboard SHALL usar ícones coloridos para status: 🟢 (success), 🟡 (downloading/installing), 🔴 (failed), ⚪ (idle).
7. THE Dashboard SHALL atualizar a barra de progresso de cada dispositivo em tempo real conforme eventos WebSocket `ota_progress` são recebidos.
8. WHEN um dispositivo completa a atualização com sucesso, THE Dashboard SHALL exibir um ícone de check (✓) e remover a barra de progresso.
9. WHEN um dispositivo falha na atualização, THE Dashboard SHALL exibir a mensagem de erro abaixo do nome do dispositivo.
10. THE Dashboard SHALL exibir um botão "Fechar" que retorna à aba "Atualizações" quando todos os dispositivos terminarem (sucesso ou falha).
11. THE Dashboard SHALL se conectar ao WebSocket `/api/v1/devices/ws` para receber eventos em tempo real.

---

### Requirement 18: Frontend — WebSocket de Eventos OTA

**User Story:** Como desenvolvedor frontend, quero receber eventos de progresso OTA via WebSocket, para que o dashboard seja atualizado em tempo real sem necessidade de polling.

#### Acceptance Criteria

1. THE Frontend SHALL reutilizar a conexão WebSocket existente em `/api/v1/devices/ws` para receber eventos OTA.
2. WHEN um evento WebSocket com `event = "ota_triggered"` é recebido, THE Frontend SHALL exibir um toast "Atualização OTA iniciada para {N} dispositivos".
3. WHEN um evento WebSocket com `event = "ota_progress"` é recebido, THE Frontend SHALL atualizar o estado do dispositivo correspondente no Dashboard.
4. THE Frontend SHALL extrair os campos `mac`, `status`, `progress` do payload do evento `ota_progress`.
5. THE Frontend SHALL atualizar a barra de progresso do dispositivo correspondente ao `mac` recebido.
6. WHEN um evento `ota_progress` com `status = "success"` é recebido, THE Frontend SHALL incrementar o contador "Concluídos" e atualizar o ícone do dispositivo.
7. WHEN um evento `ota_progress` com `status = "failed"` é recebido, THE Frontend SHALL incrementar o contador "Falharam" e exibir a mensagem de erro.
8. THE Frontend SHALL manter um estado local com a lista de dispositivos e seus status para renderização do Dashboard.

---

### Requirement 19: Firmware ESP32 — Processamento de Comando OTA

**User Story:** Como dispositivo ESP32, quero receber comandos OTA via MQTT e iniciar o download do firmware, para que eu possa me atualizar automaticamente sem intervenção manual.

#### Acceptance Criteria

1. THE Firmware SHALL se inscrever no tópico MQTT `andon/ota/trigger` com QoS 1 quando a conexão MQTT é estabelecida.
2. WHEN uma mensagem é recebida no tópico `andon/ota/trigger`, THE Firmware SHALL extrair o payload JSON contendo `{"version": "1.2.0", "url": "http://...", "size": 1234567}`.
3. THE Firmware SHALL validar que o campo `version` do payload é diferente da versão atual do firmware (constante `FIRMWARE_VERSION`).
4. IF a versão do payload for igual à versão atual, THEN THE Firmware SHALL publicar uma Log_Message "OTA: Já estou na versão {version}" e ignorar o comando.
5. WHEN a validação é bem-sucedida, THE Firmware SHALL publicar uma mensagem no tópico `andon/ota/progress/{mac}` com payload `{"status": "downloading", "progress": 0, "error": null}`.
6. THE Firmware SHALL iniciar o download do firmware usando a biblioteca `HTTPUpdate` do ESP32.
7. THE Firmware SHALL configurar o `HTTPUpdate` para reportar progresso a cada 10% de download.
8. WHEN o progresso de download atualiza, THE Firmware SHALL publicar uma mensagem no tópico `andon/ota/progress/{mac}` com o novo valor de `progress`.
9. THE Firmware SHALL usar timeout de 300 segundos (5 minutos) para o download completo do firmware.
10. IF o download falhar (timeout, erro de rede, HTTP 404), THEN THE Firmware SHALL publicar uma mensagem com `{"status": "failed", "progress": 0, "error": "Download failed: {reason}"}`.

---

### Requirement 20: Firmware ESP32 — Instalação e Validação de Firmware

**User Story:** Como dispositivo ESP32, quero instalar o firmware baixado e validar sua integridade, para que eu possa reverter automaticamente se a nova versão falhar.

#### Acceptance Criteria

1. WHEN o download do firmware é concluído com sucesso, THE Firmware SHALL publicar uma mensagem com `{"status": "installing", "progress": 100, "error": null}`.
2. THE Firmware SHALL usar a biblioteca `Update` do ESP32 para escrever o firmware na OTA_Partition.
3. THE Firmware SHALL validar o checksum do firmware baixado antes de escrever na OTA_Partition.
4. IF a validação de checksum falhar, THEN THE Firmware SHALL publicar uma mensagem com `{"status": "failed", "progress": 100, "error": "Checksum validation failed"}` e abortar a instalação.
5. WHEN a escrita na OTA_Partition é concluída, THE Firmware SHALL marcar a nova partição como bootável usando `esp_ota_set_boot_partition()`.
6. THE Firmware SHALL publicar uma mensagem com `{"status": "success", "progress": 100, "error": null}`.
7. THE Firmware SHALL aguardar 3 segundos e então chamar `ESP.restart()` para reiniciar com o novo firmware.
8. WHEN o ESP32 reinicia com o novo firmware, THE Firmware SHALL validar a inicialização bem-sucedida (conexão WiFi + MQTT).
9. IF a inicialização falhar (WiFi timeout ou MQTT timeout), THEN THE Rollback_Mechanism SHALL reverter automaticamente para a partição anterior.
10. WHEN o rollback ocorre, THE Firmware SHALL publicar uma Log_Message "OTA: Rollback executado - nova versão falhou na inicialização".

---

### Requirement 21: Firmware ESP32 — Propagação via ESP-MESH

**User Story:** Como dispositivo ESP32 Gateway, quero propagar a atualização OTA para nós filhos da rede Mesh, para que toda a rede seja atualizada em cascata sem necessidade de comandos individuais.

#### Acceptance Criteria

1. WHEN um Gateway Mesh recebe um comando OTA e completa a atualização com sucesso, THE Gateway SHALL aguardar 30 segundos antes de reiniciar.
2. WHEN um Gateway Mesh reinicia com novo firmware, THE Gateway SHALL publicar uma mensagem no tópico `andon/ota/trigger` para propagar o comando aos nós filhos.
3. WHEN um Nó Mesh recebe um comando OTA, THE Nó SHALL verificar se já está na versão solicitada antes de iniciar o download.
4. THE Firmware SHALL implementar um delay aleatório de 0-60 segundos antes de iniciar o download para evitar sobrecarga simultânea do servidor HTTP.
5. WHEN múltiplos nós Mesh iniciam download simultaneamente, THE Backend SHALL suportar pelo menos 20 conexões HTTP concorrentes sem falha.
6. THE Firmware SHALL publicar progresso de download a cada 10% para permitir monitoramento granular no Dashboard.
7. WHEN um Nó Mesh completa a atualização, THE Nó SHALL aguardar que todos os nós filhos (se houver) completem antes de reiniciar.

---

### Requirement 22: Backend — Tratamento de Erros e Resiliência

**User Story:** Como engenheiro de confiabilidade, quero que o sistema OTA trate graciosamente todos os erros de rede e falhas de dispositivos, para que o processo seja resiliente e não deixe dispositivos em estado inconsistente.

#### Acceptance Criteria

1. WHEN um dispositivo ESP32 não reporta progresso por mais de 10 minutos após receber o comando OTA, THE Backend SHALL marcar o `OTA_Update_Log` como `status = failed` com `error_message = "Timeout - dispositivo não respondeu"`.
2. WHEN o download de firmware do GitHub falha, THE Backend SHALL registrar o erro detalhado no log e retornar mensagem descritiva ao frontend.
3. WHEN o servidor HTTP estático falha ao servir um arquivo .bin, THE Backend SHALL registrar o erro com IP de origem e arquivo solicitado.
4. WHEN um dispositivo ESP32 reporta `status = failed`, THE Backend SHALL NÃO tentar reenviar o comando OTA automaticamente.
5. THE Backend SHALL implementar rate limiting de 1 requisição por segundo no endpoint `POST /api/v1/ota/trigger` para evitar disparos acidentais múltiplos.
6. THE Backend SHALL validar que o arquivo .bin existe no Firmware_Storage antes de publicar o comando MQTT `andon/ota/trigger`.
7. IF o arquivo .bin não existir, THEN THE Backend SHALL retornar HTTP 500 com mensagem "Arquivo de firmware não encontrado no storage".
8. THE Backend SHALL implementar retry com backoff exponencial (3 tentativas) para publicação de mensagens MQTT críticas.

---

### Requirement 23: Backend — Segurança e Validação

**User Story:** Como engenheiro de segurança, quero que o sistema OTA valide rigorosamente todas as entradas e proteja contra ataques, para que apenas firmware legítimo seja instalado nos dispositivos.

#### Acceptance Criteria

1. THE Backend SHALL validar que todos os arquivos .bin enviados via upload manual têm tamanho entre 100KB e 2MB.
2. THE Backend SHALL validar que o nome do arquivo .bin não contém caracteres especiais ou path traversal (ex: `../`, `..\\`).
3. THE Backend SHALL validar que a versão fornecida no upload manual segue o formato semântico estrito (regex: `^\d+\.\d+\.\d+$`).
4. THE Backend SHALL validar que o `firmware_release_id` fornecido no endpoint `POST /api/v1/ota/trigger` existe e aponta para um arquivo válido.
5. THE Backend SHALL usar Pydantic com `extra="forbid"` em todos os schemas de request para descartar campos não mapeados.
6. THE Backend SHALL NÃO expor stack traces ou caminhos de diretório em mensagens de erro retornadas ao frontend.
7. THE Backend SHALL registrar todas as operações de OTA (upload, download, trigger) no log da aplicação com username e timestamp.
8. THE Backend SHALL implementar autenticação JWT obrigatória em todos os endpoints de OTA (exceto a rota estática `/static/ota/`).
9. THE Backend SHALL validar que o token GitHub (se fornecido) tem permissões de leitura no repositório antes de tentar baixar releases.
10. THE Backend SHALL implementar validação de checksum SHA-256 para arquivos .bin baixados do GitHub (se o GitHub fornecer o hash).

---

### Requirement 24: Frontend — Indicadores Visuais e UX

**User Story:** Como gestor de TI, quero indicadores visuais claros do status de atualização, para que eu possa entender rapidamente o estado do processo sem ler textos longos.

#### Acceptance Criteria

1. THE Frontend SHALL usar cores semânticas consistentes: verde (sucesso), amarelo (em progresso), vermelho (falha), cinza (idle).
2. THE Frontend SHALL exibir um spinner de loading durante operações assíncronas (verificar GitHub, baixar firmware, disparar atualização).
3. THE Frontend SHALL desabilitar o botão "Atualizar Todos os Dispositivos" enquanto uma atualização estiver em andamento.
4. THE Frontend SHALL exibir um badge com a quantidade de dispositivos em cada estado (ex: "🟢 15 Concluídos").
5. THE Frontend SHALL exibir um tooltip ao passar o mouse sobre o ícone de status de cada dispositivo com detalhes (ex: "Baixando: 45%").
6. THE Frontend SHALL exibir uma animação de pulso nos dispositivos que estão ativamente baixando ou instalando firmware.
7. THE Frontend SHALL exibir um ícone de alerta (⚠️) ao lado de dispositivos que falharam, com tooltip mostrando a mensagem de erro.
8. THE Frontend SHALL exibir um toast de sucesso quando todos os dispositivos completarem a atualização com sucesso.
9. THE Frontend SHALL exibir um toast de aviso quando pelo menos um dispositivo falhar na atualização.
10. THE Frontend SHALL permitir expandir/colapsar os grupos "Gateways Mesh" e "Nós Mesh" no Dashboard de Progresso.

---

### Requirement 25: Documentação e Configuração

**User Story:** Como desenvolvedor de infraestrutura, quero documentação clara de todas as variáveis de ambiente e configurações necessárias, para que eu possa implantar o sistema OTA sem erros.

#### Acceptance Criteria

1. THE System SHALL adicionar todas as variáveis de ambiente necessárias ao arquivo `.env.example` com comentários descritivos.
2. THE `.env.example` SHALL incluir: `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_TOKEN` (opcional), `OTA_STORAGE_PATH` (padrão: `/app/storage/ota/firmware`).
3. THE System SHALL adicionar uma seção "OTA Management" ao arquivo `README.md` do backend explicando o fluxo de atualização.
4. THE README SHALL documentar os endpoints da API OTA com exemplos de request/response.
5. THE README SHALL documentar os tópicos MQTT usados pelo sistema OTA (`andon/ota/trigger`, `andon/ota/progress/#`).
6. THE README SHALL documentar o formato do payload JSON de cada tópico MQTT.
7. THE System SHALL adicionar comentários no `docker-compose.yml` explicando o volume montado para Firmware_Storage.
8. THE System SHALL adicionar uma seção "Troubleshooting OTA" ao README com soluções para problemas comuns (ex: timeout de download, falha de rollback).
9. THE System SHALL documentar o processo de teste de atualização OTA em ambiente de desenvolvimento.
10. THE System SHALL documentar as permissões necessárias no GitHub Token para acessar releases privados.

---

## Parser and Serializer Requirements

### Requirement 26: Serialização e Desserialização de Payloads MQTT OTA

**User Story:** Como desenvolvedor de firmware e backend, quero serializar e desserializar payloads JSON de comandos OTA, para que a comunicação entre backend e ESP32 seja estruturada e validável.

#### Acceptance Criteria

1. THE Backend SHALL usar Pydantic para serializar o payload do comando OTA em JSON antes de publicar no tópico `andon/ota/trigger`.
2. THE Backend SHALL criar um schema Pydantic `OTATriggerPayload` com campos: `version` (string), `url` (string), `size` (inteiro).
3. THE Backend SHALL validar que o campo `url` é uma URL HTTP válida antes de serializar.
4. THE Backend SHALL validar que o campo `size` é um inteiro positivo maior que 100000 (100KB).
5. THE Firmware SHALL usar a biblioteca `ArduinoJson` (versão 6.x ou superior) para desserializar o payload recebido no tópico `andon/ota/trigger`.
6. THE Firmware SHALL validar que o JSON desserializado contém todos os campos obrigatórios (`version`, `url`, `size`).
7. IF a desserialização falhar, THEN THE Firmware SHALL publicar uma Log_Message "OTA: JSON inválido recebido" e ignorar o comando.
8. THE Backend SHALL usar Pydantic para desserializar o payload de progresso recebido no tópico `andon/ota/progress/{mac}`.
9. THE Backend SHALL criar um schema Pydantic `OTAProgressPayload` com campos: `status` (enum), `progress` (inteiro 0-100), `error` (string opcional).
10. FOR ALL valid `OTATriggerPayload` objects, serializar → desserializar → serializar SHALL produzir JSON equivalente (round-trip property).
11. FOR ALL valid `OTAProgressPayload` objects, serializar → desserializar → serializar SHALL produzir JSON equivalente (round-trip property).

---

## Security Requirements Summary

Este sistema implementa múltiplas camadas de segurança para proteger o processo de atualização OTA:

1. **Autenticação**: Todos os endpoints de gerenciamento OTA requerem autenticação JWT válida
2. **Validação de Entrada**: Validação estrita de tamanho, formato e conteúdo de arquivos .bin
3. **Proteção contra Path Traversal**: Validação de nomes de arquivo para evitar escrita em diretórios não autorizados
4. **Rate Limiting**: Limite de 1 requisição por segundo no endpoint de trigger para evitar disparos acidentais
5. **Auditoria**: Logs detalhados de todas as operações de OTA com username e timestamp
6. **Rollback Automático**: Mecanismo de segurança do ESP32 que reverte para firmware anterior se a nova versão falhar
7. **Validação de Checksum**: Validação de integridade do firmware baixado antes da instalação
8. **Timeout de Operações**: Timeouts configurados para download (5min) e instalação para evitar travamentos

**Riscos Residuais Aceitáveis:**
- Firmware malicioso injetado via comprometimento do repositório GitHub → Mitigado por controle de acesso ao repositório
- Man-in-the-middle durante download HTTP → Aceitável pois a rede é interna e isolada
- Ataque de negação de serviço (DoS) via flooding de comandos OTA → Mitigado por rate limiting e autenticação
- Falha simultânea de todos os dispositivos durante atualização → Improvável devido à propagação em cascata via Mesh

---

## Integration Points

Este sistema se integra com os seguintes componentes existentes:

1. **MQTT Service** (`backend/app/services/mqtt_service.py`): Adiciona novos tópicos `andon/ota/trigger` e `andon/ota/progress/#`
2. **WebSocket Manager** (`backend/app/services/websocket_manager.py`): Reutiliza conexão existente para eventos OTA em tempo real
3. **ESP32 Device Management** (`.kiro/specs/iot-esp32-device-management`): Usa tabela `esp_devices` para identificar dispositivos alvo
4. **ESP32 Andon Firmware** (`.kiro/specs/esp32-andon-firmware`): Adiciona lógica de processamento de comandos OTA ao firmware existente
5. **Frontend Settings** (`frontend/src/app/components/`): Adiciona nova sub-aba "Atualizações" na tela de Configurações

---

## Performance Requirements

1. THE Backend SHALL suportar pelo menos 20 downloads HTTP concorrentes de firmware sem degradação de performance
2. THE Backend SHALL processar mensagens MQTT de progresso com latência máxima de 500ms
3. THE Frontend Dashboard SHALL atualizar barras de progresso em tempo real com latência máxima de 1 segundo
4. THE Backend SHALL completar o download de firmware do GitHub (até 2MB) em no máximo 60 segundos
5. THE Firmware ESP32 SHALL completar o download de firmware (até 2MB) via HTTP em no máximo 5 minutos
6. THE Firmware ESP32 SHALL completar a instalação de firmware na OTA_Partition em no máximo 30 segundos
7. THE Backend SHALL suportar armazenamento de até 50 versões de firmware no Firmware_Storage (até 100MB total)

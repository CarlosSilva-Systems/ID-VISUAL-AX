# Requirements Document

## Introduction

Esta feature implementa a **Fase 2 — Gestão de Dispositivos ESP32** do sistema ID Visual AX. Ela expande o módulo IoT existente com campos de diagnóstico enriquecidos no modelo `ESPDevice`, um novo modelo `FirmwareVersion` para gerenciamento de binários de firmware, endpoints REST atualizados e novos, lógica de OTA por dispositivo individual e em lote, alerta automático de dispositivos offline, e uma tela dedicada `/andon/devices` no frontend com visualização em tempo real via WebSocket.

Esta fase complementa o spec `iot-esp32-device-management` (Fase 1) e o spec `esp32-ota-management` (OTA em massa via GitHub). O foco aqui é a **gestão granular por dispositivo**: edição inline, sincronização individual, OTA por device, logs filtráveis por nível e monitoramento de sinal WiFi e topologia Mesh.

## Glossary

- **ESP32_Device**: Dispositivo de hardware IoT baseado no microcontrolador ESP32, identificado unicamente pelo seu endereço MAC. Modelo persistido na tabela `esp_devices`.
- **Device_Log**: Registro imutável de evento associado a um ESP32_Device, com campo `level` para classificação de severidade.
- **FirmwareVersion**: Registro de uma versão de firmware `.bin` disponível para OTA, persistido na tabela `firmware_versions`.
- **RSSI**: Indicador de intensidade de sinal WiFi recebido pelo ESP32, em dBm (valor negativo; quanto mais próximo de zero, melhor).
- **RSSI_Quality**: Classificação textual do sinal WiFi calculada a partir do RSSI: `Ótimo` (> -60 dBm), `Bom` (-60 a -70 dBm), `Fraco` (-70 a -80 dBm), `Crítico` (< -80 dBm).
- **Mesh_Root**: Nó ESP32 que atua como gateway da rede ESP-MESH, conectado diretamente ao broker MQTT.
- **Mesh_Node_Count**: Quantidade de nós ESP32 conectados à rede Mesh gerenciada por um Mesh_Root.
- **Firmware_Outdated**: Condição em que a versão de firmware de um ESP32_Device é inferior à versão estável mais recente registrada em `firmware_versions`.
- **OTA_Trigger**: Comando MQTT publicado no tópico `andon/ota/trigger` com URL do `.bin` e versão esperada, disparando atualização em um ou mais dispositivos.
- **Sync_Request**: Publicação MQTT no tópico `andon/state/request/{mac}` solicitando que o ESP32 reporte seu estado atual ao backend.
- **Offline_Alert**: Notificação gerada pelo background task quando um ESP32_Device permanece com `status = offline` por mais tempo que o limiar configurado.
- **Device_Drawer**: Componente de painel lateral (drawer/modal) no frontend que exibe detalhes e permite edição de um ESP32_Device.
- **OTA_Progress_Modal**: Modal React que exibe progresso em tempo real de uma atualização OTA individual, consumindo tópico `andon/ota/progress/{mac}` via WebSocket.
- **Log_Level**: Classificação de severidade de um Device_Log: `INFO`, `WARN` ou `ERROR`, inferida do conteúdo da mensagem.
- **MQTT_Service**: Serviço assíncrono existente que gerencia a conexão com o broker MQTT e processa mensagens dos tópicos Andon.
- **WebSocket_Manager**: Componente existente responsável por gerenciar conexões WebSocket ativas e fazer broadcast de eventos em tempo real.
- **Workcenter**: Mesa de trabalho do chão de fábrica, identificada por `workcenter_id` (inteiro, referência ao Odoo).

---

## Requirements

### Requirement 1: Modelo de Dados — Campos Enriquecidos em ESPDevice

**User Story:** Como engenheiro de fábrica, quero que o modelo de dispositivo armazene informações de diagnóstico como sinal WiFi, versão de firmware, topologia Mesh e uptime, para que eu possa monitorar a saúde do hardware sem acesso físico ao chão de fábrica.

#### Acceptance Criteria

1. THE System SHALL adicionar os seguintes campos opcionais ao modelo `ESPDevice`: `firmware_version` (string, nullable), `rssi` (inteiro, nullable), `is_root` (booleano, padrão `false`), `mesh_node_count` (inteiro, nullable), `ip_address` (string, nullable), `uptime_seconds` (inteiro, nullable), `notes` (string, nullable).
2. WHEN um payload de discovery MQTT é recebido contendo o campo `firmware_version`, THE MQTT_Service SHALL persistir o valor no campo `firmware_version` do ESP32_Device correspondente.
3. WHEN um payload de discovery ou heartbeat MQTT é recebido contendo o campo `rssi`, THE MQTT_Service SHALL atualizar o campo `rssi` do ESP32_Device correspondente.
4. WHEN um payload de discovery MQTT é recebido contendo o campo `is_root`, THE MQTT_Service SHALL persistir o valor booleano no campo `is_root` do ESP32_Device correspondente.
5. WHEN um payload de discovery MQTT é recebido contendo o campo `mesh_node_count`, THE MQTT_Service SHALL persistir o valor inteiro no campo `mesh_node_count` do ESP32_Device correspondente.
6. THE System SHALL gerar uma migration Alembic para adicionar os sete novos campos à tabela `esp_devices` sem remover ou alterar campos existentes.

---

### Requirement 2: Modelo de Dados — Campo `level` em ESPDeviceLog e Retenção

**User Story:** Como engenheiro de suporte, quero que cada log de dispositivo tenha um nível de severidade (INFO, WARN, ERROR) e que o histórico seja limitado a 500 entradas por device, para que eu possa filtrar rapidamente os problemas críticos sem sobrecarregar o banco de dados.

#### Acceptance Criteria

1. THE System SHALL adicionar o campo `level` (string, valores permitidos: `INFO`, `WARN`, `ERROR`, padrão `INFO`) ao modelo `ESPDeviceLog`.
2. WHEN um Device_Log é criado, THE System SHALL inferir o `level` a partir do conteúdo do campo `message`: mensagens contendo as palavras-chave `error`, `erro`, `fail`, `falha`, `critical` (case-insensitive) recebem `level = ERROR`; mensagens contendo `warn`, `aviso`, `atenção`, `timeout` recebem `level = WARN`; demais mensagens recebem `level = INFO`.
3. WHEN um novo Device_Log é inserido para um ESP32_Device, THE System SHALL verificar se o total de logs daquele device excede 500 registros.
4. IF o total de logs de um ESP32_Device exceder 500 registros após a inserção, THEN THE System SHALL deletar os registros mais antigos até que o total seja exatamente 500.
5. THE System SHALL gerar uma migration Alembic para adicionar o campo `level` à tabela `esp_device_logs` com valor padrão `INFO`.

---

### Requirement 3: Modelo de Dados — FirmwareVersion

**User Story:** Como gestor de TI, quero registrar versões de firmware disponíveis com metadados completos, para que eu possa controlar quais versões estão disponíveis para OTA e identificar a versão estável atual.

#### Acceptance Criteria

1. THE System SHALL criar o modelo `FirmwareVersion` com os campos: `id` (inteiro, PK auto-increment), `version` (string, único, não nulo), `release_notes` (string, nullable), `file_path` (string, caminho do `.bin` no servidor, não nulo), `file_size_bytes` (inteiro, não nulo), `is_stable` (booleano, padrão `false`), `created_at` (timestamp UTC, imutável), `created_by` (string, não nulo).
2. THE System SHALL garantir unicidade do campo `version` na tabela `firmware_versions`.
3. THE System SHALL criar índice de banco de dados no campo `is_stable` para otimizar consultas de versão estável.
4. THE System SHALL gerar uma migration Alembic para criar a tabela `firmware_versions` com todos os campos, constraints e índices definidos.
5. WHEN a tabela `firmware_versions` é consultada para determinar a versão estável mais recente, THE System SHALL retornar o registro com `is_stable = true` e `created_at` mais recente.

---

### Requirement 4: Endpoint — GET /api/v1/devices (Response Enriquecida)

**User Story:** Como frontend, quero que a listagem de dispositivos inclua campos calculados como qualidade de sinal, status de firmware e nome da mesa vinculada, para que eu possa exibir um painel completo sem chamadas adicionais.

#### Acceptance Criteria

1. WHEN uma requisição GET é recebida em `/api/v1/devices`, THE System SHALL retornar para cada ESP32_Device os campos: `id`, `mac_address`, `device_name`, `location`, `workcenter_id`, `workcenter_name`, `status`, `firmware_version`, `latest_firmware`, `firmware_outdated`, `rssi`, `rssi_quality`, `is_root`, `mesh_node_count`, `last_seen_at`, `offline_minutes`, `notes`.
2. THE System SHALL calcular `workcenter_name` consultando o Odoo via `OdooClient` pelo `workcenter_id`; IF o `workcenter_id` for nulo ou a consulta falhar, THEN THE System SHALL retornar `workcenter_name = null`.
3. THE System SHALL calcular `latest_firmware` como a `version` do registro `FirmwareVersion` com `is_stable = true` e `created_at` mais recente; IF não houver versão estável, THE System SHALL retornar `latest_firmware = null`.
4. THE System SHALL calcular `firmware_outdated = true` quando `firmware_version` do device for diferente de `latest_firmware` e ambos forem não nulos; caso contrário `firmware_outdated = false`.
5. THE System SHALL calcular `rssi_quality` conforme a tabela: RSSI > -60 → `Ótimo`; -60 a -70 → `Bom`; -70 a -80 → `Fraco`; < -80 → `Crítico`; IF `rssi` for nulo, THEN `rssi_quality = null`.
6. THE System SHALL calcular `offline_minutes` como a diferença em minutos entre o timestamp UTC atual e `last_seen_at` quando `status = offline`; IF `status = online` ou `last_seen_at` for nulo, THEN `offline_minutes = null`.
7. THE System SHALL retornar a lista ordenada por `created_at` descendente.

---

### Requirement 5: Endpoint — PATCH /api/v1/devices/{device_id}

**User Story:** Como operador de fábrica, quero editar o nome, localização, mesa vinculada e observações de um dispositivo via API, para que eu possa manter o inventário atualizado sem acesso direto ao banco de dados.

#### Acceptance Criteria

1. THE System SHALL implementar o endpoint `PATCH /api/v1/devices/{device_id}` que aceita body JSON com os campos opcionais: `device_name` (string), `location` (string), `workcenter_id` (inteiro ou null), `notes` (string).
2. THE System SHALL identificar o ESP32_Device pelo campo `id` (UUID); IF o device não for encontrado, THEN THE System SHALL retornar HTTP 404.
3. WHEN o campo `workcenter_id` é alterado e o device possuía um `workcenter_id` anterior não nulo, THE MQTT_Service SHALL publicar o payload `UNASSIGNED` no tópico `andon/state/{mac}` para notificar o device antigo.
4. WHEN o campo `workcenter_id` é alterado para um novo valor não nulo, THE MQTT_Service SHALL publicar no tópico `andon/state/request/{mac}` para solicitar sincronização do device novo.
5. WHEN o campo `workcenter_id` é alterado, THE System SHALL inserir um Device_Log com `event_type = binding`, `level = INFO` e mensagem no formato: `"Vínculo alterado de workcenter {id_anterior} para {id_novo} por {usuario}"`.
6. WHEN a atualização é concluída com sucesso, THE System SHALL retornar HTTP 200 com o objeto ESP32_Device atualizado no formato da response enriquecida definida no Requirement 4.
7. THE System SHALL validar que o body não contém campos não mapeados (strict validation); IF campos extras forem enviados, THEN THE System SHALL retornar HTTP 422.

---

### Requirement 6: Endpoint — GET /api/v1/devices/{device_id}/logs (Filtro por Level)

**User Story:** Como engenheiro de suporte, quero filtrar os logs de um dispositivo por nível de severidade e controlar o limite de resultados, para que eu possa focar nos erros críticos sem precisar percorrer centenas de entradas.

#### Acceptance Criteria

1. THE System SHALL atualizar o endpoint `GET /api/v1/devices/{device_id}/logs` para aceitar o parâmetro de query `level` (valores: `INFO`, `WARN`, `ERROR`).
2. THE System SHALL aceitar o parâmetro de query `limit` (inteiro, padrão 100, máximo 500).
3. WHEN o parâmetro `level` é fornecido, THE System SHALL filtrar os Device_Logs retornando apenas registros com `level` igual ao valor fornecido.
4. WHEN o parâmetro `limit` é fornecido, THE System SHALL limitar o número de registros retornados ao valor especificado.
5. IF o parâmetro `limit` exceder 500, THEN THE System SHALL retornar HTTP 422 com mensagem "Limite máximo é 500".
6. THE System SHALL identificar o ESP32_Device pelo campo `id` (UUID); IF o device não for encontrado, THEN THE System SHALL retornar HTTP 404.
7. THE System SHALL retornar os logs ordenados por `created_at` descendente (mais recente primeiro).
8. THE System SHALL incluir o campo `level` em cada item da response de logs.

---

### Requirement 7: Endpoint — POST /api/v1/devices/{device_id}/sync

**User Story:** Como operador de fábrica, quero solicitar manualmente a sincronização de estado de um dispositivo, para que o ESP32 reporte seu estado atual ao sistema sem precisar reiniciar.

#### Acceptance Criteria

1. THE System SHALL implementar o endpoint `POST /api/v1/devices/{device_id}/sync`.
2. THE System SHALL identificar o ESP32_Device pelo campo `id` (UUID); IF o device não for encontrado, THEN THE System SHALL retornar HTTP 404.
3. WHEN o endpoint é chamado, THE MQTT_Service SHALL publicar uma mensagem vazia no tópico `andon/state/request/{mac_address}` com QoS 1.
4. THE System SHALL retornar HTTP 200 com body `{"message": "Sync solicitado"}`.
5. IF a publicação MQTT falhar, THEN THE System SHALL registrar o erro no log da aplicação e retornar HTTP 503 com mensagem "Falha ao publicar comando MQTT".

---

### Requirement 8: Endpoint — DELETE /api/v1/devices/{device_id}

**User Story:** Como administrador do sistema, quero remover dispositivos ESP32 que estão permanentemente offline, para que o inventário reflita apenas hardware ativo.

#### Acceptance Criteria

1. THE System SHALL implementar o endpoint `DELETE /api/v1/devices/{device_id}`.
2. THE System SHALL identificar o ESP32_Device pelo campo `id` (UUID); IF o device não for encontrado, THEN THE System SHALL retornar HTTP 404.
3. IF o ESP32_Device possuir `status = online`, THEN THE System SHALL retornar HTTP 409 com mensagem "Não é possível remover um dispositivo online. Aguarde o dispositivo ficar offline.".
4. WHEN o device possui `status = offline`, THE System SHALL deletar o ESP32_Device e todos os seus Device_Logs associados em cascata.
5. WHEN a remoção é concluída com sucesso, THE System SHALL retornar HTTP 204 (No Content).
6. WHEN a remoção é concluída, THE System SHALL emitir um evento WebSocket `device_removed` com payload `{"device_id": "{uuid}", "mac_address": "{mac}"}`.

---

### Requirement 9: Endpoints — Gerenciamento de FirmwareVersion

**User Story:** Como gestor de TI, quero listar versões de firmware disponíveis e fazer upload de novos binários via API, para que eu possa controlar o ciclo de vida de firmware dos dispositivos ESP32.

#### Acceptance Criteria

1. THE System SHALL implementar o endpoint `GET /api/v1/devices/firmware/versions` que retorna a lista de `FirmwareVersion` ordenada por `created_at` descendente.
2. THE System SHALL incluir todos os campos do modelo `FirmwareVersion` na response de listagem.
3. THE System SHALL implementar o endpoint `POST /api/v1/devices/firmware/versions` que aceita `multipart/form-data` com os campos: `version` (string, obrigatório), `release_notes` (string, opcional), `is_stable` (booleano, obrigatório), `file` (arquivo `.bin`, obrigatório).
4. THE System SHALL validar que o arquivo enviado tem extensão `.bin`; IF a extensão for inválida, THEN THE System SHALL retornar HTTP 422 com mensagem "Apenas arquivos .bin são aceitos".
5. THE System SHALL validar que a `version` fornecida não existe na tabela `firmware_versions`; IF já existir, THEN THE System SHALL retornar HTTP 409 com mensagem "Versão {version} já cadastrada".
6. WHEN a validação é bem-sucedida, THE System SHALL salvar o arquivo `.bin` no diretório de storage configurado e criar o registro `FirmwareVersion` com `created_by` igual ao usuário autenticado.
7. THE System SHALL retornar HTTP 201 com o objeto `FirmwareVersion` criado.

---

### Requirement 10: Endpoint — POST /api/v1/devices/{device_id}/ota (OTA Individual)

**User Story:** Como gestor de TI, quero disparar uma atualização OTA para um dispositivo específico, para que eu possa atualizar um único ESP32 sem afetar toda a frota.

#### Acceptance Criteria

1. THE System SHALL implementar o endpoint `POST /api/v1/devices/{device_id}/ota`.
2. THE System SHALL aceitar body JSON com os campos: `firmware_version_id` (inteiro, obrigatório), `triggered_by` (string, obrigatório).
3. THE System SHALL identificar o ESP32_Device pelo campo `id` (UUID); IF o device não for encontrado, THEN THE System SHALL retornar HTTP 404.
4. IF o ESP32_Device possuir `status = offline`, THEN THE System SHALL retornar HTTP 409 com mensagem "Dispositivo offline. OTA requer dispositivo online.".
5. THE System SHALL validar que o `firmware_version_id` existe na tabela `firmware_versions` e que o `file_path` correspondente existe no sistema de arquivos; IF qualquer validação falhar, THEN THE System SHALL retornar HTTP 422 com mensagem descritiva.
6. WHEN todas as validações passam, THE MQTT_Service SHALL publicar no tópico `andon/ota/trigger` um payload JSON contendo: `{"version": "{version}", "url": "{url_do_bin}", "size": {file_size_bytes}, "target_mac": "{mac_address}"}`.
7. THE System SHALL retornar HTTP 202 com body `{"message": "OTA disparado para {device_name}", "target_version": "{version}"}`.
8. THE System SHALL registrar no log da aplicação "OTA: Disparado para device {mac} versão {version} por {triggered_by}".

---

### Requirement 11: Endpoint — POST /api/v1/devices/ota/batch (OTA em Lote)

**User Story:** Como gestor de TI, quero disparar atualização OTA para múltiplos dispositivos desatualizados de uma vez, para que eu possa atualizar toda a frota ou um subconjunto sem precisar acionar cada device individualmente.

#### Acceptance Criteria

1. THE System SHALL implementar o endpoint `POST /api/v1/devices/ota/batch`.
2. THE System SHALL aceitar body JSON com os campos: `firmware_version_id` (inteiro, obrigatório), `triggered_by` (string, obrigatório), `device_ids` (array de UUIDs, opcional).
3. THE System SHALL validar que o `firmware_version_id` existe na tabela `firmware_versions`; IF não existir, THEN THE System SHALL retornar HTTP 404.
4. WHEN `device_ids` é fornecido e não vazio, THE System SHALL disparar OTA apenas para os devices da lista que possuem `status = online`.
5. WHEN `device_ids` é omitido ou vazio, THE System SHALL disparar OTA para todos os ESP32_Devices com `firmware_outdated = true` e `status = online`.
6. WHEN o lote é processado, THE MQTT_Service SHALL publicar um OTA_Trigger individual no tópico `andon/ota/trigger` para cada device selecionado, incluindo o campo `target_mac` no payload.
7. THE System SHALL retornar HTTP 202 com body `{"message": "OTA em lote disparado", "device_count": {N}, "target_version": "{version}"}`.
8. IF nenhum device elegível for encontrado, THEN THE System SHALL retornar HTTP 200 com body `{"message": "Nenhum dispositivo elegível para atualização", "device_count": 0}`.

---

### Requirement 12: Background Task — Alerta de Device Offline

**User Story:** Como operador de fábrica, quero ser notificado automaticamente quando um dispositivo ESP32 fica offline por mais tempo que o limiar configurado, para que eu possa agir rapidamente antes que a produção seja impactada.

#### Acceptance Criteria

1. THE System SHALL implementar um background task que executa a verificação de dispositivos offline a cada 5 minutos.
2. THE System SHALL ler o limiar de tempo offline a partir de uma configuração parametrizável (padrão: 10 minutos); a configuração SHALL ser lida da tabela `system_settings` ou variável de ambiente `DEVICE_OFFLINE_ALERT_MINUTES`.
3. WHEN o background task executa, THE System SHALL consultar todos os ESP32_Devices com `status = offline` e `last_seen_at` anterior ao timestamp atual menos o limiar configurado.
4. WHEN um ESP32_Device elegível é encontrado, THE System SHALL emitir um evento WebSocket `device_offline_alert` com payload contendo: `device_id`, `device_name`, `mac_address`, `workcenter_id`, `workcenter_name`, `offline_minutes`.
5. THE System SHALL iniciar o background task no evento `startup` da aplicação FastAPI junto com o MQTT_Service.
6. THE System SHALL encerrar o background task no evento `shutdown` da aplicação FastAPI de forma limpa.
7. IF o background task encontrar um erro durante a execução, THEN THE System SHALL registrar o erro no log da aplicação e continuar a execução na próxima iteração sem interromper o ciclo.

---

### Requirement 13: Frontend — Tela /andon/devices

**User Story:** Como operador de fábrica, quero uma tela dedicada para visualizar e gerenciar todos os dispositivos ESP32, para que eu tenha controle centralizado do inventário de hardware sem precisar acessar configurações avançadas.

#### Acceptance Criteria

1. THE Frontend SHALL criar a rota `/andon/devices` acessível pelo menu de navegação do sistema.
2. THE Frontend SHALL exibir no topo da tela quatro cards de resumo: "Total de Dispositivos", "Online 🟢", "Offline 🔴" e "Desatualizados 🟡", calculados a partir dos dados retornados pelo endpoint `GET /api/v1/devices`.
3. THE Frontend SHALL exibir uma tabela com as colunas: Device (nome + MAC), Mesa Vinculada, Status, Sinal WiFi, Firmware, Último Contato e Ações.
4. THE Frontend SHALL exibir badges visuais de status: 🟢 para `online`, 🔴 para `offline`, 🟡 para device sem vínculo (`workcenter_id = null`).
5. THE Frontend SHALL exibir na coluna "Sinal WiFi" o valor de `rssi_quality` com cor correspondente: verde para `Ótimo`, azul para `Bom`, amarelo para `Fraco`, vermelho para `Crítico`.
6. THE Frontend SHALL exibir na coluna "Firmware" a versão atual com badge de aviso ⚠️ quando `firmware_outdated = true`.
7. THE Frontend SHALL exibir na coluna "Ações" os ícones: ✏️ Editar (abre Device_Drawer), 📋 Ver Logs (abre Device_Drawer na aba Logs), 🔄 Sincronizar (chama `POST /sync`), 🗑️ Remover (habilitado apenas quando `status = offline`).
8. WHEN o ícone 🗑️ Remover é clicado, THE Frontend SHALL exibir um diálogo de confirmação antes de chamar `DELETE /api/v1/devices/{device_id}`.
9. THE Frontend SHALL atualizar a tabela em tempo real ao receber eventos WebSocket `device_discovery`, `device_status`, `device_removed` e `device_offline_alert`.

---

### Requirement 14: Frontend — Device Drawer — Aba "Informações"

**User Story:** Como operador de fábrica, quero editar os dados de um dispositivo em um painel lateral sem sair da tela principal, para que eu possa atualizar nome, localização, mesa e observações de forma rápida.

#### Acceptance Criteria

1. WHEN o ícone ✏️ Editar é clicado, THE Frontend SHALL abrir um Device_Drawer com título igual ao `device_name` do dispositivo.
2. THE Device_Drawer SHALL conter a aba "Informações" com os campos editáveis: Nome (input texto), Localização (input texto), Mesa (dropdown com workcenters do Odoo), Observações (textarea).
3. THE Device_Drawer SHALL exibir os campos somente leitura: MAC Address, Firmware (com badge ⚠️ se `firmware_outdated = true`), Sinal WiFi (valor RSSI + label de qualidade), Tipo (Raiz/Folha baseado em `is_root`), Último Contato (timestamp formatado em pt-BR).
4. WHEN o usuário altera campos e clica em "Salvar", THE Frontend SHALL chamar `PATCH /api/v1/devices/{device_id}` com os campos modificados e exibir toast de sucesso via Sonner.
5. IF a chamada PATCH retornar erro, THE Frontend SHALL exibir toast de erro com a mensagem retornada pela API.
6. WHEN `firmware_outdated = true`, THE Device_Drawer SHALL exibir o botão "Disparar OTA" que abre o fluxo de OTA individual para aquele device.
7. WHEN o botão "Disparar OTA" é clicado, THE Frontend SHALL exibir um modal de seleção de versão de firmware listando os registros de `GET /api/v1/devices/firmware/versions`, e após confirmação chamar `POST /api/v1/devices/{device_id}/ota`.

---

### Requirement 15: Frontend — Device Drawer — Aba "Logs"

**User Story:** Como engenheiro de suporte, quero visualizar os logs de um dispositivo em tempo real com filtro por nível de severidade, para que eu possa diagnosticar problemas sem precisar acessar o banco de dados diretamente.

#### Acceptance Criteria

1. THE Device_Drawer SHALL conter a aba "Logs" que exibe a lista de Device_Logs do dispositivo consultando `GET /api/v1/devices/{device_id}/logs`.
2. THE Frontend SHALL exibir um filtro de nível com as opções: "Todos", "INFO", "WARN", "ERROR"; ao selecionar um nível, THE Frontend SHALL recarregar os logs com o parâmetro `level` correspondente.
3. THE Frontend SHALL colorir cada linha de log conforme o nível: cinza para `INFO`, amarelo para `WARN`, vermelho para `ERROR`.
4. WHEN um evento WebSocket `device_log` é recebido para o device aberto no drawer, THE Frontend SHALL adicionar o novo log ao topo da lista sem recarregar a página.
5. THE Frontend SHALL exibir um badge vermelho na aba "Logs" quando houver pelo menos um log com `level = ERROR` nos últimos 50 registros carregados.
6. THE Frontend SHALL exibir o campo `level` como badge colorido ao lado de cada mensagem de log.

---

### Requirement 16: Frontend — Modal de Progresso OTA

**User Story:** Como gestor de TI, quero acompanhar o progresso de uma atualização OTA individual em tempo real, para que eu saiba quando o dispositivo foi atualizado com sucesso ou se houve falha.

#### Acceptance Criteria

1. WHEN uma atualização OTA individual é disparada com sucesso, THE Frontend SHALL abrir automaticamente o OTA_Progress_Modal para o device correspondente.
2. THE OTA_Progress_Modal SHALL exibir: nome do device, versão de origem (`firmware_version` atual), versão de destino (versão selecionada para OTA) e uma barra de progresso percentual.
3. THE OTA_Progress_Modal SHALL consumir eventos WebSocket `ota_progress` filtrados pelo `mac_address` do device para atualizar a barra de progresso em tempo real.
4. THE OTA_Progress_Modal SHALL exibir os estados sequenciais: `Iniciando` → `Baixando` → `Gravando` → `Reiniciando` → `Concluído` / `Falhou`, mapeados a partir do campo `status` do evento WebSocket.
5. WHEN o status `Concluído` é recebido, THE OTA_Progress_Modal SHALL exibir um ícone de check verde e habilitar o botão "Fechar".
6. WHEN o status `Falhou` é recebido, THE OTA_Progress_Modal SHALL exibir a mensagem de erro em vermelho e habilitar o botão "Fechar".
7. THE OTA_Progress_Modal SHALL consumir o tópico `andon/ota/progress/{mac}` via WebSocket existente em `/api/v1/devices/ws`.

# Requirements Document

## Introduction

Esta feature implementa a gestão completa de hardware IoT baseado em ESP32 no sistema ID Visual AX. O objetivo é permitir que dispositivos ESP32 se registrem automaticamente via MQTT, sejam monitorados em tempo real via WebSocket, e sejam vinculados a mesas de trabalho (workcenters) do chão de fábrica. A feature inclui backend (modelos, serviço MQTT, WebSocket, endpoints REST), painel Andon integrado e aba de configurações dedicada no frontend.

O OdooClient permanece completamente isolado — esta feature não toca em nenhuma lógica Odoo.

## Glossary

- **ESP32_Device**: Dispositivo de hardware IoT baseado no microcontrolador ESP32, identificado unicamente pelo seu endereço MAC.
- **Device_Log**: Registro imutável de evento associado a um ESP32_Device (erro, mudança de status, descoberta, vinculação).
- **MQTT_Service**: Serviço assíncrono que gerencia a conexão com o broker MQTT e processa mensagens dos tópicos `andon/discovery`, `andon/status/#` e `andon/logs/#`.
- **WebSocket_Manager**: Componente responsável por gerenciar conexões WebSocket ativas e fazer broadcast de eventos em tempo real para o frontend.
- **Workcenter**: Mesa de trabalho do chão de fábrica, identificada por `workcenter_id` (inteiro, referência ao Odoo).
- **Binding**: Associação entre um ESP32_Device e um Workcenter.
- **MQTT_Broker**: Servidor de mensagens MQTT (Mosquitto local por padrão), configurável via variáveis de ambiente.
- **Device_Status**: Enumeração do estado de conectividade do dispositivo: `online` ou `offline`.
- **Event_Type**: Enumeração dos tipos de evento registrados em Device_Log: `error`, `status_change`, `discovery`, `binding`.
- **IoT_Panel**: Aba "Dispositivos IoT" na tela de Configurações do frontend.
- **Andon_Grid**: Componente de grade do painel Andon que exibe as mesas de trabalho com indicadores visuais.

---

## Requirements

### Requirement 1: Modelo de Dados — ESP32_Device

**User Story:** Como engenheiro de fábrica, quero que cada dispositivo ESP32 seja registrado com seus metadados essenciais, para que eu possa identificar, rastrear e gerenciar o inventário de hardware IoT.

#### Acceptance Criteria

1. THE System SHALL armazenar cada ESP32_Device com os campos: `id` (UUID), `mac_address` (string única, não nula), `device_name` (string), `workcenter_id` (inteiro, FK opcional para Workcenter), `status` (enum: `online` | `offline`), `last_seen_at` (timestamp com timezone), `created_at` (timestamp com timezone, imutável).
2. THE System SHALL garantir unicidade do campo `mac_address` na tabela `esp_devices`.
3. THE System SHALL criar índice de banco de dados no campo `mac_address` para otimizar buscas por dispositivo.
4. WHEN um ESP32_Device é criado, THE System SHALL definir `status` como `offline` e `created_at` como o timestamp UTC corrente.
5. THE System SHALL gerar uma migration Alembic para criar a tabela `esp_devices` com todos os campos, constraints e índices definidos.

---

### Requirement 2: Modelo de Dados — Device_Log

**User Story:** Como engenheiro de fábrica, quero que todos os eventos relevantes de cada dispositivo sejam registrados de forma imutável, para que eu possa auditar o histórico completo de comportamento do hardware.

#### Acceptance Criteria

1. THE System SHALL armazenar cada Device_Log com os campos: `id` (UUID), `device_id` (UUID, FK para ESP32_Device, não nulo), `event_type` (enum: `error` | `status_change` | `discovery` | `binding`), `message` (string), `created_at` (timestamp com timezone, imutável).
2. THE System SHALL criar índice de banco de dados no campo `device_id` para otimizar consultas de histórico por dispositivo.
3. THE System SHALL garantir que registros de Device_Log sejam apenas inseridos — nunca atualizados ou deletados (imutabilidade por design).
4. THE System SHALL gerar uma migration Alembic para criar a tabela `esp_device_logs` com todos os campos, constraints e índices definidos, na mesma migration do Requirement 1.

---

### Requirement 3: Serviço MQTT — Conexão e Ciclo de Vida

**User Story:** Como operador de TI, quero que o serviço MQTT seja iniciado e encerrado junto com a aplicação FastAPI, para que a conectividade com os dispositivos ESP32 seja gerenciada automaticamente sem intervenção manual.

#### Acceptance Criteria

1. THE System SHALL adicionar a dependência `aiomqtt` ao `pyproject.toml`.
2. THE System SHALL ler as configurações do broker MQTT a partir das variáveis de ambiente `MQTT_BROKER_HOST` e `MQTT_BROKER_PORT`.
3. WHEN a aplicação FastAPI inicia (evento `startup`), THE MQTT_Service SHALL estabelecer conexão com o MQTT_Broker e iniciar a escuta dos tópicos configurados.
4. WHEN a aplicação FastAPI encerra (evento `shutdown`), THE MQTT_Service SHALL encerrar a conexão com o MQTT_Broker de forma limpa (graceful shutdown).
5. IF a conexão com o MQTT_Broker falhar durante o startup, THEN THE MQTT_Service SHALL registrar o erro no log da aplicação e continuar o startup sem bloquear a API.
6. IF a conexão com o MQTT_Broker for perdida durante a operação, THEN THE MQTT_Service SHALL tentar reconectar automaticamente com backoff exponencial.

---

### Requirement 4: Serviço MQTT — Processamento de Tópico `andon/discovery`

**User Story:** Como dispositivo ESP32, quero me registrar automaticamente ao publicar no tópico de discovery, para que o sistema me reconheça sem configuração manual.

#### Acceptance Criteria

1. WHEN uma mensagem é recebida no tópico `andon/discovery`, THE MQTT_Service SHALL extrair `mac_address` e `device_name` do payload JSON.
2. WHEN o `mac_address` do payload não existe na base de dados, THE MQTT_Service SHALL criar um novo ESP32_Device com `status = online` e `last_seen_at` atualizado.
3. WHEN o `mac_address` do payload já existe na base de dados, THE MQTT_Service SHALL atualizar `status = online` e `last_seen_at` do ESP32_Device existente.
4. WHEN um evento de discovery é processado, THE MQTT_Service SHALL inserir um Device_Log com `event_type = discovery`.
5. WHEN um evento de discovery é processado, THE MQTT_Service SHALL emitir um evento WebSocket via WebSocket_Manager para notificar o frontend.
6. IF o payload do tópico `andon/discovery` for inválido ou não contiver `mac_address`, THEN THE MQTT_Service SHALL registrar o erro no log da aplicação e descartar a mensagem sem criar registros.

---

### Requirement 5: Serviço MQTT — Processamento de Tópico `andon/status/#`

**User Story:** Como operador de fábrica, quero que o status online/offline de cada dispositivo seja atualizado automaticamente quando o ESP32 publica no tópico de status, para que o painel reflita a conectividade real em tempo real.

#### Acceptance Criteria

1. WHEN uma mensagem é recebida no tópico `andon/status/{mac_address}`, THE MQTT_Service SHALL extrair o novo status (`online` ou `offline`) do payload.
2. WHEN o status recebido difere do status atual do ESP32_Device, THE MQTT_Service SHALL atualizar o campo `status` e `last_seen_at` do ESP32_Device correspondente.
3. WHEN o status é atualizado, THE MQTT_Service SHALL inserir um Device_Log com `event_type = status_change`.
4. WHEN o status é atualizado, THE MQTT_Service SHALL emitir um evento WebSocket via WebSocket_Manager.
5. IF o `mac_address` do tópico não corresponder a nenhum ESP32_Device cadastrado, THEN THE MQTT_Service SHALL registrar um aviso no log e descartar a mensagem.
6. IF o payload contiver um status inválido (diferente de `online` ou `offline`), THEN THE MQTT_Service SHALL registrar o erro e descartar a mensagem.

---

### Requirement 6: Serviço MQTT — Processamento de Tópico `andon/logs/#`

**User Story:** Como engenheiro de hardware, quero que mensagens de diagnóstico publicadas pelo ESP32 sejam salvas como eventos de erro, para que eu possa depurar problemas remotamente sem acesso físico ao dispositivo.

#### Acceptance Criteria

1. WHEN uma mensagem é recebida no tópico `andon/logs/{mac_address}`, THE MQTT_Service SHALL extrair o conteúdo da mensagem como texto.
2. WHEN uma mensagem de log é recebida, THE MQTT_Service SHALL inserir um Device_Log com `event_type = error` e o conteúdo da mensagem no campo `message`.
3. WHEN uma mensagem de log é recebida, THE MQTT_Service SHALL emitir um evento WebSocket via WebSocket_Manager.
4. IF o `mac_address` do tópico não corresponder a nenhum ESP32_Device cadastrado, THEN THE MQTT_Service SHALL registrar um aviso no log e descartar a mensagem.

---

### Requirement 7: WebSocket — ConnectionManager

**User Story:** Como desenvolvedor frontend, quero receber eventos em tempo real via WebSocket, para que o painel Andon e a aba de configurações reflitam mudanças de estado dos dispositivos sem necessidade de polling.

#### Acceptance Criteria

1. THE WebSocket_Manager SHALL manter uma lista de conexões WebSocket ativas.
2. WHEN um cliente se conecta ao endpoint WebSocket, THE WebSocket_Manager SHALL registrar a conexão na lista de conexões ativas.
3. WHEN um cliente se desconecta, THE WebSocket_Manager SHALL remover a conexão da lista de conexões ativas.
4. WHEN o método `broadcast` é chamado, THE WebSocket_Manager SHALL enviar a mensagem JSON para todas as conexões ativas.
5. IF o envio para uma conexão específica falhar, THEN THE WebSocket_Manager SHALL remover essa conexão da lista e continuar o broadcast para as demais.
6. THE System SHALL expor o endpoint WebSocket em `/api/v1/devices/ws`.

---

### Requirement 8: Endpoints REST — Listagem e Histórico

**User Story:** Como operador de TI, quero consultar todos os dispositivos cadastrados e o histórico de eventos de cada um, para que eu possa monitorar o inventário e auditar comportamentos.

#### Acceptance Criteria

1. WHEN uma requisição GET é recebida em `/api/v1/devices`, THE System SHALL retornar a lista completa de ESP32_Devices com todos os campos.
2. WHEN uma requisição GET é recebida em `/api/v1/devices/{mac_address}/logs`, THE System SHALL retornar o histórico paginado de Device_Logs do dispositivo correspondente.
3. WHEN o parâmetro `page` é fornecido na query string de `/api/v1/devices/{mac_address}/logs`, THE System SHALL retornar a página correspondente com `page_size` registros (padrão: 50).
4. IF o `mac_address` fornecido em `/api/v1/devices/{mac_address}/logs` não corresponder a nenhum ESP32_Device, THEN THE System SHALL retornar HTTP 404 com mensagem descritiva.

---

### Requirement 9: Endpoints REST — Vinculação (Binding)

**User Story:** Como operador de fábrica, quero vincular e desvincular dispositivos ESP32 a mesas de trabalho via API, para que o sistema saiba qual dispositivo monitora qual mesa.

#### Acceptance Criteria

1. WHEN uma requisição POST é recebida em `/api/v1/devices/{mac_address}/bind` com `workcenter_id` no body, THE System SHALL atualizar o campo `workcenter_id` do ESP32_Device correspondente.
2. WHEN uma vinculação é realizada com sucesso, THE System SHALL inserir um Device_Log com `event_type = binding` e mensagem descritiva.
3. WHEN uma requisição DELETE é recebida em `/api/v1/devices/{mac_address}/bind`, THE System SHALL definir `workcenter_id = null` no ESP32_Device correspondente.
4. WHEN uma desvinculação é realizada com sucesso, THE System SHALL inserir um Device_Log com `event_type = binding` e mensagem descritiva.
5. IF o `mac_address` fornecido não corresponder a nenhum ESP32_Device, THEN THE System SHALL retornar HTTP 404.
6. IF o `workcenter_id` fornecido no body de POST bind for inválido (não inteiro positivo), THEN THE System SHALL retornar HTTP 422 com detalhes de validação.

---

### Requirement 10: Frontend — Indicador IoT no Painel Andon

**User Story:** Como operador de fábrica, quero ver um indicador visual de status do dispositivo ESP32 em cada célula do painel Andon, para que eu saiba imediatamente se o hardware de uma mesa está online ou offline.

#### Acceptance Criteria

1. THE Andon_Grid SHALL exibir um ícone de chave (🔑) em cada célula de mesa.
2. WHEN o ESP32_Device vinculado à mesa está com `status = online`, THE Andon_Grid SHALL exibir o ícone em verde.
3. WHEN o ESP32_Device vinculado à mesa está com `status = offline` ou não há dispositivo vinculado, THE Andon_Grid SHALL exibir o ícone em vermelho.
4. WHEN o usuário clica no ícone de chave de uma mesa sem dispositivo vinculado, THE Andon_Grid SHALL abrir um modal listando os ESP32_Devices disponíveis (sem vínculo).
5. WHEN o usuário clica no ícone de chave de uma mesa com dispositivo vinculado, THE Andon_Grid SHALL abrir um modal exibindo os detalhes do dispositivo e a opção de desvincular.

---

### Requirement 11: Frontend — Modal de Vinculação

**User Story:** Como operador de fábrica, quero vincular um dispositivo ESP32 a uma mesa diretamente pelo painel Andon, para que a operação seja rápida e não exija acesso à tela de configurações.

#### Acceptance Criteria

1. WHEN o modal de vinculação é aberto para uma mesa sem dispositivo, THE System SHALL exibir a lista de ESP32_Devices disponíveis (sem `workcenter_id`).
2. WHEN um dispositivo é exibido na lista do modal, THE System SHALL mostrar `device_name` em destaque, `mac_address` abaixo e um indicador de `status` (online/offline).
3. WHEN o usuário clica em "Vincular a esta mesa" para um dispositivo da lista, THE System SHALL chamar `POST /api/v1/devices/{mac_address}/bind` com o `workcenter_id` da mesa.
4. WHEN a vinculação é concluída com sucesso, THE System SHALL fechar o modal e atualizar o indicador da célula correspondente.
5. WHEN o modal de detalhes é aberto para uma mesa com dispositivo vinculado, THE System SHALL exibir `device_name`, `mac_address`, `status`, `last_seen_at` e um botão "Desvincular".
6. WHEN o usuário clica em "Desvincular", THE System SHALL chamar `DELETE /api/v1/devices/{mac_address}/bind` e atualizar o indicador da célula.

---

### Requirement 12: Frontend — Aba "Dispositivos IoT" em Configurações

**User Story:** Como administrador do sistema, quero uma aba dedicada em Configurações para gerenciar todos os dispositivos IoT, para que eu tenha visibilidade centralizada do inventário, histórico e diagnósticos.

#### Acceptance Criteria

1. THE IoT_Panel SHALL ser acessível como sub-aba dentro da tela de Configurações do sistema.
2. THE IoT_Panel SHALL conter três sub-abas: "Dispositivos Cadastrados", "Histórico de Eventos" e "Logs de Diagnóstico".
3. WHEN a sub-aba "Dispositivos Cadastrados" é exibida, THE IoT_Panel SHALL mostrar uma tabela com colunas: Nome, MAC, Mesa, Status, Último Contato e Ações.
4. WHEN a sub-aba "Dispositivos Cadastrados" é exibida, THE IoT_Panel SHALL permitir filtrar dispositivos por status e por nome/MAC.
5. WHEN a sub-aba "Histórico de Eventos" é exibida, THE IoT_Panel SHALL mostrar um log unificado de todos os Device_Logs com colunas: Dispositivo, Tipo de Evento, Mensagem e Data/Hora.
6. WHEN a sub-aba "Histórico de Eventos" é exibida, THE IoT_Panel SHALL suportar paginação server-side e filtros por dispositivo e tipo de evento.
7. WHEN a sub-aba "Logs de Diagnóstico" é exibida, THE IoT_Panel SHALL exibir um seletor de dispositivo, um console estilo terminal com os logs de `event_type = error` do dispositivo selecionado e um banner de aviso quando o dispositivo estiver offline.
8. WHEN o usuário clica em "Exportar .txt" na sub-aba "Logs de Diagnóstico", THE IoT_Panel SHALL fazer download de um arquivo `.txt` com todos os logs do dispositivo selecionado.
9. WHEN a sub-aba "Dispositivos Cadastrados" exibe um dispositivo, THE IoT_Panel SHALL permitir acionar vinculação/desvinculação diretamente pela coluna de Ações.

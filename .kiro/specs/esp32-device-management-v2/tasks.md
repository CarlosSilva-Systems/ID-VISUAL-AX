# Plano de Implementação: ESP32 Device Management v2

## Visão Geral

Implementação incremental da Fase 2 — Gestão de Dispositivos ESP32. Cada grupo de tasks corresponde a um commit atômico e independente, seguindo o plano de commits definido no design. O backend usa Python/FastAPI/SQLModel e o frontend usa React/TypeScript.

## Tasks

- [ ] 1. Adicionar campos de diagnóstico ao modelo ESPDevice
  - Abrir `backend/app/models/esp_device.py`
  - Adicionar os 7 novos campos ao final da classe `ESPDevice`, após `created_at`:
    - `firmware_version: Optional[str] = Field(default=None, nullable=True)`
    - `rssi: Optional[int] = Field(default=None, nullable=True)`
    - `is_root: bool = Field(default=False, nullable=False)`
    - `mesh_node_count: Optional[int] = Field(default=None, nullable=True)`
    - `ip_address: Optional[str] = Field(default=None, nullable=True)`
    - `uptime_seconds: Optional[int] = Field(default=None, nullable=True)`
    - `notes: Optional[str] = Field(default=None, nullable=True)`
  - Garantir que `Optional` já está importado de `typing`
  - _Requirements: 1.1_

- [ ] 2. Adicionar campo `level` ao modelo ESPDeviceLog
  - No mesmo arquivo `backend/app/models/esp_device.py`
  - Adicionar à classe `ESPDeviceLog`, após `message`:
    - `level: str = Field(default="INFO", nullable=False)`
  - _Requirements: 2.1_

- [ ] 3. Criar modelo FirmwareVersion
  - Criar `backend/app/models/firmware_version.py`
  - Importar `Optional`, `datetime`, `timezone` e `Field`, `SQLModel`
  - Definir a classe `FirmwareVersion(SQLModel, table=True)` com `__tablename__ = "firmware_versions"` e os campos:
    - `id: Optional[int] = Field(default=None, primary_key=True)`
    - `version: str = Field(unique=True, index=True, nullable=False)`
    - `release_notes: Optional[str] = Field(default=None, nullable=True)`
    - `file_path: str = Field(nullable=False)`
    - `file_size_bytes: int = Field(nullable=False)`
    - `is_stable: bool = Field(default=False, index=True, nullable=False)`
    - `created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))`
    - `created_by: str = Field(nullable=False)`
  - Registrar o modelo em `backend/app/models/__init__.py` para que o Alembic o detecte
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Criar migrations Alembic para esp_devices, esp_device_logs e firmware_versions
  - Criar `backend/alembic/versions/<hash>_feat_adiciona_campos_diagnostico_esp_devices_e_level_logs.py`
    - `down_revision` deve apontar para a migration mais recente existente (`f45dafaf98ee`)
    - `upgrade()`: adicionar 7 colunas a `esp_devices` (todas nullable exceto `is_root` com `server_default='false'`) e coluna `level` a `esp_device_logs` com `server_default='INFO'`
    - `downgrade()`: remover as colunas na ordem inversa
  - Criar `backend/alembic/versions/<hash>_feat_cria_tabela_firmware_versions.py`
    - `down_revision` deve apontar para a migration anterior
    - `upgrade()`: criar tabela `firmware_versions` com todos os campos, `UniqueConstraint` em `version` e índice em `is_stable`
    - `downgrade()`: `op.drop_table("firmware_versions")`
  - _Requirements: 1.6, 2.5, 3.4_

- [ ] 5. Implementar device_service.py com funções de cálculo e retenção
  - Criar `backend/app/services/device_service.py`
  - Implementar as 5 funções com tipagem completa:
    - `compute_rssi_quality(rssi: int | None) -> str | None` — retorna `"Ótimo"`, `"Bom"`, `"Fraco"`, `"Crítico"` ou `None`
    - `compute_firmware_outdated(device_version: str | None, latest: str | None) -> bool`
    - `compute_offline_minutes(last_seen_at: datetime | None, status: str) -> int | None`
    - `infer_log_level(message: str) -> str` — retorna `"INFO"`, `"WARN"` ou `"ERROR"`
    - `async def enforce_log_retention(session: AsyncSession, device_id: uuid.UUID, max_logs: int = 500) -> None` — conta logs do device; se > max_logs, deleta os mais antigos até atingir exatamente max_logs
  - _Requirements: 2.2, 2.3, 2.4, 4.4, 4.5, 4.6_

  - [ ]* 5.1 Escrever teste de propriedade para `compute_rssi_quality`
    - **Property 1: compute_rssi_quality cobre todos os intervalos sem lacunas**
    - **Validates: Requirements 4.5**

  - [ ]* 5.2 Escrever teste de propriedade para `infer_log_level`
    - **Property 2: infer_log_level classifica corretamente por palavras-chave**
    - **Validates: Requirements 2.2**

  - [ ]* 5.3 Escrever teste de propriedade para `enforce_log_retention`
    - **Property 3: enforce_log_retention garante invariante de no máximo 500 logs por device**
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 5.4 Escrever teste de propriedade para `compute_firmware_outdated`
    - **Property 4: compute_firmware_outdated é True sse ambas as versões são não nulas e diferentes**
    - **Validates: Requirements 4.4**

- [ ] 6. Atualizar mqtt_service para persistir campos de diagnóstico e inferir level
  - Abrir `backend/app/services/mqtt_service.py`
  - Importar `device_service` de `app.services.device_service`
  - Atualizar `_handle_discovery()`:
    - Extrair do payload: `firmware_version`, `rssi`, `is_root`, `mesh_node_count`, `ip_address`, `uptime_seconds`
    - Persistir cada campo no device se presente no payload
    - Incluir `firmware_version` e `rssi` no broadcast `device_discovery`
  - Atualizar `_handle_status()`:
    - Extrair `rssi` do payload JSON (se o payload for JSON); se for string simples, manter comportamento atual
    - Se `rssi` presente, persistir no device
  - Atualizar `_handle_log()`:
    - Chamar `level = device_service.infer_log_level(message)` antes de criar o log
    - Passar `level=level` ao construtor de `ESPDeviceLog`
    - Após `session.commit()`, chamar `await device_service.enforce_log_retention(session, device.id)`
    - Incluir `level` no broadcast `device_log`
  - Atualizar `_add_log()` para aceitar parâmetro opcional `level: str = "INFO"` e passá-lo ao `ESPDeviceLog`
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4_

- [ ] 7. Atualizar GET /devices com response enriquecida
  - Abrir `backend/app/api/api_v1/endpoints/devices.py`
  - Importar `FirmwareVersion` de `app.models.firmware_version`
  - Importar `device_service` de `app.services.device_service`
  - Adicionar schema `DeviceEnrichedOut(BaseModel)` com todos os campos definidos no design (incluindo `workcenter_name`, `latest_firmware`, `firmware_outdated`, `rssi_quality`, `offline_minutes`)
  - Atualizar o handler `list_devices`:
    - Buscar `latest_firmware` via query `SELECT * FROM firmware_versions WHERE is_stable=True ORDER BY created_at DESC LIMIT 1`
    - Para cada device, calcular `firmware_outdated`, `rssi_quality`, `offline_minutes` usando `device_service`
    - Buscar `workcenter_name` via `OdooClient` com graceful degradation (retornar `null` se falhar)
    - Retornar lista de `DeviceEnrichedOut`
  - Atualizar `response_model` do endpoint para `List[DeviceEnrichedOut]`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 8. Implementar PATCH /devices/{device_id} com efeitos colaterais MQTT
  - No mesmo arquivo `backend/app/api/api_v1/endpoints/devices.py`
  - Adicionar schema `DevicePatchRequest(BaseModel)` com `extra="forbid"` e campos opcionais: `device_name`, `location`, `workcenter_id`, `notes`
  - Implementar handler `patch_device(device_id: uuid.UUID, req: DevicePatchRequest, session)`:
    1. Buscar device por UUID — HTTP 404 se não encontrado
    2. Aplicar campos não-nulos do request ao device
    3. Se `workcenter_id` foi alterado e havia valor anterior: publicar `UNASSIGNED` em `andon/state/{mac}` via `_send_andon_state`
    4. Se novo `workcenter_id` não é nulo: publicar em `andon/state/request/{mac}` para sync
    5. Se `workcenter_id` foi alterado: inserir `ESPDeviceLog` com `event_type=binding`, `level="INFO"` e mensagem descritiva
    6. Commit e retornar `DeviceEnrichedOut` com os dados calculados
  - Registrar rota `PATCH /{device_id}` no router
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 9. Implementar GET /devices/{device_id}/logs com filtro por level
  - No mesmo arquivo `backend/app/api/api_v1/endpoints/devices.py`
  - Adicionar schema `DeviceLogOut(BaseModel)` com campo `level: str` (além dos campos existentes)
  - Implementar handler `get_device_logs_by_id(device_id: uuid.UUID, level, limit, session)`:
    - Buscar device por UUID — HTTP 404 se não encontrado
    - Validar `limit <= 500` — HTTP 422 com mensagem "Limite máximo é 500" se exceder
    - Aplicar filtro `level` se fornecido
    - Ordenar por `created_at` DESC, aplicar `LIMIT`
    - Retornar lista de `DeviceLogOut`
  - **ATENÇÃO**: registrar esta rota como `GET /{device_id}/logs` — deve vir DEPOIS de `GET /firmware/versions` no arquivo para evitar conflito
  - Remover ou deprecar o endpoint antigo `GET /{mac_address}/logs` (identificado por string, não UUID)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 10. Implementar POST /devices/{device_id}/sync
  - No mesmo arquivo `backend/app/api/api_v1/endpoints/devices.py`
  - Implementar handler `sync_device(device_id: uuid.UUID, session)`:
    1. Buscar device por UUID — HTTP 404 se não encontrado
    2. Publicar mensagem vazia em `andon/state/request/{mac_address}` com QoS 1 via `aiomqtt`
    3. Retornar HTTP 200 `{"message": "Sync solicitado"}`
    4. Em caso de falha MQTT: logar erro e retornar HTTP 503 `{"detail": "Falha ao publicar comando MQTT"}`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Implementar DELETE /devices/{device_id} com validação de status
  - No mesmo arquivo `backend/app/api/api_v1/endpoints/devices.py`
  - Implementar handler `delete_device(device_id: uuid.UUID, session)`:
    1. Buscar device por UUID — HTTP 404 se não encontrado
    2. Se `device.status == DeviceStatus.online` — HTTP 409 com mensagem descritiva
    3. Deletar todos os `ESPDeviceLog` do device (query DELETE WHERE device_id)
    4. Deletar o device
    5. Emitir `ws_manager.broadcast("device_removed", {"device_id": str(device_id), "mac_address": device.mac_address})`
    6. Retornar HTTP 204
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 11.1 Escrever teste de propriedade para DELETE com validação de status
    - **Property 5: DELETE retorna 409 para devices online e 204 para devices offline**
    - **Validates: Requirements 8.3, 8.4, 8.5**

- [ ] 12. Checkpoint — Validar backend parcial
  - Garantir que todos os testes passam e que as migrations aplicam sem erros (`alembic upgrade head`). Perguntar ao usuário se há dúvidas antes de continuar.

- [ ] 13. Implementar endpoints de firmware (GET e POST /firmware/versions)
  - No mesmo arquivo `backend/app/api/api_v1/endpoints/devices.py`
  - Adicionar schema `FirmwareVersionOut(BaseModel)` com todos os campos do modelo
  - Implementar `GET /firmware/versions`:
    - Buscar todos os registros de `FirmwareVersion` ordenados por `created_at` DESC
    - Retornar `List[FirmwareVersionOut]`
  - Implementar `POST /firmware/versions` com `multipart/form-data`:
    - Aceitar campos: `version: str`, `release_notes: Optional[str]`, `is_stable: bool`, `file: UploadFile`
    - Validar extensão `.bin` — HTTP 422 se inválida
    - Validar unicidade de `version` — HTTP 409 se já existir
    - Salvar arquivo em `backend/storage/ota/firmware/{version}.bin`
    - Criar registro `FirmwareVersion` com `created_by` do usuário autenticado (ou `"system"` se não autenticado)
    - Retornar HTTP 201 com `FirmwareVersionOut`
  - **ATENÇÃO**: registrar `GET /firmware/versions` e `POST /firmware/versions` ANTES de qualquer rota com `{device_id}` no router
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [ ] 14. Implementar POST /devices/{device_id}/ota e POST /devices/ota/batch
  - No mesmo arquivo `backend/app/api/api_v1/endpoints/devices.py`
  - Adicionar schemas `OTATriggerRequest` e `BatchOTARequest` com `extra="forbid"`
  - Implementar `POST /{device_id}/ota`:
    1. Buscar device por UUID — HTTP 404 se não encontrado
    2. Validar `status == online` — HTTP 409 se offline
    3. Buscar `FirmwareVersion` pelo `firmware_version_id` — HTTP 422 se não encontrado
    4. Validar que `file_path` existe no filesystem — HTTP 422 se não encontrado
    5. Publicar em `andon/ota/trigger` payload `{"version", "url", "size", "target_mac"}`
    6. Logar "OTA: Disparado para device {mac} versão {version} por {triggered_by}"
    7. Retornar HTTP 202 `{"message": "OTA disparado para {device_name}", "target_version": "{version}"}`
  - Implementar `POST /ota/batch`:
    1. Buscar `FirmwareVersion` — HTTP 404 se não encontrado
    2. Se `device_ids` fornecido: filtrar devices por UUID e `status=online`
    3. Se `device_ids` omitido: filtrar devices com `firmware_outdated=True` e `status=online` (calcular usando `device_service`)
    4. Se nenhum device elegível: retornar HTTP 200 `{"message": "Nenhum dispositivo elegível...", "device_count": 0}`
    5. Para cada device elegível: publicar OTA trigger com `target_mac`
    6. Retornar HTTP 202 `{"message": "OTA em lote disparado", "device_count": N, "target_version": version}`
  - **ATENÇÃO**: registrar `POST /ota/batch` ANTES de `POST /{device_id}/ota` no router
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

- [ ] 15. Implementar background task de alerta de device offline
  - Criar `backend/app/services/device_offline_task.py`
  - Implementar `async def _offline_check_loop()`:
    - Loop infinito com `await asyncio.sleep(300)` no início de cada iteração
    - Ler limiar de `os.getenv("DEVICE_OFFLINE_ALERT_MINUTES", "10")` a cada iteração
    - Calcular `threshold_dt = datetime.utcnow() - timedelta(minutes=threshold)`
    - Buscar devices com `status=offline` e `last_seen_at < threshold_dt`
    - Para cada device: calcular `offline_minutes` e emitir `ws_manager.broadcast("device_offline_alert", {...})`
    - Capturar exceções por iteração, logar e continuar
  - Implementar `start_offline_task()` e `stop_offline_task()` com `asyncio.create_task` e `.cancel()`
  - Abrir `backend/app/main.py` e no evento `startup` (lifespan): chamar `start_offline_task()` após `start_mqtt_service()`
  - No evento `shutdown`: chamar `stop_offline_task()` após `stop_mqtt_service()`
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [ ] 16. Checkpoint — Validar backend completo
  - Garantir que todos os testes passam, que os novos endpoints respondem corretamente e que a background task inicia sem erros. Perguntar ao usuário se há dúvidas antes de continuar com o frontend.

- [ ] 17. Adicionar tipos TypeScript em `types.ts`
  - Abrir `frontend/src/app/types.ts`
  - Adicionar interface `ESPDeviceEnriched` com todos os campos definidos no design (incluindo campos calculados)
  - Adicionar interface `DeviceLog` com campo `level: 'INFO' | 'WARN' | 'ERROR'`
  - Adicionar interface `FirmwareVersion` com todos os campos do modelo
  - Adicionar interfaces `DevicePatchRequest`, `OTATriggerRequest`, `BatchOTARequest`, `BatchOTAResponse`
  - _Requirements: 13.1, 14.1, 15.1, 16.1_

- [ ] 18. Adicionar métodos de API em `api.ts`
  - Abrir `frontend/src/services/api.ts`
  - Adicionar os seguintes métodos tipados:
    - `getDevicesEnriched(): Promise<ESPDeviceEnriched[]>` — `GET /devices`
    - `patchDevice(deviceId: string, payload: DevicePatchRequest): Promise<ESPDeviceEnriched>` — `PATCH /devices/{id}`
    - `getDeviceLogsById(deviceId: string, level?: string, limit?: number): Promise<DeviceLog[]>` — `GET /devices/{id}/logs`
    - `syncDevice(deviceId: string): Promise<void>` — `POST /devices/{id}/sync`
    - `deleteDevice(deviceId: string): Promise<void>` — `DELETE /devices/{id}`
    - `getFirmwareVersions(): Promise<FirmwareVersion[]>` — `GET /devices/firmware/versions`
    - `uploadFirmwareVersion(formData: FormData): Promise<FirmwareVersion>` — `POST /devices/firmware/versions`
    - `triggerDeviceOTA(deviceId: string, payload: OTATriggerRequest): Promise<void>` — `POST /devices/{id}/ota`
    - `triggerBatchOTA(payload: BatchOTARequest): Promise<BatchOTAResponse>` — `POST /devices/ota/batch`
  - _Requirements: 13.7, 14.4, 14.7, 15.1, 16.1_

- [ ] 19. Criar tela AndonDevicesPage com tabela e cards de resumo
  - Criar `frontend/src/app/components/AndonDevicesPage.tsx`
  - Estado: `devices: ESPDeviceEnriched[]`, `loading: boolean`
  - Busca inicial via `getDevicesEnriched()` ao montar
  - Renderizar 4 cards de resumo calculados a partir do estado:
    - "Total de Dispositivos" (contagem total)
    - "Online 🟢" (filtro `status === 'online'`)
    - "Offline 🔴" (filtro `status === 'offline'`)
    - "Desatualizados 🟡" (filtro `firmware_outdated === true`)
  - Renderizar tabela com colunas: Device (nome + MAC), Mesa Vinculada, Status, Sinal WiFi, Firmware, Último Contato, Ações
  - Badges de status: 🟢 online / 🔴 offline / 🟡 sem vínculo (`workcenter_id === null`)
  - Coluna Sinal WiFi: exibir `rssi_quality` com cor (verde=Ótimo, azul=Bom, amarelo=Fraco, vermelho=Crítico)
  - Coluna Firmware: exibir versão com badge ⚠️ quando `firmware_outdated === true`
  - Coluna Ações: ✏️ Editar (abre `DeviceDrawer`), 📋 Logs (abre `DeviceDrawer` na aba Logs), 🔄 Sync (chama `syncDevice`), 🗑️ Remover (habilitado só quando `status === 'offline'`, exibe diálogo de confirmação antes de chamar `deleteDevice`)
  - Conectar ao WebSocket `/api/v1/devices/ws`:
    - `device_discovery` → adicionar/atualizar device no estado
    - `device_status` → atualizar `status` do device correspondente
    - `device_removed` → remover device do estado
    - `device_offline_alert` → exibir toast de aviso via Sonner
  - Registrar rota `/andon/devices` em `App.tsx`
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [ ]* 19.1 Escrever testes de UI para `AndonDevicesPage`
    - Testar renderização dos 4 cards com contagens corretas
    - Testar resposta a eventos WebSocket (atualizar/remover linha)
    - _Requirements: 13.2, 13.9_

- [ ] 20. Criar DeviceDrawer com abas de informações e logs
  - Criar `frontend/src/app/components/DeviceDrawer.tsx`
  - Props: `device: ESPDeviceEnriched | null`, `open: boolean`, `defaultTab?: 'info' | 'logs'`, `onClose: () => void`, `onDeviceUpdated: (d: ESPDeviceEnriched) => void`
  - **Aba "Informações"**:
    - Campos editáveis (React Hook Form): Nome, Localização, Mesa (dropdown com workcenters do Odoo), Observações
    - Campos somente leitura: MAC Address, Firmware (com badge ⚠️ se `firmware_outdated`), Sinal WiFi (RSSI + label), Tipo (Raiz/Folha baseado em `is_root`), Último Contato (timestamp pt-BR)
    - Botão "Salvar" chama `patchDevice` e exibe toast de sucesso/erro via Sonner
    - Botão "Disparar OTA" visível quando `firmware_outdated === true` — abre modal de seleção de versão (lista `getFirmwareVersions()`) e após confirmação chama `triggerDeviceOTA`, abrindo `OTADeviceProgressModal`
  - **Aba "Logs"**:
    - Busca inicial via `getDeviceLogsById(device.id)`
    - Filtro de nível: "Todos" | "INFO" | "WARN" | "ERROR" — ao selecionar, recarrega com parâmetro `level`
    - Colorir linhas: cinza=INFO, amarelo=WARN, vermelho=ERROR
    - Badge `level` colorido ao lado de cada mensagem
    - Badge vermelho na aba "Logs" quando há pelo menos 1 log ERROR nos últimos 50 carregados
    - Ao receber evento WebSocket `device_log` para o device aberto: adicionar ao topo da lista sem recarregar
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 20.1 Escrever testes de UI para `DeviceDrawer`
    - Testar renderização das duas abas
    - Testar estado do botão "Salvar" e chamada ao `patchDevice`
    - Testar adição de log em tempo real via WebSocket mock
    - _Requirements: 14.4, 15.4_

- [ ] 21. Criar OTADeviceProgressModal com barra de progresso
  - Criar `frontend/src/app/components/OTADeviceProgressModal.tsx`
  - Props: `open: boolean`, `device: ESPDeviceEnriched`, `targetVersion: string`, `onClose: () => void`
  - Exibir: nome do device, versão de origem (`firmware_version`), versão de destino (`targetVersion`), barra de progresso percentual
  - Consumir eventos WebSocket `ota_progress` filtrados por `mac_address` do device
  - Mapear `status` do evento para estados sequenciais: `downloading` → "Baixando", `installing` → "Gravando", `rebooting` → "Reiniciando", `success` → "Concluído ✅", `failed` → "Falhou ❌"
  - Atualizar barra de progresso com o campo `progress` (0–100)
  - Quando `status === 'success'`: exibir ícone de check verde e habilitar botão "Fechar"
  - Quando `status === 'failed'`: exibir mensagem de erro em vermelho e habilitar botão "Fechar"
  - Botão "Fechar" desabilitado enquanto OTA está em andamento
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [ ]* 21.1 Escrever testes de UI para `OTADeviceProgressModal`
    - Testar progressão de estados via WebSocket mock
    - Testar habilitação do botão "Fechar" ao concluir/falhar
    - _Requirements: 16.5, 16.6_

- [ ] 22. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, ask the user if questions arise.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- **Ordem crítica de rotas no router de devices**: `GET /firmware/versions` e `POST /firmware/versions` ANTES de `GET /{device_id}/logs`; `POST /ota/batch` ANTES de `POST /{device_id}/ota`
- Os testes de propriedade usam `hypothesis` com `@settings(max_examples=100)`
- O modelo `FirmwareVersion` é distinto do `FirmwareRelease` existente (OTA em massa via GitHub)
- Todos os novos endpoints identificam devices por UUID (`device_id`), não por `mac_address`
- A background task de offline alert usa `asyncio.create_task` nativo, sem Celery
- Graceful degradation no Odoo: se `workcenter_name` falhar, retornar `null` sem propagar erro

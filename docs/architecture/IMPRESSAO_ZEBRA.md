# Impressão de Etiquetas Zebra — ID Visual AX

Guia de configuração, uso e diagnóstico do módulo de impressão de etiquetas via impressoras Zebra ZPL/TCP.

---

## Requisitos de Hardware

| Item | Especificação |
|------|--------------|
| Modelo recomendado | Zebra ZD421 (203 dpi) |
| Protocolo | RAW TCP/IP (ZPL II) |
| Porta padrão | **9100** |
| Conectividade | Ethernet ou Wi-Fi com **IP fixo** |
| Mídia — Etiqueta técnica | 100 × 45 mm (contínua ou destacável) |
| Mídia — Etiqueta externa | 100 × 55 mm (contínua ou destacável) |

> A impressora **deve ter IP fixo** na rede local. Configure via DHCP reservation no roteador ou diretamente no painel da impressora (Menu → Network → IP Address).

---

## Configuração do IP no Sistema

O sistema lê o IP da impressora da tabela `system_setting` com a chave `zebra_printer_ip`.

### Opção 1 — Script de seed (recomendado na instalação)

```bash
# Configura o IP diretamente
python backend/scripts/seed_printer_settings.py --ip 192.168.1.100

# Dry-run para verificar sem persistir
python backend/scripts/seed_printer_settings.py --ip 192.168.1.100 --dry-run
```

### Opção 2 — Via API (endpoint de Settings)

```bash
curl -X PATCH http://localhost:8000/api/v1/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"zebra_printer_ip": "192.168.1.100"}'
```

### Opção 3 — Direto no banco (PostgreSQL)

```sql
INSERT INTO system_setting (key, value, description)
VALUES ('zebra_printer_ip', '192.168.1.100', 'IP da impressora Zebra')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Chaves disponíveis

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `zebra_printer_ip` | `""` (vazio) | IP da impressora. Vazio = impressão desabilitada (retorna 503) |
| `zebra_printer_port` | `9100` | Porta TCP RAW. Alterar apenas se necessário |

---

## Fluxo de Uso

1. Abrir **LoteDoDia** (Dashboard → selecionar um lote ativo)
2. Na view de matriz, localizar a linha da MO desejada
3. Clicar no botão **🖨 Imprimir** (ao lado do número da MO)
4. O drawer lateral abre com os dados da MO pré-preenchidos (read-only):
   - Nome da Obra
   - Nome do Quadro (product_name)
   - Código AX
   - Código FAB
5. Preencher os **dados técnicos** opcionais:
   - Corrente Nominal (In) — ex: `40A`
   - Frequência — padrão `60Hz`
   - Cap. de Corte (Icu) — ex: `6kA`
   - Tensão — ex: `380V`
   - Curva de Disparo — ex: `Curva C`
   - Tensão de Impulso (Uimp) — ex: `4kV`
   - Tensão de Isolamento (Ui) — ex: `415V`
6. Preencher a **URL do QR code** (link para documentos no Odoo) — opcional
7. Escolher o tipo de impressão:
   - **Imprimir Etiqueta Técnica** → etiqueta interna 100×45mm com dados elétricos
   - **Imprimir Etiqueta Externa** → etiqueta externa 100×55mm com QR code
   - **Imprimir Ambas** → envia as duas em sequência

> Os dados técnicos **não são persistidos** no servidor — são enviados apenas no body da requisição e descartados após a impressão.

---

## Endpoint da API

```
POST /api/v1/id-visual/print/labels
```

**Body:**
```json
{
  "id_request_id": "uuid-da-id-request",
  "label_type": "technical" | "external" | "both",
  "corrente_nominal": "40A",
  "frequencia": "60Hz",
  "cap_corte": "6kA",
  "tensao": "380V",
  "curva_disparo": "Curva C",
  "tensao_impulso": "4kV",
  "tensao_isolamento": "415V",
  "qr_url": "https://odoo.ax.com.br/web#id=123&model=mrp.production"
}
```

**Respostas:**
| Código | Situação |
|--------|----------|
| `200` | Etiqueta enviada com sucesso |
| `404` | IDRequest não encontrada |
| `503` | `zebra_printer_ip` não configurado ou impressora inacessível |

---

## Testar sem Impressora Física

### Usando netcat (Linux/macOS)

```bash
# Escutar na porta 9100 e exibir o ZPL recebido
nc -l 9100

# Em outro terminal, configurar o IP da máquina local no sistema
# e disparar uma impressão pela UI ou via curl
```

### Usando netcat (Windows — WSL ou Git Bash)

```bash
nc -l -p 9100
```

### Validar ZPL online

Cole o conteúdo ZPL gerado em [Labelary Online ZPL Viewer](http://labelary.com/viewer.html) para visualizar a etiqueta antes de imprimir.

### Simular envio direto

```bash
# Gerar ZPL manualmente e enviar via netcat
echo "^XA^FO50,50^A0N,50,50^FDTeste^FS^XZ" | nc 192.168.1.100 9100
```

---

## Diagnóstico de Problemas

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| HTTP 503 "Impressora não configurada" | `zebra_printer_ip` vazio | Configurar o IP via Settings |
| HTTP 503 "Impressora não acessível" | IP errado ou impressora offline | Verificar IP, cabo/Wi-Fi e se a impressora está ligada |
| Etiqueta impressa em branco | Mídia incorreta ou cabeça de impressão suja | Verificar tipo de mídia (térmica direta) e limpar cabeça |
| ZPL cortado / etiqueta incompleta | Timeout de rede | Aumentar `zebra_printer_timeout` em SystemSetting (padrão: 5s) |
| Texto ilegível / caracteres errados | Encoding incorreto | O sistema usa UTF-8 (`^CI28`); verificar se a impressora suporta |

---

## Arquitetura do Módulo

```
POST /id-visual/print/labels
        │
        ├── Busca IDRequest + ManufacturingOrder (banco local)
        ├── Lê zebra_printer_ip de SystemSetting
        ├── Renderiza ZPL via zpl_templates.py (funções puras)
        └── Envia via ZebraPrinter (asyncio TCP socket, porta 9100)
```

Arquivos relevantes:
- `backend/app/services/zebra_printer.py` — cliente TCP assíncrono
- `backend/app/services/zpl_templates.py` — templates ZPL (funções puras)
- `backend/app/api/api_v1/endpoints/print_labels.py` — endpoint FastAPI
- `frontend/src/app/components/PrintLabelDrawer.tsx` — drawer de impressão
- `frontend/src/services/printApi.ts` — cliente de API frontend

# Print Agent — Agente de Impressão Zebra

Script Python standalone que roda no PC do chão de fábrica, faz polling na API do ID Visual AX e envia jobs ZPL para a impressora Zebra via TCP.

---

## 1. Instalação

```bash
pip install -r requirements.txt
```

> Requer Python 3.9+. Sem dependências além de `requests` e `python-dotenv`.

---

## 2. Configuração

Copie o arquivo de exemplo e edite com os valores do seu ambiente:

```bash
cp .env.example .env
```

Edite o `.env`:

```env
APP_URL=https://app.ax.com.br/api/v1   # URL da API
PRINTER_ID=1                            # ID da impressora no sistema
PRINTER_IP=192.168.1.200               # IP da impressora Zebra
PRINTER_PORT=9100                       # Porta TCP (padrão Zebra)
AGENT_KEY=chave-secreta-aqui           # Deve bater com SystemSetting 'print_agent_key'
AGENT_ID=agente-bancada-1              # Identificador único deste agente
POLL_INTERVAL_SECONDS=3                # Intervalo de polling
LOG_LEVEL=INFO
```

**Configurar a chave no sistema:**
Acesse Configurações no app e defina `print_agent_key` com o mesmo valor de `AGENT_KEY`.

---

## 3. Como rodar

```bash
python main.py
```

O agente inicia o loop de polling e exibe logs no console e no arquivo `print_agent.log`.

Para parar: `Ctrl+C` ou enviar `SIGTERM`.

---

## 4. Testar sem impressora física

Use `netcat` para simular a impressora e ver o ZPL recebido:

**Linux/macOS:**
```bash
nc -l 9100 | cat
```

**Windows (WSL ou Git Bash):**
```bash
nc -l -p 9100
```

Configure `PRINTER_IP=127.0.0.1` no `.env` e dispare um job pelo app. O ZPL aparecerá no terminal do netcat.

Você também pode colar o ZPL no [Labelary Online Viewer](http://labelary.com/viewer.html) para visualizar a etiqueta.

---

## 5. Empacotar para Windows (executável único)

```bash
pip install pyinstaller
pyinstaller --onefile main.py
```

O executável gerado fica em `dist/main.exe`. Copie junto com o `.env` para o PC da fábrica.

---

## 6. Criar serviço no Windows

### Opção A — NSSM (recomendado)

1. Baixe o [NSSM](https://nssm.cc/download)
2. Instale o serviço:

```cmd
nssm install PrintAgent "C:\print_agent\dist\main.exe"
nssm set PrintAgent AppDirectory "C:\print_agent"
nssm set PrintAgent AppStdout "C:\print_agent\print_agent.log"
nssm set PrintAgent AppStderr "C:\print_agent\print_agent.log"
nssm start PrintAgent
```

### Opção B — sc.exe (nativo Windows)

```cmd
sc create PrintAgent binPath= "C:\print_agent\dist\main.exe" start= auto
sc start PrintAgent
```

Para parar/remover:
```cmd
sc stop PrintAgent
sc delete PrintAgent
```

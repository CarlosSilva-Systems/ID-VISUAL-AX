# Como Compilar o Firmware ESP32

## Opção 1: Arduino IDE (Recomendado para você)

1. Abra o Arduino IDE
2. Abra o arquivo `hardware/src/main.cpp`
3. Configure a placa:
   - **Placa**: ESP32 Dev Module
   - **Upload Speed**: 921600
   - **CPU Frequency**: 240MHz
   - **Flash Frequency**: 80MHz
   - **Flash Mode**: QIO
   - **Flash Size**: 4MB (32Mb)
   - **Partition Scheme**: Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)
   - **Core Debug Level**: None
   - **PSRAM**: Disabled

4. Clique em **Sketch** → **Export Compiled Binary** (ou pressione `Ctrl+Alt+S`)

5. O arquivo `.bin` será gerado em:
   ```
   C:\Users\carlo\AppData\Local\Temp\arduino\sketches\<sketch_id>\main.ino.bin
   ```

6. Copie o arquivo `.bin` para a pasta `hardware/` com um nome descritivo:
   ```
   andon_v1.0.0.bin
   ```

## Opção 2: PlatformIO CLI

Se você instalar o PlatformIO:

```bash
cd hardware
pio run
```

O arquivo `.bin` será gerado em:
```
hardware/.pio/build/esp32dev/firmware.bin
```

## Opção 3: Usar o arquivo já compilado

Se você já compilou recentemente no Arduino IDE, procure em:
```
C:\Users\carlo\AppData\Local\Temp\arduino\sketches\
```

Procure pela pasta mais recente e copie o arquivo `.bin`.

## Verificação do Arquivo

Um arquivo `.bin` válido deve ter:
- Tamanho: entre 500KB e 2MB (tipicamente ~800KB para este projeto)
- Extensão: `.bin`
- Conteúdo: binário (não é texto)

## Próximos Passos

Após gerar o `.bin`:
1. Renomeie para `andon_v1.0.0.bin`
2. Siga o guia `COMO_CRIAR_RELEASE_GITHUB.md` para publicar no GitHub
3. Teste o sistema OTA no ID Visual AX

# Compilação Rápida do Firmware

## Passo a Passo Simplificado

Você já trabalhou com este código no Arduino IDE. Para gerar o `.bin`:

### 1. Abra o Arduino IDE

### 2. Abra o projeto
- Arquivo → Abrir
- Navegue até: `hardware/src/main.cpp`

### 3. Exporte o binário compilado
- **Sketch** → **Export Compiled Binary**
- Ou pressione: `Ctrl + Alt + S`

### 4. Aguarde a compilação
O Arduino IDE vai:
- Compilar o código
- Gerar o arquivo `.bin`
- Salvar em uma pasta temporária

### 5. Localize o arquivo gerado
O Arduino IDE mostra a mensagem:
```
Done compiling
Sketch uses XXXXX bytes (XX%) of program storage space.
```

O arquivo `.bin` está em:
```
C:\Users\carlo\AppData\Local\Temp\arduino\sketches\sketch_XXXXXXXX\main.ino.bin
```

**Dica**: Clique em **Sketch** → **Show Sketch Folder** para abrir a pasta do projeto, depois navegue até a pasta `build` ou `temp`.

### 6. Copie o arquivo
Copie o `main.ino.bin` para:
```
C:\Users\carlo\OneDrive\Documentos\5-DEV\id_visual_2\hardware\andon_v1.0.0.bin
```

### 7. Verifique o arquivo
- Tamanho esperado: ~800KB a 1.5MB
- Extensão: `.bin`

## Pronto!

Agora você pode:
1. Criar um release no GitHub (veja `COMO_CRIAR_RELEASE_GITHUB.md`)
2. Anexar o arquivo `andon_v1.0.0.bin` ao release
3. Testar o sistema OTA no ID Visual AX

## Troubleshooting

### "Erro ao compilar"
- Verifique se todas as bibliotecas estão instaladas
- Veja a lista em `hardware/platformio.ini` → `lib_deps`

### "Não encontro o arquivo .bin"
- Procure em: `C:\Users\carlo\AppData\Local\Temp\arduino\sketches\`
- Ordene por data de modificação (mais recente primeiro)
- Procure por pastas com nomes como `sketch_XXXXXXXX`

### "Arquivo muito pequeno (<100KB)"
- Algo deu errado na compilação
- Verifique os erros no console do Arduino IDE
- Recompile com **Sketch** → **Verify/Compile** primeiro

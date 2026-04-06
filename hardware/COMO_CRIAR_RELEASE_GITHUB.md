# Como Criar um Release no GitHub para OTA

Este guia explica como criar um release no GitHub para disponibilizar firmwares para atualização OTA dos dispositivos ESP32.

## Pré-requisitos

- Ter um arquivo `.bin` compilado do firmware ESP32
- Acesso de escrita ao repositório `CarlosSilva-Systems/ID-VISUAL-AX`

## Passos para Criar um Release

### 1. Acessar a Página de Releases

1. Acesse: https://github.com/CarlosSilva-Systems/ID-VISUAL-AX/releases
2. Clique no botão **"Draft a new release"** (ou "Create a new release")

### 2. Preencher os Dados do Release

**Tag version** (obrigatório):
- Use versionamento semântico: `v1.0.0`, `v1.0.1`, `v1.1.0`, etc.
- Exemplo: `v1.0.0`

**Release title** (opcional):
- Dê um nome descritivo: "Firmware ESP32 Andon v1.0.0"
- Ou use o mesmo nome da tag

**Description** (recomendado):
- Descreva as mudanças nesta versão
- Exemplo:
  ```
  ## Novidades
  - Implementação inicial do sistema Andon
  - Suporte a botões amarelo e vermelho
  - Integração MQTT com backend
  
  ## Correções
  - Fix no debounce dos botões
  ```

### 3. Anexar o Arquivo de Firmware

1. Na seção **"Attach binaries"**, clique em **"Attach files by dragging & dropping, selecting or pasting them"**
2. Selecione o arquivo `.bin` compilado (ex: `firmware.bin`, `andon_v1.0.0.bin`)
3. Aguarde o upload completar

**IMPORTANTE**: O sistema OTA busca automaticamente o primeiro arquivo `.bin` anexado ao release.

### 4. Publicar o Release

1. Marque a opção **"Set as the latest release"** (se for a versão mais recente)
2. Clique em **"Publish release"**

## Verificação no Sistema

Após publicar o release:

1. Acesse o sistema ID Visual AX
2. Vá em **Configurações** → **OTA**
3. Clique em **"Verificar GitHub"**
4. O sistema deve detectar o novo release e exibir:
   - Versão disponível
   - Tamanho do arquivo
   - Opção para baixar

## Estrutura Esperada

O sistema espera que cada release tenha:
- ✅ Uma tag no formato `vX.Y.Z` (ex: `v1.0.0`)
- ✅ Pelo menos um arquivo `.bin` anexado
- ✅ Status "Published" (não "Draft")

## Exemplo de Nomenclatura

Recomendações para nomear os arquivos `.bin`:

```
andon_v1.0.0.bin
andon_v1.0.1.bin
andon_v1.1.0.bin
esp32_firmware_v2.0.0.bin
```

## Troubleshooting

### Erro: "Repositório ou releases não encontrados"
- Verifique se o repositório está público ou se o `GITHUB_TOKEN` está configurado (para repos privados)
- Confirme que existe pelo menos um release publicado (não draft)

### Erro: "Nenhum arquivo .bin encontrado"
- Verifique se o arquivo anexado tem extensão `.bin`
- Confirme que o upload foi concluído antes de publicar

### Release não aparece no sistema
- Aguarde alguns segundos e clique em "Verificar GitHub" novamente
- Verifique se o release está marcado como "latest"
- Confirme que a tag segue o formato semântico (`vX.Y.Z`)

## Automação Futura

No futuro, este processo pode ser automatizado via GitHub Actions para:
- Compilar o firmware automaticamente
- Criar o release ao fazer push de uma tag
- Anexar o `.bin` compilado automaticamente

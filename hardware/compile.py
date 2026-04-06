#!/usr/bin/env python3
"""
Script para compilar o firmware ESP32 Andon.

Este script tenta compilar o firmware usando PlatformIO ou fornece
instruções para compilação manual no Arduino IDE.
"""
import os
import sys
import subprocess
from pathlib import Path

def check_platformio():
    """Verifica se o PlatformIO está instalado."""
    try:
        result = subprocess.run(
            ["pio", "--version"],
            capture_output=True,
            text=True,
            check=False
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False

def compile_with_platformio():
    """Compila o firmware usando PlatformIO."""
    print("🔨 Compilando firmware com PlatformIO...")
    
    hardware_dir = Path(__file__).parent
    os.chdir(hardware_dir)
    
    try:
        # Limpar build anterior
        subprocess.run(["pio", "run", "--target", "clean"], check=True)
        
        # Compilar
        result = subprocess.run(["pio", "run"], check=True)
        
        # Localizar o arquivo .bin
        bin_file = hardware_dir / ".pio" / "build" / "esp32dev" / "firmware.bin"
        
        if bin_file.exists():
            # Copiar para a raiz com nome versionado
            version = "1.0.0"  # TODO: Ler de config.h
            dest_file = hardware_dir / f"andon_v{version}.bin"
            
            import shutil
            shutil.copy(bin_file, dest_file)
            
            size_kb = dest_file.stat().st_size / 1024
            print(f"\n✅ Firmware compilado com sucesso!")
            print(f"📦 Arquivo: {dest_file.name}")
            print(f"📏 Tamanho: {size_kb:.1f} KB")
            print(f"\n📍 Localização: {dest_file}")
            
            return True
        else:
            print("❌ Erro: Arquivo .bin não encontrado após compilação")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Erro na compilação: {e}")
        return False

def print_manual_instructions():
    """Imprime instruções para compilação manual."""
    print("""
╔══════════════════════════════════════════════════════════════════════════╗
║                   COMPILAÇÃO MANUAL NO ARDUINO IDE                       ║
╚══════════════════════════════════════════════════════════════════════════╝

PlatformIO não está instalado. Siga estas instruções para compilar
manualmente no Arduino IDE:

1️⃣  Abra o Arduino IDE

2️⃣  Abra o arquivo: hardware/src/main.cpp

3️⃣  Configure a placa (Tools → Board):
    • Placa: ESP32 Dev Module
    • Upload Speed: 921600
    • Flash Size: 4MB (32Mb)
    • Partition Scheme: Default 4MB with spiffs

4️⃣  Instale as bibliotecas necessárias (Tools → Manage Libraries):
    • PubSubClient (by Nick O'Leary)
    • ArduinoJson (by Benoit Blanchon)
    • painlessMesh
    • AsyncTCP

5️⃣  Compile e exporte o binário:
    • Sketch → Export Compiled Binary (Ctrl+Alt+S)

6️⃣  Localize o arquivo .bin gerado:
    • Windows: C:\\Users\\<user>\\AppData\\Local\\Temp\\arduino\\sketches\\<id>\\
    • O arquivo será algo como: main.ino.bin

7️⃣  Copie o arquivo para: hardware/andon_v1.0.0.bin

8️⃣  Crie um release no GitHub e anexe o arquivo .bin
    • Veja: hardware/COMO_CRIAR_RELEASE_GITHUB.md

═══════════════════════════════════════════════════════════════════════════

💡 Dica: Para instalar o PlatformIO e automatizar este processo:
   pip install platformio

""")

def main():
    print("🚀 ESP32 Andon Firmware Builder\n")
    
    if check_platformio():
        success = compile_with_platformio()
        sys.exit(0 if success else 1)
    else:
        print("⚠️  PlatformIO não encontrado")
        print_manual_instructions()
        sys.exit(2)

if __name__ == "__main__":
    main()

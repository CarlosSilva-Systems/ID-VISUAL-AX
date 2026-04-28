#!/usr/bin/env python3
"""
Script de teste para endpoints de etiquetas.
Verifica se todos os endpoints estão funcionando corretamente.
"""
import sys
import requests
from typing import Dict, Any

BASE_URL = "http://localhost:8000/api/v1"

def test_health() -> bool:
    """Testa se o backend está rodando."""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend está rodando")
            return True
        else:
            print(f"❌ Backend retornou status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Backend não está rodando (ConnectionError)")
        return False
    except Exception as e:
        print(f"❌ Erro ao testar backend: {e}")
        return False


def test_door_presets() -> bool:
    """Testa endpoint de presets de porta."""
    try:
        response = requests.get(
            f"{BASE_URL}/id-visual/door-presets",
            params={"filter_type": "system"},
            timeout=5
        )
        if response.status_code == 200:
            presets = response.json()
            if len(presets) >= 5:
                print(f"✅ Presets do sistema carregados ({len(presets)} presets)")
                return True
            else:
                print(f"⚠️  Apenas {len(presets)} presets encontrados (esperado: 5)")
                return False
        else:
            print(f"❌ Endpoint de presets retornou status {response.status_code}")
            print(f"   Resposta: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Erro ao testar presets: {e}")
        return False


def test_eplan_endpoints() -> bool:
    """Testa se os endpoints de EPLAN estão registrados."""
    # Não podemos testar sem um mo_id válido, mas podemos verificar se retorna 422 (validação)
    # ao invés de 404 (não encontrado)
    try:
        # Tenta com UUID inválido - deve retornar 422, não 404
        response = requests.get(
            f"{BASE_URL}/id-visual/eplan/invalid-uuid/devices",
            timeout=5
        )
        if response.status_code == 422:
            print("✅ Endpoints de EPLAN estão registrados (validação UUID funcionando)")
            return True
        elif response.status_code == 404:
            print("❌ Endpoints de EPLAN não encontrados (404)")
            return False
        else:
            print(f"⚠️  Endpoint de EPLAN retornou status inesperado: {response.status_code}")
            return True  # Considera sucesso se não for 404
    except Exception as e:
        print(f"❌ Erro ao testar endpoints EPLAN: {e}")
        return False


def test_print_endpoints() -> bool:
    """Testa se os endpoints de impressão estão registrados."""
    try:
        response = requests.get(f"{BASE_URL}/print/printers", timeout=5)
        if response.status_code in [200, 401]:  # 200 OK ou 401 Unauthorized (precisa auth)
            print("✅ Endpoints de impressão estão registrados")
            return True
        elif response.status_code == 404:
            print("❌ Endpoints de impressão não encontrados (404)")
            return False
        else:
            print(f"⚠️  Endpoint de impressão retornou status: {response.status_code}")
            return True
    except Exception as e:
        print(f"❌ Erro ao testar endpoints de impressão: {e}")
        return False


def main():
    """Executa todos os testes."""
    print("=" * 60)
    print("TESTE DE ENDPOINTS DE ETIQUETAS")
    print("=" * 60)
    print()
    
    tests = [
        ("Backend Health", test_health),
        ("Door Presets", test_door_presets),
        ("EPLAN Endpoints", test_eplan_endpoints),
        ("Print Endpoints", test_print_endpoints),
    ]
    
    results = []
    for name, test_func in tests:
        print(f"\n[{name}]")
        result = test_func()
        results.append((name, result))
        print()
    
    print("=" * 60)
    print("RESUMO")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print()
    print(f"Total: {passed}/{total} testes passaram")
    
    if passed == total:
        print("\n🎉 Todos os testes passaram!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} teste(s) falharam")
        print("\nVerifique:")
        print("1. Backend está rodando? (uvicorn app.main:app --reload)")
        print("2. Migrações foram aplicadas? (alembic upgrade head)")
        print("3. Veja logs do backend para mais detalhes")
        sys.exit(1)


if __name__ == "__main__":
    main()

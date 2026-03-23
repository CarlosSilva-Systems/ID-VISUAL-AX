import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_kpis_resumo_requires_auth():
    response = client.get("/api/v1/mpr/analytics/kpis/resumo?periodo_inicio=2026-01-01T00:00:00Z&periodo_fim=2026-12-31T23:59:59Z")
    # Endpoint is protected by Depends(get_current_active_user)
    assert response.status_code == 401

def test_get_fila_ativa_requires_auth():
    response = client.get("/api/v1/mpr/analytics/fila-ativa")
    assert response.status_code == 401

def test_get_config_requires_auth():
    response = client.get("/api/v1/mpr/analytics/config")
    assert response.status_code == 401

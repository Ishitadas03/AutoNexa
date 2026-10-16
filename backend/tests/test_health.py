"""Automated tests for FastAPI health check and documentation endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.core.config import settings
from app.main import app
from app.schemas.health import HealthResponse


@pytest.fixture(scope="module")
def client() -> TestClient:
    """Fixture providing a TestClient for the FastAPI app."""
    return TestClient(app)


def test_health_check_status_code(client: TestClient) -> None:
    """Verify that GET /api/v1/health returns HTTP 200 OK."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_check_payload_matches_configuration(client: TestClient) -> None:
    """Verify that the health check response matches centralized settings."""
    response = client.get("/api/v1/health")
    data = response.json()

    assert data["status"] == "healthy"
    assert data["app_name"] == settings.app_name
    assert data["version"] == settings.app_version


def test_health_check_schema_validation(client: TestClient) -> None:
    """Verify that the health check response validates against HealthResponse schema."""
    response = client.get("/api/v1/health")
    assert response.headers["content-type"].startswith("application/json")

    # Validate against Pydantic schema
    validated = HealthResponse.model_validate(response.json())
    assert validated.status == "healthy"
    assert validated.app_name == "AutoNexa"
    assert validated.version == "0.1.0"


def test_docs_endpoint_available(client: TestClient) -> None:
    """Verify that Swagger UI documentation endpoint /docs is accessible."""
    response = client.get("/docs")
    assert response.status_code == 200
    assert "swagger-ui" in response.text.lower() or "html" in response.headers.get("content-type", "")


def test_openapi_json_available(client: TestClient) -> None:
    """Verify that /openapi.json is accessible and documents the API correctly."""
    response = client.get("/openapi.json")
    assert response.status_code == 200

    schema = response.json()
    assert "openapi" in schema
    assert "info" in schema
    assert schema["info"]["title"] == settings.app_name
    assert schema["info"]["version"] == settings.app_version
    assert f"{settings.api_v1_prefix}/health" in schema["paths"]

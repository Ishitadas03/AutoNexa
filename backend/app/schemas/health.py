"""Health-check response schemas."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Structured response schema for application health-check."""

    status: str = Field(
        default="healthy",
        description="Current operational status of the service",
    )
    app_name: str = Field(
        ...,
        description="Name of the running application",
    )
    version: str = Field(
        ...,
        description="Semantic version of the application",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "healthy",
                "app_name": "AutoNexa",
                "version": "0.1.0",
            }
        }
    }

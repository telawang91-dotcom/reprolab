from fastapi import APIRouter

from app.schemas.settings import ModelConfigRead, ModelConfigUpdate, ModelTestResult
from app.services.config.runtime import get_model_config, save_model_config, test_model_connection


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/model", response_model=ModelConfigRead)
def read_model_config() -> ModelConfigRead:
    return get_model_config()


@router.put("/model", response_model=ModelConfigRead)
def update_model_config(request: ModelConfigUpdate) -> ModelConfigRead:
    return save_model_config(request)


@router.post("/model/test", response_model=ModelTestResult)
def check_model_connection() -> ModelTestResult:
    return test_model_connection()

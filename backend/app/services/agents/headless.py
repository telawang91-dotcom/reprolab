from sqlalchemy.orm import Session

from app.schemas.agent import AgentArtifact, AgentInvokeRequest, AgentInvokeResponse
from app.schemas.chat import ChatRequest
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.agents.orchestrator import run_chat
from app.services.agents.verifier import verify
from app.services.lineage.ledger import get_lineage


async def invoke_agent(
    db: Session,
    request: AgentInvokeRequest,
    adapter: ModelAdapter = model_adapter,
) -> AgentInvokeResponse:
    chat_request = ChatRequest(
        project_id=request.project_id,
        message=request.task,
        dataset_ids=request.inputs.dataset_ids,
        skill_id=request.inputs.skill_id,
    )
    artifacts: list[AgentArtifact] = []
    result = ""
    async for event in run_chat(db, chat_request, adapter):
        if event.event == "artifact":
            artifacts.append(AgentArtifact.model_validate(event.data))
        elif event.event == "message":
            result = str(event.data.get("text") or "")
    if not result:
        raise RuntimeError("agent completed without a final result")
    lineage = {}
    for artifact in artifacts:
        graph = get_lineage(db, artifact.artifact_id)
        if graph is None:
            raise RuntimeError(f"artifact {artifact.artifact_id} has no lineage")
        lineage[str(artifact.artifact_id)] = graph
    report = verify(
        db,
        request.project_id,
        result,
        None,
        ["citation", "number", "figure"],
        adapter,
    )
    return AgentInvokeResponse(
        result=result,
        artifacts=artifacts,
        lineage=lineage,
        verify_report=report,
    )

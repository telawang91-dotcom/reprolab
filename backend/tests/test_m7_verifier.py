from app.services.agents.model_adapter import ModelResponse
from app.services.agents.verifier import _semantic_support


class StaticAdapter:
    def __init__(self, content: str):
        self.content = content

    def chat(self, request):
        return ModelResponse(content=self.content)


def test_semantic_support_uses_model_adapter_structured_result():
    supported, reason = _semantic_support("claim", "evidence", StaticAdapter('{"supports":false,"reason":"主题无关"}'))
    assert supported is False
    assert reason == "主题无关"


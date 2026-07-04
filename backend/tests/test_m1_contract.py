from app.schemas.documents import DocumentDetail


def test_detail_serializes_dataset_schema_with_contract_name():
    schema = DocumentDetail.model_json_schema(by_alias=True)
    assert "schema_json" in schema["properties"]
    assert "dataset_schema" not in schema["properties"]

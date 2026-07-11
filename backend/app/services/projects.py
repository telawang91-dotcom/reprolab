import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Document, Project
from app.services.rag.ingest import ingest


DEMO_PROJECT_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")
DEMO_FILENAME = "palmer_penguins_demo.csv"
DEMO_CSV = b"species,island,bill_length_mm,bill_depth_mm,flipper_length_mm,body_mass_g\nAdelie,Torgersen,39.1,18.7,181,3750\nAdelie,Torgersen,39.5,17.4,186,3800\nAdelie,Dream,40.3,18.0,195,3250\nChinstrap,Dream,46.5,17.9,192,3500\nChinstrap,Dream,50.0,19.5,196,3900\nChinstrap,Dream,49.6,18.2,193,3775\nGentoo,Biscoe,46.1,13.2,211,4500\nGentoo,Biscoe,50.0,16.3,230,5700\nGentoo,Biscoe,48.7,14.1,210,4450\n"


def prepare_demo_project(db: Session) -> Project:
    project = db.get(Project, DEMO_PROJECT_ID)
    if project is None:
        project = Project(
            id=DEMO_PROJECT_ID,
            name="ReproLab 演示",
            description="隔离的 Palmer Penguins 演示项目；不会写入真实研究资料。",
        )
        db.add(project)
        db.flush()
    document = db.scalar(select(Document).where(
        Document.project_id == DEMO_PROJECT_ID, Document.filename == DEMO_FILENAME,
    ))
    if document is None:
        ingest(db, DEMO_FILENAME, DEMO_CSV, DEMO_PROJECT_ID, "other")
    db.commit()
    db.refresh(project)
    return project

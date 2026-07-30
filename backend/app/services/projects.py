import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Collection, Dataset, Document, Project
from app.services.rag.ingest import ingest


DEMO_PROJECT_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")
DEMO_COLLECTION_ID = uuid.UUID("00000000-0000-0000-0000-000000000102")
DEMO_FILENAME = "palmer_penguins_demo.csv"
DEMO_NOTE_FILENAME = "README-DEMO.md"
DEMO_CSV = b"species,island,bill_length_mm,bill_depth_mm,flipper_length_mm,body_mass_g\nAdelie,Torgersen,39.1,18.7,181,3750\nAdelie,Torgersen,39.5,17.4,186,3800\nAdelie,Dream,40.3,18.0,195,3250\nChinstrap,Dream,46.5,17.9,192,3500\nChinstrap,Dream,50.0,19.5,196,3900\nChinstrap,Dream,49.6,18.2,193,3775\nGentoo,Biscoe,46.1,13.2,211,4500\nGentoo,Biscoe,50.0,16.3,230,5700\nGentoo,Biscoe,48.7,14.1,210,4450\n"
DEMO_NOTE = """# ReproLab 隔离演示说明

本研究文件夹只用于功能演示，不代表用户的真实研究成果。表格是 Palmer Penguins
公开数据结构的一个小型演示摘录，包含 Adelie、Chinstrap 和 Gentoo 三类企鹅。

字段含义：species 为企鹅种类，island 为岛屿，bill_length_mm 和 bill_depth_mm
为喙部尺寸，flipper_length_mm 为鳍肢长度，body_mass_g 为体重。

建议演示问题：比较三类企鹅的平均体重与鳍肢长度，并生成带溯源锚点的结论。
""".encode("utf-8")


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
    else:
        # Preparing the deterministic demo again must make it usable without
        # deleting its immutable runs or provenance ledger.
        project.archived_at = None
    collection = db.get(Collection, DEMO_COLLECTION_ID)
    if collection is None:
        collection = Collection(
            id=DEMO_COLLECTION_ID,
            project_id=DEMO_PROJECT_ID,
            name="企鹅形态差异研究",
            description="隔离演示文件夹：用于体验检索、动态分析与可信复现。",
        )
        db.add(collection)
        db.flush()
    document = db.scalar(select(Document).where(
        Document.project_id == DEMO_PROJECT_ID, Document.filename == DEMO_FILENAME,
    ))
    if document is None:
        ingest(
            db,
            DEMO_FILENAME,
            DEMO_CSV,
            DEMO_PROJECT_ID,
            "other",
            DEMO_COLLECTION_ID,
        )
    elif document.collection_id != DEMO_COLLECTION_ID:
        # Repair demo projects created before the guided workspace was added.
        document.collection_id = DEMO_COLLECTION_ID
        dataset = db.scalar(select(Dataset).where(
            Dataset.project_id == DEMO_PROJECT_ID,
            Dataset.name == DEMO_FILENAME,
        ))
        if dataset is not None:
            dataset.collection_id = DEMO_COLLECTION_ID
    note = db.scalar(select(Document).where(
        Document.project_id == DEMO_PROJECT_ID, Document.filename == DEMO_NOTE_FILENAME,
    ))
    if note is None:
        ingest(
            db,
            DEMO_NOTE_FILENAME,
            DEMO_NOTE,
            DEMO_PROJECT_ID,
            "note",
            DEMO_COLLECTION_ID,
        )
    elif note.collection_id != DEMO_COLLECTION_ID:
        note.collection_id = DEMO_COLLECTION_ID
    db.commit()
    db.refresh(project)
    return project

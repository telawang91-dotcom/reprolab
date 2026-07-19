import uuid
from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Chunk, Claim, Conversation, Dataset, Document, Edge, EnvSnapshot, Project, Run
from app.schemas.workbench import (
    ArtifactChange, ArtifactLibraryState, ArtifactListResponse, ArtifactSummary, EvidenceExcerpt, EvidenceResponse, ReportArtifact, ReviewCounts,
    ProjectQualityReport, QualityMetric, ReviewResponse, RunCompare, RunReport, TimelineItem, TimelineResponse,
)


def _project(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise LookupError("project not found")
    return project


def project_document(db: Session, project_id: uuid.UUID, document_id: uuid.UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None or document.project_id != project_id:
        raise LookupError("document not found")
    return document


def project_run(db: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> Run:
    run = db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise LookupError("run not found")
    return run


def project_artifact(db: Session, project_id: uuid.UUID, artifact_id: uuid.UUID) -> Artifact:
    artifact = db.get(Artifact, artifact_id)
    if artifact is None or artifact.project_id != project_id:
        raise LookupError("artifact not found")
    return artifact


def project_timeline(db: Session, project_id: uuid.UUID, limit: int = 30) -> TimelineResponse:
    _project(db, project_id)
    events: list[TimelineItem] = []
    for item in db.scalars(select(Document).where(Document.project_id == project_id).order_by(Document.created_at.desc()).limit(limit)):
        events.append(TimelineItem(kind="document", title=item.title or item.filename, detail="资料已入库", created_at=item.created_at, href=f"/knowledge?document={item.id}", trusted=True))
    for item in db.scalars(select(Run).where(Run.project_id == project_id).order_by(Run.created_at.desc()).limit(limit)):
        events.append(TimelineItem(kind="run", title=f"分析运行 {str(item.id)[:8]}", detail="运行完成，可查看产物与血缘。" if item.status == "success" else "运行失败，建议查看输出并修复代码。", created_at=item.created_at, href=f"/report/{item.id}", trusted=item.status == "success"))
    for item in db.scalars(select(Claim).where(Claim.project_id == project_id).order_by(Claim.created_at.desc()).limit(limit)):
        events.append(TimelineItem(kind="claim", title="研究结论", detail="已验证结论" if item.status == "verified" else "结论待修正或未验证", created_at=item.created_at, href="/writing", trusted=item.status == "verified"))
    for item in db.scalars(select(Conversation).where(Conversation.project_id == project_id).order_by(Conversation.created_at.desc()).limit(limit)):
        events.append(TimelineItem(kind="conversation", title=item.title or "分析会话", detail="可继续追问并复用上下文。", created_at=item.created_at, href="/analysis", trusted=False))
    return TimelineResponse(events=sorted(events, key=lambda item: item.created_at, reverse=True)[:limit])


def project_review(db: Session, project_id: uuid.UUID) -> ReviewResponse:
    project = _project(db, project_id)
    count = lambda model, *where: db.scalar(select(func.count()).select_from(model).where(*where)) or 0
    documents = count(Document, Document.project_id == project_id)
    datasets = count(Dataset, Dataset.project_id == project_id)
    successful = count(Run, Run.project_id == project_id, Run.status == "success")
    failed = count(Run, Run.project_id == project_id, Run.status == "error")
    artifacts = db.scalar(select(func.count()).select_from(Artifact).join(
        Run, Artifact.run_id == Run.id
    ).where(Artifact.project_id == project_id, Run.status == "success")) or 0
    saved_artifacts = db.scalar(select(func.count()).select_from(Artifact).join(
        Run, Artifact.run_id == Run.id
    ).where(Artifact.project_id == project_id, Run.status == "success", Artifact.saved_at.is_not(None))) or 0
    verified = count(Claim, Claim.project_id == project_id, Claim.status == "verified")
    flagged = count(Claim, Claim.project_id == project_id, Claim.status == "flagged")
    risks = ([] if flagged == 0 else [f"有 {flagged} 条结论未通过可信校验。"]) + ([] if failed == 0 else [f"有 {failed} 次分析运行失败，需要复核。"])
    next_actions = []
    if documents == 0: next_actions.append("先添加文献或数据，建立研究范围。")
    elif datasets == 0: next_actions.append("已有资料，下一步可添加 CSV/XLSX 并开始分析。")
    elif successful == 0: next_actions.append("选择数据提出一个分析问题，生成首个可信产物。")
    elif verified == 0: next_actions.append("把可信产物写入结论，并运行来源校验。")
    else: next_actions.append("导出复现报告，或与导师分享只读审阅页。")
    return ReviewResponse(project_id=project.id, project_name=project.name, counts=ReviewCounts(documents=documents, datasets=datasets, successful_runs=successful, failed_runs=failed, artifacts=artifacts, saved_artifacts=saved_artifacts, verified_claims=verified, flagged_claims=flagged), risks=risks, next_actions=next_actions)


def project_artifacts(db: Session, project_id: uuid.UUID, limit: int = 50, view: str = "saved") -> ArtifactListResponse:
    _project(db, project_id)
    trusted_scope = (Artifact.project_id == project_id, Run.status == "success")
    total_count = db.scalar(select(func.count()).select_from(Artifact).join(
        Run, Artifact.run_id == Run.id
    ).where(*trusted_scope)) or 0
    saved_count = db.scalar(select(func.count()).select_from(Artifact).join(
        Run, Artifact.run_id == Run.id
    ).where(
        *trusted_scope, Artifact.saved_at.is_not(None)
    )) or 0
    statement = select(Artifact).join(Run, Artifact.run_id == Run.id).where(*trusted_scope)
    if view == "saved":
        statement = statement.where(Artifact.saved_at.is_not(None))
    elif view == "candidates":
        statement = statement.where(Artifact.saved_at.is_(None))
    elif view != "all":
        raise ValueError("artifact view must be saved, candidates, or all")
    artifacts = list(db.scalars(
        statement.order_by(Artifact.saved_at.desc().nullslast(), Artifact.created_at.desc()).limit(limit)
    ))
    items: list[ArtifactSummary] = []
    for artifact in artifacts:
        run = db.get(Run, artifact.run_id) if artifact.run_id else None
        produced = bool(run and db.scalar(select(Edge.id).where(
            Edge.from_id == run.id, Edge.to_id == artifact.id, Edge.relation == "produces"
        ).limit(1)))
        reads = bool(run and db.scalar(select(Edge.id).where(
            Edge.to_id == run.id, Edge.relation == "reads"
        ).limit(1)))
        source_complete = bool(run and run.status == "success" and produced and (reads or not run.input_hashes))
        items.append(ArtifactSummary(
            id=artifact.id, run_id=artifact.run_id, kind=artifact.kind, title=artifact.title,
            value=artifact.value_json, content_hash=artifact.content_hash, saved_at=artifact.saved_at, created_at=artifact.created_at,
            source_complete=source_complete, run_status=run.status if run else None,
        ))
    return ArtifactListResponse(
        items=items,
        total_count=total_count,
        saved_count=saved_count,
        candidate_count=total_count - saved_count,
    )


def artifact_library_state(db: Session, project_id: uuid.UUID, artifact_id: uuid.UUID) -> ArtifactLibraryState:
    artifact = project_artifact(db, project_id, artifact_id)
    return ArtifactLibraryState(artifact_id=artifact.id, saved=artifact.saved_at is not None, saved_at=artifact.saved_at)


def set_artifact_library_state(
    db: Session, project_id: uuid.UUID, artifact_id: uuid.UUID, saved: bool
) -> ArtifactLibraryState:
    artifact = project_artifact(db, project_id, artifact_id)
    run = db.get(Run, artifact.run_id) if artifact.run_id else None
    if saved and (run is None or run.status != "success"):
        raise ValueError("只有成功运行生成的可信产物可以保存到成果库")
    artifact.saved_at = datetime.now(timezone.utc) if saved else None
    db.commit()
    db.refresh(artifact)
    return ArtifactLibraryState(artifact_id=artifact.id, saved=saved, saved_at=artifact.saved_at)


def project_quality_report(db: Session, project_id: uuid.UUID) -> ProjectQualityReport:
    _project(db, project_id)
    count = lambda model, *where: db.scalar(select(func.count()).select_from(model).where(*where)) or 0
    documents = count(Document, Document.project_id == project_id)
    searchable_documents = db.scalar(
        select(func.count(func.distinct(Document.id)))
        .select_from(Document)
        .join(Chunk, Chunk.document_id == Document.id)
        .where(Document.project_id == project_id)
    ) or 0
    datasets = count(Dataset, Dataset.project_id == project_id)
    successful = count(Run, Run.project_id == project_id, Run.status == "success")
    failed = count(Run, Run.project_id == project_id, Run.status == "error")
    replayed_families = db.scalar(select(func.count()).select_from(
        select(Run.code_hash, Run.input_hash, Run.env_snapshot_id, Run.seed)
        .where(Run.project_id == project_id, Run.status == "success")
        .group_by(Run.code_hash, Run.input_hash, Run.env_snapshot_id, Run.seed)
        .having(func.count(Run.id) > 1)
        .subquery()
    )) or 0
    artifacts = list(db.scalars(select(Artifact).join(
        Run, Artifact.run_id == Run.id
    ).where(Artifact.project_id == project_id, Run.status == "success")))
    complete = 0
    for artifact in artifacts:
        run = db.get(Run, artifact.run_id) if artifact.run_id else None
        produced = bool(run and db.scalar(select(Edge.id).where(
            Edge.from_type == "run", Edge.from_id == run.id,
            Edge.to_type == "artifact", Edge.to_id == artifact.id,
            Edge.relation == "produces",
        ).limit(1)))
        reads = bool(run and db.scalar(select(Edge.id).where(
            Edge.from_type == "dataset", Edge.to_type == "run",
            Edge.to_id == run.id, Edge.relation == "reads",
        ).limit(1)))
        if run and run.status == "success" and produced and (reads or not run.input_hashes):
            complete += 1
    verified = count(Claim, Claim.project_id == project_id, Claim.status == "verified")
    flagged = count(Claim, Claim.project_id == project_id, Claim.status == "flagged")
    claims = count(Claim, Claim.project_id == project_id)

    run_total = successful + failed
    run_ratio = successful / run_total if run_total else None
    provenance_ratio = complete / len(artifacts) if artifacts else None
    verification_ratio = verified / claims if claims else None
    metrics = [
        QualityMetric(key="datasets", title="可分析数据集", value=datasets, state="ready" if datasets else "block", evidence="项目内真实 Dataset 数量"),
        QualityMetric(key="searchable_documents", title="可检索证据文档", value=searchable_documents, total=documents, ratio=searchable_documents / documents if documents else None, state="ready" if searchable_documents else "warn", evidence="至少含一个文本切块的项目文档"),
        QualityMetric(key="run_success", title="分析运行成功率", value=successful, total=run_total, ratio=run_ratio, state="ready" if successful and failed == 0 else ("warn" if successful else "block"), evidence="项目内成功/全部运行"),
        QualityMetric(key="provenance", title="完整血缘覆盖率", value=complete, total=len(artifacts), ratio=provenance_ratio, state="ready" if artifacts and complete == len(artifacts) else "block", evidence="成功 Run、reads 与 produces 边均完整的 Artifact"),
        QualityMetric(key="reproduction", title="一键复现验证", value=replayed_families, total=1, ratio=min(replayed_families, 1), state="ready" if replayed_families else "block", evidence="相同代码、输入、环境与随机种子的成功重放运行族"),
        QualityMetric(key="verification", title="可信结论通过率", value=verified, total=claims, ratio=verification_ratio, state="ready" if verified and flagged == 0 else ("warn" if claims == 0 else "block"), evidence="verified Claim / 全部 Claim"),
    ]
    blockers = []
    if not datasets: blockers.append("还没有真实可分析数据集。")
    if not successful: blockers.append("还没有成功的动态分析运行。")
    if not artifacts: blockers.append("还没有可展示的分析产物。")
    elif complete != len(artifacts): blockers.append(f"有 {len(artifacts) - complete} 个产物缺少完整 Dataset → Run → Artifact 血缘。")
    if successful and not replayed_families: blockers.append("还没有完成一次结果一致的一键复现。")
    if not verified: blockers.append("还没有通过三查的可信结论。")
    if flagged: blockers.append(f"仍有 {flagged} 条结论处于 flagged 状态。")
    next_actions = []
    if not datasets: next_actions.append("进入知识空间上传 CSV/XLSX。")
    if datasets and not successful: next_actions.append("进入分析页选择数据并运行一个未预设问题。")
    if successful and not verified: next_actions.append("从成果箱进入写作，运行检查并修复后保存结论。")
    if artifacts and complete == len(artifacts) and not replayed_families: next_actions.append("从任一产物打开溯源页并执行一次复现。")
    if not blockers: next_actions.append("演示闭环已就绪，可导出复现报告或进入只读审阅。")
    return ProjectQualityReport(
        project_id=project_id,
        generated_at=datetime.now(timezone.utc),
        ready_for_demo=not blockers,
        metrics=metrics,
        blockers=blockers,
        next_actions=next_actions,
    )


def run_report(db: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> RunReport:
    run = project_run(db, project_id, run_id)
    datasets = list(db.scalars(select(Dataset).where(Dataset.project_id == project_id, Dataset.storage_hash.in_(run.input_hashes)))) if run.input_hashes else []
    environment = db.get(EnvSnapshot, run.env_snapshot_id) if run.env_snapshot_id else None
    artifacts = list(db.scalars(select(Artifact).where(
        Artifact.project_id == project_id, Artifact.run_id == run.id
    ).order_by(Artifact.created_at))) if run.status == "success" else []
    return RunReport(run_id=run.id, status=run.status, created_at=run.created_at, code_hash=run.code_hash, input_hash=run.input_hash, seed=run.seed, datasets=[{"id": str(item.id), "name": item.name, "storage_hash": item.storage_hash, "schema": item.schema_json} for item in datasets], environment={"python_version": environment.python_version if environment else None, "env_hash": environment.env_hash if environment else None, "packages": environment.packages if environment else []}, artifacts=[ReportArtifact(id=item.id, kind=item.kind, title=item.title, value=item.value_json) for item in artifacts], reproduction_note="此运行已固定输入哈希、随机种子与环境快照；请从溯源页执行重跑以验证一致性。")


def run_compare(db: Session, project_id: uuid.UUID, baseline_id: uuid.UUID, candidate_id: uuid.UUID) -> RunCompare:
    baseline, candidate = project_run(db, project_id, baseline_id), project_run(db, project_id, candidate_id)
    def indexed(items: Iterable[Artifact]) -> dict[str, Artifact]: return {f"{item.kind}:{item.title or item.id}": item for item in items}
    old = indexed(db.scalars(select(Artifact).where(Artifact.project_id == project_id, Artifact.run_id == baseline.id)))
    new = indexed(db.scalars(select(Artifact).where(Artifact.project_id == project_id, Artifact.run_id == candidate.id)))
    changes = [ArtifactChange(key=key, baseline=old.get(key).value_json if key in old else None, candidate=new.get(key).value_json if key in new else None, changed=(key not in old or key not in new or old[key].value_json != new[key].value_json)) for key in sorted(set(old) | set(new))]
    return RunCompare(baseline_run_id=baseline.id, candidate_run_id=candidate.id, code_changed=baseline.code_hash != candidate.code_hash, input_changed=baseline.input_hash != candidate.input_hash, environment_changed=baseline.env_snapshot_id != candidate.env_snapshot_id, artifact_changes=changes)


def document_evidence(db: Session, project_id: uuid.UUID, document_id: uuid.UUID) -> EvidenceResponse:
    project_document(db, project_id, document_id)
    chunks = list(db.scalars(select(Chunk).where(Chunk.document_id == document_id).order_by(Chunk.position).limit(6)))
    return EvidenceResponse(document_id=document_id, excerpts=[EvidenceExcerpt(section=item.section, position=item.position, content=item.content) for item in chunks])

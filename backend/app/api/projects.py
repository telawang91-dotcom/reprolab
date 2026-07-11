import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.knowledge import Project
from app.schemas.projects import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.projects import prepare_demo_project


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(include_archived: bool = Query(False), db: Session = Depends(get_db)) -> list[Project]:
    statement = select(Project).order_by(Project.created_at.desc(), Project.id.desc())
    if not include_archived:
        statement = statement.where(Project.archived_at.is_(None))
    return list(db.scalars(statement))


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(request: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    item = Project(name=request.name.strip(), description=request.description.strip() if request.description else None)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.post("/demo", response_model=ProjectRead)
def prepare_demo(db: Session = Depends(get_db)) -> Project:
    return prepare_demo_project(db)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(project_id: uuid.UUID, request: ProjectUpdate, db: Session = Depends(get_db)) -> Project:
    item = db.get(Project, project_id)
    if item is None:
        raise HTTPException(status_code=404, detail="project not found")
    if request.name is not None:
        item.name = request.name.strip()
    if request.description is not None:
        item.description = request.description.strip() or None
    db.commit()
    db.refresh(item)
    return item


@router.post("/{project_id}/archive", response_model=ProjectRead)
def archive_project(project_id: uuid.UUID, db: Session = Depends(get_db)) -> Project:
    item = db.get(Project, project_id)
    if item is None:
        raise HTTPException(status_code=404, detail="project not found")
    item.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{project_id}/restore", response_model=ProjectRead)
def restore_project(project_id: uuid.UUID, db: Session = Depends(get_db)) -> Project:
    item = db.get(Project, project_id)
    if item is None:
        raise HTTPException(status_code=404, detail="project not found")
    item.archived_at = None
    db.commit()
    db.refresh(item)
    return item

"""Analytics, roadmap, evaluation and system endpoints."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from .. import __version__
from ..analytics import compute_analytics
from ..demo import seed_demo
from ..roadmap import build_roadmap
from ..schemas import ConfirmBody, EvaluationResult, MilestoneUpdate, RoadmapMilestone
from ..services import AppServices
from ..taxonomy import CAREER_BY_ID
from .deps import APIError, services

router = APIRouter()


@router.get("/health", tags=["system"], summary="Health check")
def health(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return {"status": "ok", "version": __version__, "catalog_records": len(svc.catalog),
            "catalog_source": svc.catalog.source_kind}


@router.get("/system/info", tags=["system"], summary="Dataset provenance, preprocessing report and recommender config")
def system_info(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return svc.system_info()


@router.post("/system/reset", tags=["system"], summary="Delete ALL local user data (backs up first; requires confirm)")
def reset_all(body: ConfirmBody, svc: AppServices = Depends(services)) -> dict[str, Any]:
    if not body.confirm:
        raise APIError(400, "confirmation_required", "Set confirm=true to reset all user data.")
    backup = svc.repo.reset_all()
    return {"reset": True, "backup_folder": backup.name}


@router.post("/system/demo/seed", tags=["system"], summary="Seed clearly labelled demo activity")
def seed(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return seed_demo(svc)


@router.post("/system/demo/clear", tags=["system"], summary="Remove all demo-labelled records (requires confirm)")
def clear_demo(body: ConfirmBody, svc: AppServices = Depends(services)) -> dict[str, Any]:
    if not body.confirm:
        raise APIError(400, "confirmation_required", "Set confirm=true to remove demo data.")
    return {"removed": svc.repo.clear_demo_data()}


@router.get("/analytics", tags=["analytics"], summary="Learning analytics computed from saved activity")
def analytics(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return compute_analytics(svc.repo.snapshot(), svc.catalog)


@router.get("/roadmap", tags=["roadmap"], summary="Personalised roadmap for a career goal")
def roadmap(career_goal: Optional[str] = Query(None), svc: AppServices = Depends(services)) -> dict[str, Any]:
    snapshot = svc.repo.snapshot()
    career_id = career_goal or snapshot["profile"].get("career_goal")
    if not career_id:
        raise APIError(400, "career_goal_required", "Choose a career goal in your profile or pass ?career_goal=.")
    if career_id not in CAREER_BY_ID:
        raise APIError(404, "unknown_career_goal", f"Unknown career goal '{career_id}'.")
    scores, _ = svc.recommender.match_scores(snapshot, "content")
    return build_roadmap(career_id, svc.catalog, scores, snapshot, svc.repo.get_roadmap_state(career_id))


@router.patch("/roadmap/{career_id}/milestones/{stage_id}", response_model=RoadmapMilestone, tags=["roadmap"],
              summary="Mark a roadmap milestone complete or incomplete")
def update_milestone(career_id: str, stage_id: str, body: MilestoneUpdate, svc: AppServices = Depends(services)) -> dict[str, Any]:
    career = CAREER_BY_ID.get(career_id)
    if not career:
        raise APIError(404, "unknown_career_goal", f"Unknown career goal '{career_id}'.")
    if stage_id not in {s.id for s in career.stages}:
        raise APIError(404, "unknown_stage", f"Unknown stage '{stage_id}' for {career.label}.")
    return svc.repo.set_milestone(career_id, stage_id, body.completed)


@router.get("/evaluation", tags=["evaluation"], summary="Latest offline evaluation report (computes it if missing)")
def get_evaluation(svc: AppServices = Depends(services)) -> dict[str, Any]:
    report = svc.get_evaluation()
    if report is None:
        report = svc.run_evaluation()
    return EvaluationResult(**report).model_dump()


@router.post("/evaluation/run", tags=["evaluation"], summary="Re-run the offline evaluation now")
def rerun_evaluation(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return EvaluationResult(**svc.run_evaluation()).model_dump()

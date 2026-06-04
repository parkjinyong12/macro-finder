from fastapi import APIRouter, HTTPException

from scheduler import JOB_MAP, job_last_run

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/status")
def get_status():
    return {
        job: (last.isoformat() if last else None)
        for job, last in job_last_run.items()
    }


@router.post("/run/{job_name}")
def run_job(job_name: str):
    fn = JOB_MAP.get(job_name)
    if not fn:
        raise HTTPException(status_code=404, detail=f"Job '{job_name}' not found. Available: {list(JOB_MAP)}")
    try:
        fn()
        return {"status": "ok", "job": job_name, "last_run": job_last_run[job_name].isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

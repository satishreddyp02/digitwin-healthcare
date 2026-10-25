from fastapi import APIRouter, HTTPException

from ..db.database import save_run
from ..physics.drugs import DRUGS
from ..schemas import SimRequest
from ..services import run_simulation

router = APIRouter()


@router.get("/drugs")
def drugs():
    return {k: dict(label=v["label"], default_dose=v["default_dose"], interval_h=v["interval"],
                    evidence=v.get("evidence", "assumed")) for k, v in DRUGS.items()}


@router.post("/simulate")
def simulate(req: SimRequest):
    for r in req.regimen:
        if r.drug not in DRUGS:
            raise HTTPException(422, f"Unknown drug '{r.drug}'. Available: {list(DRUGS)}")
    result = run_simulation(req)
    result["run_id"] = save_run(req.model_dump(), result)
    return result

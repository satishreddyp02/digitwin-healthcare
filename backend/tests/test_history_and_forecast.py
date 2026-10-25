import subprocess
import sys
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.ml import predict as ml_predict
from app.ml import train

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


def test_simulation_is_logged_and_retrievable():
    r = client.post("/simulate", json={"regimen": [{"drug": "amlodipine", "dose_mg": 5}], "horizon_h": 24}).json()
    assert isinstance(r["run_id"], int)
    hist = client.get("/history").json()
    assert hist[0]["id"] == r["run_id"]
    assert client.get(f"/history/{r['run_id']}").json()["result"]["risk"] == r["risk"]
    assert client.get("/history/9999").status_code == 404


def test_phenylephrine_raises_bp():
    r = client.post("/simulate", json={"regimen": [{"drug": "phenylephrine", "dose_mg": 0.1, "interval_h": 1, "n_doses": 1}],
                                       "horizon_h": 1, "n_points": 25}).json()
    assert max(x["map"] for x in r["series"]) > r["baseline"]["map"] + 3


def test_forecast_requires_model_and_validates_input():
    body = {"sbp": [120.0] * 30, "dbp": [70.0] * 30, "hr": [70.0] * 30}
    if not ml_predict.available():
        assert client.post("/forecast", json=body).status_code == 503
    bad = dict(body, sbp=[500.0] * 30)
    assert client.post("/forecast", json=bad).status_code == 422


def test_pipeline_runs_and_splits_by_patient(tmp_path):
    raw, proc, art = tmp_path / "raw", tmp_path / "proc", tmp_path / "art"
    py = sys.executable
    subprocess.run([py, str(ROOT / "scripts/make_synthetic_data.py"), "--cases", "15", "--out", str(raw)], check=True, capture_output=True)
    subprocess.run([py, str(ROOT / "scripts/build_training_set.py"), "--raw", str(raw), "--out", str(proc)], check=True, capture_output=True)
    ids = {s: set(np.load(proc / f"{s}.npz")["case_ids"].tolist()) for s in ("train", "val", "test")}
    assert not (ids["train"] & ids["val"]) and not (ids["train"] & ids["test"]) and not (ids["val"] & ids["test"])
    res = train.run(proc, art)
    assert set(res["test_xgboost"]) == {"sbp", "dbp", "hr"} and "mae" in res["test_persistence"]["sbp"]
    out = ml_predict.forecast([120.0] * 30, [70.0] * 30, [70.0] * 30, [0.0] * 30, path=art)
    assert out["horizon_s"] == 300 and 40 < out["sbp"] < 250

import time

from fastapi.testclient import TestClient

from app.main import app
from app.physics.windkessel import calibrate, simulate_beat

client = TestClient(app)


def test_calibration_reproduces_bp():
    sv = 0.55 * 120
    R, C = calibrate(150, 95, 75, sv)
    b = simulate_beat(R, C, 75, sv)
    assert abs(b.sbp - 150) < 1.0 and abs(b.dbp - 95) < 1.0


def test_amlodipine_lowers_bp_and_is_fast():
    body = {"regimen": [{"drug": "amlodipine", "dose_mg": 5, "interval_h": 24, "n_doses": 3}],
            "horizon_h": 72}
    t0 = time.perf_counter()
    r = client.post("/simulate", json=body).json()
    assert time.perf_counter() - t0 < 2.0
    assert r["series"][-1]["map"] < r["baseline"]["map"] - 3


def test_metoprolol_lowers_hr():
    body = {"regimen": [{"drug": "metoprolol", "dose_mg": 50, "n_doses": 1}], "horizon_h": 12}
    r = client.post("/simulate", json=body).json()
    assert min(x["hr"] for x in r["series"]) < r["baseline"]["hr"] - 5


def test_overdose_flags_hypotension():
    body = {"patient": {"sbp": 122, "dbp": 76},  # normotensive patient, stacked antihypertensives
            "regimen": [{"drug": "enalapril", "dose_mg": 80, "n_doses": 1},
                        {"drug": "amlodipine", "dose_mg": 40, "n_doses": 1}], "horizon_h": 24}
    assert client.post("/simulate", json=body).json()["risk"] == "high"


def test_seeding_when_no_bp():
    body = {"patient": {"age": 60, "sex": "female", "hr": 72, "ef": 0.55, "sbp": None, "dbp": None}}
    r = client.post("/simulate", json=body).json()
    assert r["model"]["source"] == "demographic seeding prior"


def test_unknown_drug_rejected():
    assert client.post("/simulate", json={"regimen": [{"drug": "x", "dose_mg": 1}]}).status_code == 422

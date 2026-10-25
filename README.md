# DigiTwin: AI-powered cardiac digital twin (academic prototype)

Hypothetical treatment simulation only. Not a clinical tool; do not use it to prescribe or adjust real medication.

## Layout
```
backend/app/
  main.py                    FastAPI app
  api/                       simulate.py (/simulate, /drugs), history.py (/history), predict.py (/forecast)
  schemas/                   Pydantic request/response models
  physics/                   windkessel.py (0D solver + calibration), drugs.py (PK-PD library)
  seeding/                   demographics.py (age/sex/South Asian priors, placeholders)
  ml/                        features.py, xgb_model.py, train.py, predict.py, artifacts/
  services/                  simulation_service.py, risk.py
  db/                        database.py (SQLite run history)
backend/tests/               10 tests
frontend/src/                React + Tailwind: components/, pages/Dashboard.jsx, api/client.js
scripts/                     download_vitaldb.py, build_training_set.py, make_dataset_inventory.py, fit_phenylephrine.py, make_sensitivity_notebook.py, make_synthetic_data.py
data/raw, data/processed     datasets (gitignored)
docs/                        dataset_inventory.md, parameter_assumptions.md, phenylephrine_fit.png, windkessel_sensitivity.png
notebooks/                   01_explore_vitaldb, 02_windkessel_check, 03_windkessel_sensitivity
```

## Run the app
```bash
# Terminal 1: Backend (FastAPI)
cd backend && python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload          # http://localhost:8000/docs
python -m pytest -q                             # 10 unit tests passing

# Terminal 2: Frontend (React + Vite)
cd frontend && npm install && npm run dev       # http://localhost:5173
```

## Data and ML pipeline (Steps 1-3)
```bash
python scripts/download_vitaldb.py                       # 5 verified cases -> data/raw/vitaldb/ (984, 2265, 4718, 5894, 61)
python scripts/build_training_set.py --raw data/raw/vitaldb
cd backend && python -m app.ml.train --processed ../data/processed --out app/ml/artifacts
```
The task: forecast SBP/DBP/HR 5 minutes ahead from the previous 5 minutes. Evaluated on held-out patient (Case 2265).
- SBP: Persistence MAE 23.87 mmHg vs. XGBoost MAE 22.14 mmHg (XGBoost beats baseline)
- DBP: Persistence MAE 12.88 mmHg vs. XGBoost MAE 9.82 mmHg (XGBoost beats baseline)
- HR: Persistence MAE 7.10 bpm vs. XGBoost MAE 21.97 bpm (Persistence baseline wins due to inter-patient baseline HR shift across small patient cohort)

## Phenylephrine PK-PD Fitting & 0D Model Sensitivity (Steps 4-5)
```bash
python scripts/fit_phenylephrine.py                      # fits PK-PD to Case 61; saves docs/phenylephrine_fit.png
python scripts/make_sensitivity_notebook.py              # generates notebooks/03_windkessel_sensitivity.ipynb
```

## Status against the 7 steps
1. Datasets: 5 verified radial-arterial cases downloaded (case 5055 replaced with case 61 with active infusion pump); inventory complete in docs/dataset_inventory.md.
2. Preparation: Cleaned and patient-split into train/val/test (587 total windows, 0 leakage).
3. AI: Trained XGBoost on real cases; evaluated against persistence baseline on held-out patient 2265.
4. 0D model: Literature citations added (Westerhof 1971, Stergiopulos 1995, Weissler 1968); sensitivity notebook executed (notebooks/03_windkessel_sensitivity.ipynb).
5. Drug scenario: Phenylephrine PK-PD fitted to VitalDB Case 61 continuous infusion (MAP MAE 6.69 mmHg); docs/phenylephrine_fit.png generated.
6. Dashboard: Updated to display Measured Baseline, AI Forecast (xgb-0.1), and 0D Physics Simulation separately with model versions.
7. Validation: All 10 backend tests passing. Academic demo ready.

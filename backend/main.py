"""
JalDrishti AI — Python FastAPI Backend Reference
----------------------------------------------
Implements the complete REST API surface using FastAPI, Pandas, NumPy,
SQLite, ReportLab (PDF), and Google GenAI (`google-genai`).

Note: In single-port AI Studio Cloud Run deployments, `server.ts` (Express +
Vite + SQLite) serves both the frontend and identical `/api/*` endpoints on
port 3000. This FastAPI backend can be run standalone via:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import io
import os
import sqlite3
from datetime import datetime, timezone
from typing import List, Literal, Optional

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

load_dotenv()

DB_PATH = os.getenv("JALDRISHTI_DB_PATH", "./data/jaldrishti.db")

app = FastAPI(
    title="JalDrishti AI API",
    description="AI-powered water intelligence and decision-support REST API.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class WeightsPayload(BaseModel):
    availability: float = Field(25, ge=0, le=100)
    depletion: float = Field(25, ge=0, le=100)
    rainfallDeficit: float = Field(20, ge=0, le=100)
    demand: float = Field(15, ge=0, le=100)
    recharge: float = Field(15, ge=0, le=100)


class ScenarioPayload(BaseModel):
    locationId: int
    rainfallVariationPct: float = Field(0, ge=-50, le=50)
    consumptionVariationPct: float = Field(0, ge=-40, le=40)
    rechargeBoostPct: float = Field(0, ge=0, le=60)
    horizonMonths: Literal[6, 12, 24, 36] = 12


class CsvUploadPayload(BaseModel):
    filename: str = "uploaded_water_data.csv"
    csvText: str


class CopilotPayload(BaseModel):
    question: str
    locationId: int
    compareLocationId: Optional[int] = None


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def classify_risk(score: float) -> str:
    if score >= 75:
        return "Critical"
    if score >= 50:
        return "High"
    if score >= 25:
        return "Moderate"
    return "Low"


def compute_depletion_slope(df: pd.DataFrame) -> float:
    valid = df.dropna(subset=["groundwater_depth_m"]).reset_index(drop=True)
    if len(valid) < 3:
        return 0.0
    x = np.arange(len(valid), dtype=float) / 12.0
    y = valid["groundwater_depth_m"].astype(float).to_numpy()
    slope, _ = np.polyfit(x, y, 1)
    return round(float(slope), 2)


def compute_stress_for_location(
    conn: sqlite3.Connection, location_id: int, weights: dict[str, float]
) -> dict:
    loc = conn.execute("SELECT * FROM locations WHERE id = ?", (location_id,)).fetchone()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    rows = conn.execute(
        "SELECT * FROM water_readings WHERE location_id = ? ORDER BY year ASC, month ASC",
        (location_id,),
    ).fetchall()
    df = pd.DataFrame([dict(r) for r in rows])

    expected = max(1, len(df))
    missing_count = int(
        df["groundwater_depth_m"].isna().sum() + df["rainfall_mm"].isna().sum()
        if not df.empty
        else 0
    )
    completeness = round(max(0.0, (expected - min(expected, missing_count)) / expected * 100), 1)

    valid_depths = df["groundwater_depth_m"].dropna() if not df.empty else pd.Series(dtype=float)
    latest_depth = round(float(valid_depths.iloc[-1]), 2) if not valid_depths.empty else None
    slope = compute_depletion_slope(df) if not df.empty else 0.0

    last12 = df.tail(12) if not df.empty else df
    valid_rain = last12["rainfall_mm"].dropna() if not last12.empty else pd.Series(dtype=float)
    annual_rain = round(float(valid_rain.mean() * 12), 1) if not valid_rain.empty else 0.0
    expected_rain = max(100.0, float(loc["expected_annual_rainfall_mm"]))
    rain_anomaly = round(((annual_rain - expected_rain) / expected_rain) * 100.0, 1)

    avail_score = float(np.clip(((latest_depth - 4.0) / 28.0) * 90.0 + 5.0, 0, 100)) if latest_depth is not None else 50.0
    depl_score = float(np.clip(14.0 + (slope / 1.35) * 81.0 if slope > 0 else 10.0, 0, 100))
    rain_score = float(np.clip(24.0 + max(-40.0, -rain_anomaly) * 1.85, 0, 100))
    dem_score = float(loc["demand_pressure_score"])
    rech_score = 100.0 - float(loc["recharge_potential_score"])

    w_sum = sum(weights.values()) or 100.0
    total = (
        avail_score * weights["availability"]
        + depl_score * weights["depletion"]
        + rain_score * weights["rainfallDeficit"]
        + dem_score * weights["demand"]
        + rech_score * weights["recharge"]
    ) / w_sum

    overall = round(float(np.clip(total, 0, 100)), 1)
    return {
        "location": dict(loc),
        "overallScore": overall,
        "riskCategory": classify_risk(overall),
        "currentDepthM": latest_depth,
        "depletionRateMPerYear": slope,
        "annualRainfallMm": annual_rain,
        "rainfallAnomalyPct": rain_anomaly,
        "completenessPct": completeness,
    }


@app.get("/api/health")
def health() -> dict:
    key = os.getenv("GEMINI_API_KEY", "")
    return {
        "status": "ok",
        "service": "JalDrishti AI FastAPI",
        "geminiConfigured": bool(key and key != "MY_GEMINI_API_KEY"),
    }


@app.get("/api/locations")
def list_locations() -> dict:
    with get_conn() as conn:
        w_row = conn.execute("SELECT * FROM stress_weights WHERE id = 1").fetchone()
        weights = (
            {
                "availability": w_row["availability_w"],
                "depletion": w_row["depletion_w"],
                "rainfallDeficit": w_row["rainfall_deficit_w"],
                "demand": w_row["demand_w"],
                "recharge": w_row["recharge_w"],
            }
            if w_row
            else {"availability": 25, "depletion": 25, "rainfallDeficit": 20, "demand": 15, "recharge": 15}
        )
        locs = conn.execute("SELECT id FROM locations ORDER BY id ASC").fetchall()
        return {
            "weights": weights,
            "locations": [compute_stress_for_location(conn, r["id"], weights) for r in locs],
        }


@app.post("/api/scenarios/simulate")
def simulate_scenario(payload: ScenarioPayload) -> dict:
    with get_conn() as conn:
        weights = {"availability": 25, "depletion": 25, "rainfallDeficit": 20, "demand": 15, "recharge": 15}
        current = compute_stress_for_location(conn, payload.locationId, weights)
        start_depth = current["currentDepthM"] or 15.0
        base_rate = current["depletionRateMPerYear"]

        rain_eff = -(payload.rainfallVariationPct / 100.0) * 0.65
        cons_eff = (payload.consumptionVariationPct / 100.0) * 0.72
        rech_eff = -(payload.rechargeBoostPct / 100.0) * 0.55
        adj_rate = base_rate + rain_eff + cons_eff + rech_eff

        opt_rate = min(adj_rate - 0.32, base_rate * 0.45 + rech_eff - 0.25)
        high_rate = max(adj_rate + 0.28, base_rate + 0.48)

        series = []
        for i in range(1, payload.horizonMonths + 1):
            yr = i / 12.0
            series.append(
                {
                    "monthOffset": i,
                    "optimisticDepthM": round(max(1.5, start_depth + opt_rate * yr), 2),
                    "baselineDepthM": round(max(1.5, start_depth + base_rate * yr), 2),
                    "highStressDepthM": round(max(1.5, start_depth + high_rate * yr), 2),
                }
            )
        return {
            "location": current["location"],
            "series": series,
            "disclaimer": "Scenario Estimate Notice: Exploratory sensitivity model, not a validated hydrogeological forecast.",
        }


@app.post("/api/datasets/upload")
def upload_csv(payload: CsvUploadPayload) -> dict:
    df = pd.read_csv(io.StringIO(payload.csvText))
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    required = {"location_name", "year", "month", "groundwater_depth_m", "rainfall_mm"}
    if not required.issubset(set(df.columns)):
        raise HTTPException(status_code=400, detail="Missing required CSV columns.")

    missing_rows = int(df["groundwater_depth_m"].isna().sum() + df["rainfall_mm"].isna().sum())
    return {
        "filename": payload.filename,
        "rowCount": len(df),
        "missingValuesDetected": missing_rows,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/reports/pdf")
def download_pdf(locationId: int = Query(1)) -> Response:
    with get_conn() as conn:
        weights = {"availability": 25, "depletion": 25, "rainfallDeficit": 20, "demand": 15, "recharge": 15}
        summary = compute_stress_for_location(conn, locationId, weights)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 780, f"JalDrishti AI Report - {summary['location']['name']}")
    c.setFont("Helvetica", 11)
    c.drawString(50, 755, f"Water Stress Index: {summary['overallScore']}/100 ({summary['riskCategory']})")
    c.drawString(50, 738, f"Depth: {summary['currentDepthM']} m bgl | Slope: {summary['depletionRateMPerYear']} m/yr")
    c.drawString(50, 721, f"Data Completeness: {summary['completenessPct']}% | Source: {summary['location']['source_type']}")
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=jaldrishti_report.pdf"},
    )

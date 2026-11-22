import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import type {
  DataSourceType,
  DatasetRecord,
  StressWeights,
  WaterLocation,
  WaterReading,
} from '../src/types/water.ts';

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;

function getDbFilePath(): string {
  const configured =
    process.env.JALDRISHTI_DB_PATH?.trim() ||
    (process.env.VERCEL ? '/tmp/jaldrishti.db' : './data/jaldrishti.db');
  return path.resolve(process.cwd(), configured);
}

export function persistDb(): void {
  if (!dbInstance) return;
  const filePath = getDbFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const binary = dbInstance.export();
  fs.writeFileSync(filePath, Buffer.from(binary));
}

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!SQL) {
    const candidates = [
      process.env.SQL_WASM_PATH,
      path.resolve(process.cwd(), 'server/sql-wasm.wasm'),
      path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    ].filter((p): p is string => Boolean(p));
    const wasmPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[candidates.length - 1];
    SQL = await initSqlJs({
      locateFile: () => wasmPath,
      useOldExtensionFunctions: false,
    });
  }

  const filePath = getDbFilePath();
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  initializeSchema(dbInstance);
  seedDemoDataIfEmpty(dbInstance);
  persistDb();
  return dbInstance;
}

function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      basin TEXT NOT NULL,
      aquifer_type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'simulated_demo',
      source_note TEXT NOT NULL,
      population_served INTEGER NOT NULL DEFAULT 100000,
      agricultural_share_pct REAL NOT NULL DEFAULT 65,
      recharge_potential_score REAL NOT NULL DEFAULT 50,
      demand_pressure_score REAL NOT NULL DEFAULT 55,
      expected_annual_rainfall_mm REAL NOT NULL DEFAULT 800,
      dataset_id INTEGER NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS water_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      date_label TEXT NOT NULL,
      groundwater_depth_m REAL NULL,
      rainfall_mm REAL NULL,
      extraction_index REAL NULL,
      recharge_mm REAL NULL,
      source_type TEXT NOT NULL DEFAULT 'simulated_demo',
      is_missing INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uploaded_datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      valid_rows INTEGER NOT NULL,
      missing_rows INTEGER NOT NULL,
      invalid_rows INTEGER NOT NULL,
      location_count INTEGER NOT NULL,
      validation_issues_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stress_weights (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      availability_w REAL NOT NULL,
      depletion_w REAL NOT NULL,
      rainfall_deficit_w REAL NOT NULL,
      demand_w REAL NOT NULL,
      recharge_w REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

interface SeedLocationSpec {
  name: string;
  state: string;
  basin: string;
  aquiferType: string;
  latitude: number;
  longitude: number;
  populationServed: number;
  agriculturalSharePct: number;
  rechargePotentialScore: number;
  demandPressureScore: number;
  expectedAnnualRainfallMm: number;
  baseDepthM: number;
  annualDepletionM: number;
  rainfallScale: number;
  missingMonths?: string[];
}

const DEMO_SOURCE_NOTE =
  'Simulated demonstration profile modeled on typical regional hydrogeology (not official CGWB live sensor telemetry).';

const SEED_LOCATIONS: SeedLocationSpec[] = [
  {
    name: 'Jaipur North Basin',
    state: 'Rajasthan',
    basin: 'Banas-Banganga Sub-Basin',
    aquiferType: 'Hard-Rock Quartzite & Alluvium',
    latitude: 26.9124,
    longitude: 75.7873,
    populationServed: 1450000,
    agriculturalSharePct: 74,
    rechargePotentialScore: 28,
    demandPressureScore: 86,
    expectedAnnualRainfallMm: 620,
    baseDepthM: 28.4,
    annualDepletionM: 1.35,
    rainfallScale: 0.78,
  },
  {
    name: 'Ludhiana Central Alluvial',
    state: 'Punjab',
    basin: 'Sutlej-Indus Plain',
    aquiferType: 'Deep Indo-Gangetic Alluvium',
    latitude: 30.901,
    longitude: 75.8573,
    populationServed: 1620000,
    agriculturalSharePct: 88,
    rechargePotentialScore: 42,
    demandPressureScore: 91,
    expectedAnnualRainfallMm: 730,
    baseDepthM: 26.8,
    annualDepletionM: 1.18,
    rainfallScale: 0.84,
  },
  {
    name: 'Bengaluru Urban South',
    state: 'Karnataka',
    basin: 'Cauvery-Arkavathy',
    aquiferType: 'Fractured Granitic Gneiss',
    latitude: 12.9141,
    longitude: 77.6101,
    populationServed: 2150000,
    agriculturalSharePct: 24,
    rechargePotentialScore: 31,
    demandPressureScore: 82,
    expectedAnnualRainfallMm: 920,
    baseDepthM: 21.5,
    annualDepletionM: 0.92,
    rainfallScale: 0.86,
  },
  {
    name: 'Marathwada Latur Cluster',
    state: 'Maharashtra',
    basin: 'Godavari-Manjra Sub-Basin',
    aquiferType: 'Deccan Basalt (Vesicular)',
    latitude: 18.4088,
    longitude: 76.5604,
    populationServed: 780000,
    agriculturalSharePct: 81,
    rechargePotentialScore: 35,
    demandPressureScore: 76,
    expectedAnnualRainfallMm: 780,
    baseDepthM: 17.9,
    annualDepletionM: 0.84,
    rainfallScale: 0.76,
    missingMonths: ['2025-04'],
  },
  {
    name: 'Anantapur Hard-Rock Zone',
    state: 'Andhra Pradesh',
    basin: 'Penner Basin',
    aquiferType: 'Weathered & Fractured Granite',
    latitude: 14.6819,
    longitude: 77.6006,
    populationServed: 640000,
    agriculturalSharePct: 79,
    rechargePotentialScore: 26,
    demandPressureScore: 74,
    expectedAnnualRainfallMm: 560,
    baseDepthM: 19.2,
    annualDepletionM: 0.78,
    rainfallScale: 0.81,
    missingMonths: ['2025-05', '2026-02'],
  },
  {
    name: 'Ahmedabad Sabarmati Corridor',
    state: 'Gujarat',
    basin: 'Sabarmati Lower Basin',
    aquiferType: 'Multi-Layered Alluvial Aquifer',
    latitude: 23.0225,
    longitude: 72.5714,
    populationServed: 1920000,
    agriculturalSharePct: 54,
    rechargePotentialScore: 46,
    demandPressureScore: 69,
    expectedAnnualRainfallMm: 790,
    baseDepthM: 16.4,
    annualDepletionM: 0.56,
    rainfallScale: 0.92,
  },
  {
    name: 'Indore Malwa Plateau',
    state: 'Madhya Pradesh',
    basin: 'Chambal-Kshipra Divide',
    aquiferType: 'Deccan Trap Basalt',
    latitude: 22.7196,
    longitude: 75.8577,
    populationServed: 1180000,
    agriculturalSharePct: 68,
    rechargePotentialScore: 52,
    demandPressureScore: 63,
    expectedAnnualRainfallMm: 950,
    baseDepthM: 13.8,
    annualDepletionM: 0.44,
    rainfallScale: 0.94,
  },
  {
    name: 'Chennai Coastal Wellfield',
    state: 'Tamil Nadu',
    basin: 'Araniyar-Kosasthalaiyar',
    aquiferType: 'Coastal Sedimentary & Alluvium',
    latitude: 13.0827,
    longitude: 80.2707,
    populationServed: 1740000,
    agriculturalSharePct: 36,
    rechargePotentialScore: 58,
    demandPressureScore: 66,
    expectedAnnualRainfallMm: 1280,
    baseDepthM: 11.6,
    annualDepletionM: 0.35,
    rainfallScale: 0.95,
  },
  {
    name: 'Patna Ganga Floodplain',
    state: 'Bihar',
    basin: 'Middle Ganga Plain',
    aquiferType: 'Unconfined Quaternary Alluvium',
    latitude: 25.5941,
    longitude: 85.1376,
    populationServed: 1320000,
    agriculturalSharePct: 71,
    rechargePotentialScore: 81,
    demandPressureScore: 44,
    expectedAnnualRainfallMm: 1120,
    baseDepthM: 6.9,
    annualDepletionM: 0.14,
    rainfallScale: 1.04,
  },
  {
    name: 'Dehradun Doon Valley',
    state: 'Uttarakhand',
    basin: 'Ganga-Yamuna Foothills',
    aquiferType: 'Piedmont Gravel & Fan Deposits',
    latitude: 30.3165,
    longitude: 78.0322,
    populationServed: 590000,
    agriculturalSharePct: 38,
    rechargePotentialScore: 84,
    demandPressureScore: 37,
    expectedAnnualRainfallMm: 1890,
    baseDepthM: 8.2,
    annualDepletionM: 0.08,
    rainfallScale: 1.02,
  },
];

// Deterministic seasonal rainfall distribution across 12 months (sums to ~1.0)
const MONSOON_WEIGHTS = [
  0.015, // Jan
  0.018, // Feb
  0.022, // Mar
  0.025, // Apr
  0.04, // May
  0.14, // Jun
  0.26, // Jul
  0.25, // Aug
  0.14, // Sep
  0.055, // Oct
  0.02, // Nov
  0.015, // Dec
];

// Seasonal water-table oscillation (deeper in May/Jun pre-monsoon, shallower in Sep/Oct post-monsoon)
const SEASONAL_DEPTH_OFFSET_M = [
  0.1, // Jan
  0.35, // Feb
  0.7, // Mar
  1.15, // Apr
  1.6, // May
  1.25, // Jun
  0.15, // Jul
  -0.85, // Aug
  -1.35, // Sep
  -1.15, // Oct
  -0.65, // Nov
  -0.2, // Dec
];

function deterministicNoise(seedA: number, seedB: number): number {
  const x = Math.sin(seedA * 12.9898 + seedB * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function seedDemoDataIfEmpty(db: Database): void {
  const countRes = db.exec('SELECT COUNT(*) AS cnt FROM stress_weights');
  const weightCount = Number(countRes[0]?.values[0]?.[0] ?? 0);
  if (weightCount === 0) {
    db.run(
      `INSERT INTO stress_weights (id, availability_w, depletion_w, rainfall_deficit_w, demand_w, recharge_w, updated_at)
       VALUES (1, 25, 25, 20, 15, 15, ?)`,
      [new Date().toISOString()],
    );
  }

  const locCountRes = db.exec('SELECT COUNT(*) AS cnt FROM locations');
  const locCount = Number(locCountRes[0]?.values[0]?.[0] ?? 0);
  if (locCount > 0) return;

  const nowIso = new Date().toISOString();

  // Generate 36 months: Dec 2023 through Nov 2026 (aligned to current 2026-11 timeline)
  const timeline: Array<{ year: number; month: number }> = [];
  let y = 2023;
  let m = 12;
  for (let i = 0; i < 36; i++) {
    timeline.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  SEED_LOCATIONS.forEach((spec, idx) => {
    db.run(
      `INSERT INTO locations (
        name, state, basin, aquifer_type, latitude, longitude,
        source_type, source_note, population_served, agricultural_share_pct,
        recharge_potential_score, demand_pressure_score, expected_annual_rainfall_mm,
        dataset_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'simulated_demo', ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        spec.name,
        spec.state,
        spec.basin,
        spec.aquiferType,
        spec.latitude,
        spec.longitude,
        DEMO_SOURCE_NOTE,
        spec.populationServed,
        spec.agriculturalSharePct,
        spec.rechargePotentialScore,
        spec.demandPressureScore,
        spec.expectedAnnualRainfallMm,
        nowIso,
      ],
    );

    const idRes = db.exec('SELECT last_insert_rowid()');
    const locationId = Number(idRes[0].values[0][0]);

    timeline.forEach((t, stepIdx) => {
      const dateLabel = `${t.year}-${String(t.month).padStart(2, '0')}`;
      const isMissing = spec.missingMonths?.includes(dateLabel) ?? false;

      if (isMissing) {
        db.run(
          `INSERT INTO water_readings (
            location_id, year, month, date_label, groundwater_depth_m,
            rainfall_mm, extraction_index, recharge_mm, source_type, is_missing
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 'simulated_demo', 1)`,
          [locationId, t.year, t.month, dateLabel],
        );
        return;
      }

      const monthIdx = t.month - 1;
      const yearsElapsed = stepIdx / 12;
      const noise = (deterministicNoise(idx + 1, stepIdx + 7) - 0.5) * 0.45;

      // For Chennai coastal wellfield, peak rainfall is NE monsoon (Oct-Dec)
      let rainWeight = MONSOON_WEIGHTS[monthIdx];
      if (spec.name.includes('Chennai')) {
        const neWeights = [0.02, 0.01, 0.01, 0.02, 0.04, 0.05, 0.08, 0.1, 0.11, 0.22, 0.23, 0.11];
        rainWeight = neWeights[monthIdx];
      }

      const rainNoise = 0.72 + deterministicNoise(idx + 11, stepIdx + 3) * 0.56;
      const rainfallMm = Math.max(
        0,
        Number((spec.expectedAnnualRainfallMm * spec.rainfallScale * rainWeight * rainNoise).toFixed(1)),
      );

      const seasonalOffset = SEASONAL_DEPTH_OFFSET_M[monthIdx];
      const depthM = Math.max(
        2.1,
        Number((spec.baseDepthM + yearsElapsed * spec.annualDepletionM + seasonalOffset + noise).toFixed(2)),
      );

      const rechargeCoeff = (spec.rechargePotentialScore / 100) * 0.28;
      const rechargeMm = Number((rainfallMm * rechargeCoeff).toFixed(1));
      const extractionIndex = Number(
        Math.min(
          98,
          Math.max(
            18,
            spec.demandPressureScore + (monthIdx >= 2 && monthIdx <= 5 ? 8 : -4) + noise * 4,
          ),
        ).toFixed(1),
      );

      db.run(
        `INSERT INTO water_readings (
          location_id, year, month, date_label, groundwater_depth_m,
          rainfall_mm, extraction_index, recharge_mm, source_type, is_missing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'simulated_demo', 0)`,
        [locationId, t.year, t.month, dateLabel, depthM, rainfallMm, extractionIndex, rechargeMm],
      );
    });
  });
}

function mapLocationRow(row: unknown[]): WaterLocation {
  return {
    id: Number(row[0]),
    name: String(row[1]),
    state: String(row[2]),
    basin: String(row[3]),
    aquiferType: String(row[4]),
    latitude: Number(row[5]),
    longitude: Number(row[6]),
    sourceType: String(row[7]) as DataSourceType,
    sourceNote: String(row[8]),
    populationServed: Number(row[9]),
    agriculturalSharePct: Number(row[10]),
    rechargePotentialScore: Number(row[11]),
    demandPressureScore: Number(row[12]),
    expectedAnnualRainfallMm: Number(row[13]),
    datasetId: row[14] === null || row[14] === undefined ? null : Number(row[14]),
    createdAt: String(row[15]),
  };
}

function mapReadingRow(row: unknown[]): WaterReading {
  return {
    id: Number(row[0]),
    locationId: Number(row[1]),
    year: Number(row[2]),
    month: Number(row[3]),
    dateLabel: String(row[4]),
    groundwaterDepthM: row[5] === null ? null : Number(row[5]),
    rainfallMm: row[6] === null ? null : Number(row[6]),
    extractionIndex: row[7] === null ? null : Number(row[7]),
    rechargeMm: row[8] === null ? null : Number(row[8]),
    sourceType: String(row[9]) as DataSourceType,
    isMissing: Number(row[10]) === 1,
  };
}

export async function getAllLocations(): Promise<WaterLocation[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, name, state, basin, aquifer_type, latitude, longitude,
            source_type, source_note, population_served, agricultural_share_pct,
            recharge_potential_score, demand_pressure_score, expected_annual_rainfall_mm,
            dataset_id, created_at
     FROM locations ORDER BY id ASC`,
  );
  if (!res[0]) return [];
  return res[0].values.map(mapLocationRow);
}

export async function getLocationById(locationId: number): Promise<WaterLocation | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `SELECT id, name, state, basin, aquifer_type, latitude, longitude,
            source_type, source_note, population_served, agricultural_share_pct,
            recharge_potential_score, demand_pressure_score, expected_annual_rainfall_mm,
            dataset_id, created_at
     FROM locations WHERE id = ?`,
  );
  stmt.bind([locationId]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.get();
  stmt.free();
  return mapLocationRow(row);
}

export async function getReadingsForLocation(locationId: number): Promise<WaterReading[]> {
  const db = await getDb();
  const stmt = db.prepare(
    `SELECT id, location_id, year, month, date_label, groundwater_depth_m,
            rainfall_mm, extraction_index, recharge_mm, source_type, is_missing
     FROM water_readings
     WHERE location_id = ?
     ORDER BY year ASC, month ASC`,
  );
  stmt.bind([locationId]);
  const readings: WaterReading[] = [];
  while (stmt.step()) {
    readings.push(mapReadingRow(stmt.get()));
  }
  stmt.free();
  return readings;
}

export async function getStressWeights(): Promise<StressWeights> {
  const db = await getDb();
  const res = db.exec(
    `SELECT availability_w, depletion_w, rainfall_deficit_w, demand_w, recharge_w
     FROM stress_weights WHERE id = 1`,
  );
  const row = res[0]?.values[0];
  if (!row) {
    return {
      availability: 25,
      depletion: 25,
      rainfallDeficit: 20,
      demand: 15,
      recharge: 15,
    };
  }
  return {
    availability: Number(row[0]),
    depletion: Number(row[1]),
    rainfallDeficit: Number(row[2]),
    demand: Number(row[3]),
    recharge: Number(row[4]),
  };
}

export async function updateStressWeights(weights: StressWeights): Promise<StressWeights> {
  const db = await getDb();
  const total =
    weights.availability +
    weights.depletion +
    weights.rainfallDeficit +
    weights.demand +
    weights.recharge;
  if (total <= 0) {
    throw new Error('Factor weights must sum to a positive value.');
  }

  // Normalize strictly to 100
  const normalized: StressWeights = {
    availability: Number(((weights.availability / total) * 100).toFixed(1)),
    depletion: Number(((weights.depletion / total) * 100).toFixed(1)),
    rainfallDeficit: Number(((weights.rainfallDeficit / total) * 100).toFixed(1)),
    demand: Number(((weights.demand / total) * 100).toFixed(1)),
    recharge: Number(((weights.recharge / total) * 100).toFixed(1)),
  };

  db.run(
    `UPDATE stress_weights
     SET availability_w = ?, depletion_w = ?, rainfall_deficit_w = ?, demand_w = ?, recharge_w = ?, updated_at = ?
     WHERE id = 1`,
    [
      normalized.availability,
      normalized.depletion,
      normalized.rainfallDeficit,
      normalized.demand,
      normalized.recharge,
      new Date().toISOString(),
    ],
  );
  persistDb();
  return normalized;
}

export async function getUploadedDatasets(): Promise<DatasetRecord[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, filename, uploaded_at, row_count, valid_rows, missing_rows,
            invalid_rows, location_count, validation_issues_json
     FROM uploaded_datasets ORDER BY id DESC`,
  );
  if (!res[0]) return [];
  return res[0].values.map((row) => ({
    id: Number(row[0]),
    filename: String(row[1]),
    uploadedAt: String(row[2]),
    rowCount: Number(row[3]),
    validRows: Number(row[4]),
    missingRows: Number(row[5]),
    invalidRows: Number(row[6]),
    locationCount: Number(row[7]),
    validationIssues: JSON.parse(String(row[8] || '[]')) as string[],
  }));
}

export interface ParsedCsvReadingInput {
  locationName: string;
  state: string;
  basin: string;
  aquiferType: string;
  latitude: number;
  longitude: number;
  year: number;
  month: number;
  groundwaterDepthM: number | null;
  rainfallMm: number | null;
  rechargeMm: number | null;
  extractionIndex: number | null;
  isMissing: boolean;
}

export async function saveUploadedDataset(params: {
  filename: string;
  rowCount: number;
  validRows: number;
  missingRows: number;
  invalidRows: number;
  validationIssues: string[];
  records: ParsedCsvReadingInput[];
}): Promise<{ dataset: DatasetRecord; importedLocationIds: number[] }> {
  const db = await getDb();
  const nowIso = new Date().toISOString();

  const grouped = new Map<string, ParsedCsvReadingInput[]>();
  for (const r of params.records) {
    const key = r.locationName.trim();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  db.run(
    `INSERT INTO uploaded_datasets (
      filename, uploaded_at, row_count, valid_rows, missing_rows,
      invalid_rows, location_count, validation_issues_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.filename,
      nowIso,
      params.rowCount,
      params.validRows,
      params.missingRows,
      params.invalidRows,
      grouped.size,
      JSON.stringify(params.validationIssues.slice(0, 25)),
    ],
  );
  const dsIdRes = db.exec('SELECT last_insert_rowid()');
  const datasetId = Number(dsIdRes[0].values[0][0]);

  const importedLocationIds: number[] = [];

  for (const [locName, rows] of grouped.entries()) {
    const first = rows[0];
    const sourceNote = `User-uploaded dataset (${params.filename}) imported on ${nowIso.slice(0, 10)}.`;

    // Check if an existing user_uploaded location with the same name exists
    const existingStmt = db.prepare(
      `SELECT id FROM locations WHERE LOWER(name) = LOWER(?) AND source_type = 'user_uploaded' LIMIT 1`,
    );
    existingStmt.bind([locName]);
    let locationId: number | null = null;
    if (existingStmt.step()) {
      locationId = Number(existingStmt.get()[0]);
    }
    existingStmt.free();

    if (locationId === null) {
      db.run(
        `INSERT INTO locations (
          name, state, basin, aquifer_type, latitude, longitude,
          source_type, source_note, population_served, agricultural_share_pct,
          recharge_potential_score, demand_pressure_score, expected_annual_rainfall_mm,
          dataset_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'user_uploaded', ?, 350000, 62, 48, 58, 850, ?, ?)`,
        [
          locName,
          first.state,
          first.basin,
          first.aquiferType,
          first.latitude,
          first.longitude,
          sourceNote,
          datasetId,
          nowIso,
        ],
      );
      const idRes = db.exec('SELECT last_insert_rowid()');
      locationId = Number(idRes[0].values[0][0]);
    } else {
      db.run(
        `UPDATE locations SET dataset_id = ?, source_note = ? WHERE id = ?`,
        [datasetId, sourceNote, locationId],
      );
    }

    importedLocationIds.push(locationId);

    for (const r of rows) {
      const dateLabel = `${r.year}-${String(r.month).padStart(2, '0')}`;
      // Replace existing reading for same location and month if re-uploaded
      db.run(
        `DELETE FROM water_readings WHERE location_id = ? AND date_label = ?`,
        [locationId, dateLabel],
      );
      db.run(
        `INSERT INTO water_readings (
          location_id, year, month, date_label, groundwater_depth_m,
          rainfall_mm, extraction_index, recharge_mm, source_type, is_missing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user_uploaded', ?)`,
        [
          locationId,
          r.year,
          r.month,
          dateLabel,
          r.groundwaterDepthM,
          r.rainfallMm,
          r.extractionIndex,
          r.rechargeMm,
          r.isMissing ? 1 : 0,
        ],
      );
    }
  }

  persistDb();

  return {
    dataset: {
      id: datasetId,
      filename: params.filename,
      uploadedAt: nowIso,
      rowCount: params.rowCount,
      validRows: params.validRows,
      missingRows: params.missingRows,
      invalidRows: params.invalidRows,
      locationCount: grouped.size,
      validationIssues: params.validationIssues.slice(0, 25),
    },
    importedLocationIds,
  };
}

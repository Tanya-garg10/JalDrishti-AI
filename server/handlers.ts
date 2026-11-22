import Papa from 'papaparse';
import type {
  CopilotMessage,
  CsvUploadResponse,
  DateRangeKey,
  ScenarioRequest,
  StressWeights,
} from '../src/types/water.ts';
import {
  getAllLocations,
  getLocationById,
  getReadingsForLocation,
  getStressWeights,
  getUploadedDatasets,
  saveUploadedDataset,
  updateStressWeights,
  type ParsedCsvReadingInput,
} from './db.ts';
import {
  buildConservationRecommendations,
  buildDashboardOverview,
  buildGroundwaterAnalytics,
  computeWaterStress,
  runScenarioSimulation,
} from './analytics.ts';
import { buildRainDrop20Preview, generateCopilotResponse } from './gemini.ts';
import { buildWaterReportPdfBuffer } from './pdf.ts';

export interface HandlerResult {
  status?: number;
  json?: unknown;
  buffer?: Buffer;
  headers?: Record<string, string>;
}

const VALID_RANGES = new Set<DateRangeKey>(['6m', '1y', '2y', '3y', 'all']);

function parseRange(raw: unknown): DateRangeKey {
  if (typeof raw === 'string' && VALID_RANGES.has(raw as DateRangeKey)) {
    return raw as DateRangeKey;
  }
  return 'all';
}

function parseLocationId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function clampNum(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function ok(json: unknown): HandlerResult {
  return { status: 200, json };
}

function fail(status: number, error: string): HandlerResult {
  return { status, json: { error } };
}

export function getHealth(): HandlerResult {
  return ok({
    status: 'ok',
    service: 'JalDrishti AI API',
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    ),
  });
}

export async function getDashboardOverview(
  query: Record<string, unknown>,
): Promise<HandlerResult> {
  try {
    const range = parseRange(query.range);
    const locationId = parseLocationId(query.locationId);
    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);

    const readingsMap = new Map<number, Awaited<ReturnType<typeof getReadingsForLocation>>>();
    await Promise.all(
      locations.map(async (loc) => {
        readingsMap.set(loc.id, await getReadingsForLocation(loc.id));
      }),
    );

    const overview = buildDashboardOverview(
      locations,
      readingsMap,
      weights,
      locationId,
      range,
    );
    return ok(overview);
  } catch (err) {
    console.error('Overview error:', err);
    return fail(500, 'Failed to compute dashboard overview.');
  }
}

export async function getLocations(): Promise<HandlerResult> {
  try {
    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);
    const summaries = await Promise.all(
      locations.map(async (loc) => {
        const readings = await getReadingsForLocation(loc.id);
        const stress = computeWaterStress(loc, readings, weights, 'all');
        const recs = buildConservationRecommendations(loc, stress);
        return {
          location: loc,
          stress,
          conservationOpportunityCount: recs.filter(
            (r) => r.priority === 'Critical' || r.priority === 'High',
          ).length,
        };
      }),
    );
    return ok({ locations: summaries, weights });
  } catch (err) {
    console.error('Locations error:', err);
    return fail(500, 'Failed to load locations.');
  }
}

export async function getStress(query: Record<string, unknown>): Promise<HandlerResult> {
  try {
    const locationId = parseLocationId(query.locationId);
    const range = parseRange(query.range);
    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);
    const target =
      (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
    if (!target) {
      return fail(404, 'No locations found.');
    }
    const readings = await getReadingsForLocation(target.id);
    const stress = computeWaterStress(target, readings, weights, range);
    return ok({ location: target, weights, stress });
  } catch (err) {
    console.error('Stress endpoint error:', err);
    return fail(500, 'Failed to compute Water Stress Index.');
  }
}

export async function putStressWeights(body: unknown): Promise<HandlerResult> {
  try {
    const b = (body ?? {}) as Partial<StressWeights>;
    const weights: StressWeights = {
      availability: clampNum(Number(b.availability ?? 25), 0, 100),
      depletion: clampNum(Number(b.depletion ?? 25), 0, 100),
      rainfallDeficit: clampNum(Number(b.rainfallDeficit ?? 20), 0, 100),
      demand: clampNum(Number(b.demand ?? 15), 0, 100),
      recharge: clampNum(Number(b.recharge ?? 15), 0, 100),
    };
    const sum =
      weights.availability +
      weights.depletion +
      weights.rainfallDeficit +
      weights.demand +
      weights.recharge;
    if (sum <= 0) {
      return fail(400, 'At least one factor weight must be > 0.');
    }
    const saved = await updateStressWeights(weights);
    return ok({ weights: saved });
  } catch (err) {
    console.error('Update weights error:', err);
    return fail(500, 'Failed to update Water Stress weights.');
  }
}

export async function getAnalytics(query: Record<string, unknown>): Promise<HandlerResult> {
  try {
    const locationId = parseLocationId(query.locationId);
    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);
    const target =
      (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
    if (!target) {
      return fail(404, 'No locations available.');
    }
    const readingsMap = new Map<number, Awaited<ReturnType<typeof getReadingsForLocation>>>();
    await Promise.all(
      locations.map(async (loc) => {
        readingsMap.set(loc.id, await getReadingsForLocation(loc.id));
      }),
    );
    const analytics = buildGroundwaterAnalytics(
      target,
      readingsMap.get(target.id) ?? [],
      locations,
      readingsMap,
      weights,
    );
    return ok(analytics);
  } catch (err) {
    console.error('Analytics error:', err);
    return fail(500, 'Failed to compute groundwater analytics.');
  }
}

export async function postScenarioSimulate(body: unknown): Promise<HandlerResult> {
  try {
    const b = (body ?? {}) as Partial<ScenarioRequest>;
    const locationId = parseLocationId(b.locationId) ?? 1;
    const location = await getLocationById(locationId);
    if (!location) {
      return fail(404, 'Selected location not found.');
    }
    const [readings, weights] = await Promise.all([
      getReadingsForLocation(location.id),
      getStressWeights(),
    ]);

    const horizonRaw = Number(b.horizonMonths ?? 12);
    const horizonMonths = [6, 12, 24, 36].includes(horizonRaw) ? horizonRaw : 12;

    const scenarioReq: ScenarioRequest = {
      locationId: location.id,
      rainfallVariationPct: clampNum(Number(b.rainfallVariationPct ?? 0), -50, 50),
      consumptionVariationPct: clampNum(Number(b.consumptionVariationPct ?? 0), -40, 40),
      rechargeBoostPct: clampNum(Number(b.rechargeBoostPct ?? 0), 0, 60),
      horizonMonths,
    };

    const result = runScenarioSimulation(location, readings, weights, scenarioReq);
    return ok(result);
  } catch (err) {
    console.error('Scenario error:', err);
    return fail(500, 'Failed to run scenario simulation.');
  }
}

export async function getConservation(query: Record<string, unknown>): Promise<HandlerResult> {
  try {
    const locationId = parseLocationId(query.locationId);
    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);
    const target =
      (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
    if (!target) {
      return fail(404, 'No locations available.');
    }
    const readings = await getReadingsForLocation(target.id);
    const stress = computeWaterStress(target, readings, weights, 'all');
    const recommendations = buildConservationRecommendations(target, stress);
    return ok({ location: target, stress, recommendations });
  } catch (err) {
    console.error('Conservation error:', err);
    return fail(500, 'Failed to generate conservation plan.');
  }
}

export async function postCopilot(body: unknown): Promise<HandlerResult> {
  try {
    const b = (body ?? {}) as {
      question?: string;
      locationId?: number;
      compareLocationId?: number | null;
      history?: CopilotMessage[];
    };

    const question = (b.question ?? '').trim();
    if (!question) {
      return fail(400, 'Please provide a question for JalDrishti AI Copilot.');
    }
    if (question.length > 1500) {
      return fail(400, 'Question exceeds 1500-character limit.');
    }

    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);
    const primary =
      (b.locationId ? locations.find((l) => l.id === Number(b.locationId)) : null) ??
      locations[0];
    if (!primary) {
      return fail(404, 'No monitored locations available.');
    }

    const readingsMap = new Map<number, Awaited<ReturnType<typeof getReadingsForLocation>>>();
    await Promise.all(
      locations.map(async (loc) => {
        readingsMap.set(loc.id, await getReadingsForLocation(loc.id));
      }),
    );

    const allSummaries = locations.map((loc) => {
      const r = readingsMap.get(loc.id) ?? [];
      const stress = computeWaterStress(loc, r, weights, 'all');
      const recs = buildConservationRecommendations(loc, stress);
      return {
        location: loc,
        stress,
        conservationOpportunityCount: recs.filter(
          (x) => x.priority === 'Critical' || x.priority === 'High',
        ).length,
      };
    });

    const primarySummary = allSummaries.find((s) => s.location.id === primary.id)!;
    const compareSummary = b.compareLocationId
      ? allSummaries.find((s) => s.location.id === Number(b.compareLocationId)) ?? null
      : allSummaries.find((s) => s.location.id !== primary.id) ?? null;

    const primaryReadings = readingsMap.get(primary.id) ?? [];
    const recommendations = buildConservationRecommendations(primary, primarySummary.stress);
    const scenarioRainDrop20 = buildRainDrop20Preview(primary, primaryReadings, weights);

    const copilotRes = await generateCopilotResponse({
      question,
      history: Array.isArray(b.history) ? b.history : [],
      primaryLocation: primary,
      primaryStress: primarySummary.stress,
      compareSummary,
      allSummaries,
      recommendations,
      scenarioRainDrop20,
    });

    return ok(copilotRes);
  } catch (err) {
    console.error('Copilot error:', err);
    return fail(500, 'Failed to process AI Copilot request.');
  }
}

export async function getDatasets(): Promise<HandlerResult> {
  try {
    const datasets = await getUploadedDatasets();
    return ok({ datasets });
  } catch (err) {
    console.error('Datasets list error:', err);
    return fail(500, 'Failed to load uploaded datasets.');
  }
}

export async function postDatasetsUpload(body: unknown): Promise<HandlerResult> {
  try {
    const b = (body ?? {}) as { filename?: string; csvText?: string };
    const filename = (b.filename ?? 'uploaded_water_data.csv').trim().slice(0, 120);
    const csvText = b.csvText ?? '';

    if (!csvText.trim()) {
      return fail(400, 'CSV content is empty.');
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    });

    const headers = parsed.meta.fields ?? [];
    const requiredHeaders = ['location_name', 'year', 'month', 'groundwater_depth_m', 'rainfall_mm'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      return fail(
        400,
        `Missing required CSV columns: ${missingHeaders.join(', ')}. Expected: location_name, year, month, groundwater_depth_m, rainfall_mm.`,
      );
    }

    const validationIssues: string[] = [];
    const previewRows: CsvUploadResponse['previewRows'] = [];
    const validRecords: ParsedCsvReadingInput[] = [];

    let validRows = 0;
    let missingRows = 0;
    let invalidRows = 0;

    parsed.data.forEach((row, index) => {
      const rowNum = index + 2; // 1-indexed + header
      const locationName = (row.location_name ?? '').trim();
      const yearNum = Number(row.year);
      const monthNum = Number(row.month);

      const rawDepth = (row.groundwater_depth_m ?? '').trim();
      const rawRain = (row.rainfall_mm ?? '').trim();

      if (!locationName || !Number.isInteger(yearNum) || yearNum < 1980 || yearNum > 2050 || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        invalidRows += 1;
        const issue = `Row ${rowNum}: Invalid location_name, year (${row.year}), or month (${row.month}).`;
        validationIssues.push(issue);
        if (previewRows.length < 30) {
          previewRows.push({
            rowNumber: rowNum,
            locationName: locationName || '(empty)',
            year: row.year ?? '',
            month: row.month ?? '',
            groundwaterDepthM: null,
            rainfallMm: null,
            status: 'invalid',
            issue,
          });
        }
        return;
      }

      const depthVal = rawDepth === '' || rawDepth.toLowerCase() === 'na' || rawDepth.toLowerCase() === 'null' ? null : Number(rawDepth);
      const rainVal = rawRain === '' || rawRain.toLowerCase() === 'na' || rawRain.toLowerCase() === 'null' ? null : Number(rawRain);

      if (
        (depthVal !== null && (Number.isNaN(depthVal) || depthVal < 0 || depthVal > 350)) ||
        (rainVal !== null && (Number.isNaN(rainVal) || rainVal < 0 || rainVal > 4000))
      ) {
        invalidRows += 1;
        const issue = `Row ${rowNum}: Out-of-range or non-numeric groundwater_depth_m (${rawDepth}) / rainfall_mm (${rawRain}).`;
        validationIssues.push(issue);
        if (previewRows.length < 30) {
          previewRows.push({
            rowNumber: rowNum,
            locationName,
            year: yearNum,
            month: monthNum,
            groundwaterDepthM: null,
            rainfallMm: null,
            status: 'invalid',
            issue,
          });
        }
        return;
      }

      const hasMissing = depthVal === null || rainVal === null;
      if (hasMissing) {
        missingRows += 1;
        validationIssues.push(
          `Row ${rowNum} (${locationName} ${yearNum}-${String(monthNum).padStart(2, '0')}): Missing ${depthVal === null ? 'groundwater_depth_m' : ''}${depthVal === null && rainVal === null ? ' & ' : ''}${rainVal === null ? 'rainfall_mm' : ''} preserved as gap.`,
        );
      } else {
        validRows += 1;
      }

      const latRaw = Number(row.latitude);
      const lngRaw = Number(row.longitude);
      const lat = !Number.isNaN(latRaw) && latRaw >= -90 && latRaw <= 90 && row.latitude ? latRaw : 22.5 + (validRecords.length % 5) * 0.6;
      const lng = !Number.isNaN(lngRaw) && lngRaw >= -180 && lngRaw <= 180 && row.longitude ? lngRaw : 77.2 + (validRecords.length % 5) * 0.6;

      const rechargeVal = row.recharge_mm && !Number.isNaN(Number(row.recharge_mm)) ? Number(row.recharge_mm) : rainVal !== null ? Number((rainVal * 0.14).toFixed(1)) : null;
      const extractionVal = row.extraction_index && !Number.isNaN(Number(row.extraction_index)) ? clampNum(Number(row.extraction_index), 0, 100) : null;

      validRecords.push({
        locationName,
        state: (row.state ?? 'User Uploaded Region').trim() || 'User Uploaded Region',
        basin: (row.basin ?? 'Custom Monitoring Basin').trim() || 'Custom Monitoring Basin',
        aquiferType: (row.aquifer_type ?? 'User-Specified Aquifer').trim() || 'User-Specified Aquifer',
        latitude: lat,
        longitude: lng,
        year: yearNum,
        month: monthNum,
        groundwaterDepthM: depthVal,
        rainfallMm: rainVal,
        rechargeMm: rechargeVal,
        extractionIndex: extractionVal,
        isMissing: hasMissing,
      });

      if (previewRows.length < 30) {
        previewRows.push({
          rowNumber: rowNum,
          locationName,
          year: yearNum,
          month: monthNum,
          groundwaterDepthM: depthVal,
          rainfallMm: rainVal,
          status: hasMissing ? 'missing_values' : 'valid',
          issue: hasMissing ? 'Missing metric preserved as null' : undefined,
        });
      }
    });

    if (validRecords.length === 0) {
      return {
        status: 400,
        json: {
          error: 'No valid or partially valid rows could be parsed from the CSV file.',
          validationIssues,
        },
      };
    }

    const saved = await saveUploadedDataset({
      filename,
      rowCount: parsed.data.length,
      validRows,
      missingRows,
      invalidRows,
      validationIssues,
      records: validRecords,
    });

    const response: CsvUploadResponse = {
      dataset: saved.dataset,
      importedLocationIds: saved.importedLocationIds,
      previewRows,
      message: `Imported ${validRecords.length} records across ${saved.dataset.locationCount} location(s) (${missingRows} missing-value row(s) flagged, ${invalidRows} invalid row(s) rejected).`,
    };

    return ok(response);
  } catch (err) {
    console.error('CSV upload error:', err);
    return fail(500, 'Failed to parse and validate CSV dataset.');
  }
}

export async function getDatasetsExport(query: Record<string, unknown>): Promise<HandlerResult> {
  try {
    const locationId = parseLocationId(query.locationId);
    const locations = await getAllLocations();
    const target =
      (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
    if (!target) {
      return fail(404, 'Location not found.');
    }
    const readings = await getReadingsForLocation(target.id);
    const rows = readings.map((r) => ({
      location_name: target.name,
      state: target.state,
      basin: target.basin,
      aquifer_type: target.aquiferType,
      latitude: target.latitude,
      longitude: target.longitude,
      year: r.year,
      month: r.month,
      date_label: r.dateLabel,
      groundwater_depth_m: r.groundwaterDepthM ?? '',
      rainfall_mm: r.rainfallMm ?? '',
      recharge_mm: r.rechargeMm ?? '',
      extraction_index: r.extractionIndex ?? '',
      source_type: r.sourceType,
      is_missing: r.isMissing ? 1 : 0,
    }));
    const csv = Papa.unparse(rows);
    const safeName = target.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return {
      status: 200,
      buffer: Buffer.from(csv, 'utf-8'),
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="jaldrishti_${safeName}.csv"`,
      },
    };
  } catch (err) {
    console.error('CSV export error:', err);
    return fail(500, 'Failed to export CSV.');
  }
}

export function getDatasetsTemplate(): HandlerResult {
  const sampleRows = [
    {
      location_name: 'Nagpur Wardha Pilot',
      state: 'Maharashtra',
      basin: 'Wardha Sub-Basin',
      aquifer_type: 'Deccan Basalt',
      latitude: 21.1458,
      longitude: 79.0882,
      year: 2026,
      month: 5,
      groundwater_depth_m: 16.8,
      rainfall_mm: 18.4,
    },
    {
      location_name: 'Nagpur Wardha Pilot',
      state: 'Maharashtra',
      basin: 'Wardha Sub-Basin',
      aquifer_type: 'Deccan Basalt',
      latitude: 21.1458,
      longitude: 79.0882,
      year: 2026,
      month: 6,
      groundwater_depth_m: 16.4,
      rainfall_mm: 164.2,
    },
    {
      location_name: 'Nagpur Wardha Pilot',
      state: 'Maharashtra',
      basin: 'Wardha Sub-Basin',
      aquifer_type: 'Deccan Basalt',
      latitude: 21.1458,
      longitude: 79.0882,
      year: 2026,
      month: 7,
      groundwater_depth_m: 14.9,
      rainfall_mm: 288.5,
    },
    {
      location_name: 'Nagpur Wardha Pilot',
      state: 'Maharashtra',
      basin: 'Wardha Sub-Basin',
      aquifer_type: 'Deccan Basalt',
      latitude: 21.1458,
      longitude: 79.0882,
      year: 2026,
      month: 8,
      groundwater_depth_m: '',
      rainfall_mm: 241.0,
    },
    {
      location_name: 'Nagpur Wardha Pilot',
      state: 'Maharashtra',
      basin: 'Wardha Sub-Basin',
      aquifer_type: 'Deccan Basalt',
      latitude: 21.1458,
      longitude: 79.0882,
      year: 2026,
      month: 9,
      groundwater_depth_m: 13.7,
      rainfall_mm: 142.6,
    },
    {
      location_name: 'Nagpur Wardha Pilot',
      state: 'Maharashtra',
      basin: 'Wardha Sub-Basin',
      aquifer_type: 'Deccan Basalt',
      latitude: 21.1458,
      longitude: 79.0882,
      year: 2026,
      month: 10,
      groundwater_depth_m: 14.2,
      rainfall_mm: 48.0,
    },
  ];
  const csv = Papa.unparse(sampleRows);
  return {
    status: 200,
    buffer: Buffer.from(csv, 'utf-8'),
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="jaldrishti_sample_template.csv"',
    },
  };
}

export async function getReportsPdf(query: Record<string, unknown>): Promise<HandlerResult> {
  try {
    const locationId = parseLocationId(query.locationId);
    const horizonRaw = Number(query.horizon ?? 12);
    const horizonMonths = [6, 12, 24, 36].includes(horizonRaw) ? horizonRaw : 12;

    const [locations, weights] = await Promise.all([
      getAllLocations(),
      getStressWeights(),
    ]);
    const target =
      (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
    if (!target) {
      return fail(404, 'Location not found.');
    }

    const readings = await getReadingsForLocation(target.id);
    const stress = computeWaterStress(target, readings, weights, 'all');
    const scenario = runScenarioSimulation(target, readings, weights, {
      locationId: target.id,
      rainfallVariationPct: -15,
      consumptionVariationPct: 5,
      rechargeBoostPct: 10,
      horizonMonths,
    });
    const recommendations = buildConservationRecommendations(target, stress);

    const pdfBuffer = await buildWaterReportPdfBuffer({
      location: target,
      stress,
      readings,
      scenario,
      recommendations,
    });

    const safeName = target.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return {
      status: 200,
      buffer: pdfBuffer,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="jaldrishti_report_${safeName}.pdf"`,
      },
    };
  } catch (err) {
    console.error('PDF generation error:', err);
    return fail(500, 'Failed to generate PDF report.');
  }
}

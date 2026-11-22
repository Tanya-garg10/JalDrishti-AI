import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import Papa from 'papaparse';
import { createServer as createViteServer } from 'vite';
import type {
  CopilotMessage,
  CsvUploadResponse,
  DateRangeKey,
  ScenarioRequest,
  StressWeights,
} from './src/types/water.ts';
import {
  getAllLocations,
  getDb,
  getLocationById,
  getReadingsForLocation,
  getStressWeights,
  getUploadedDatasets,
  saveUploadedDataset,
  updateStressWeights,
  type ParsedCsvReadingInput,
} from './server/db.ts';
import {
  buildConservationRecommendations,
  buildDashboardOverview,
  buildGroundwaterAnalytics,
  computeWaterStress,
  runScenarioSimulation,
} from './server/analytics.ts';
import { buildRainDrop20Preview, generateCopilotResponse } from './server/gemini.ts';
import { buildWaterReportPdfBuffer } from './server/pdf.ts';

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

async function createApp() {
  await getDb();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'JalDrishti AI API',
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY &&
          process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
    });
  });

  // 1. Dashboard Overview
  app.get('/api/dashboard/overview', async (req, res) => {
    try {
      const range = parseRange(req.query.range);
      const locationId = parseLocationId(req.query.locationId);
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
      res.json(overview);
    } catch (err) {
      console.error('Overview error:', err);
      res.status(500).json({ error: 'Failed to compute dashboard overview.' });
    }
  });

  // 2. Locations list & details
  app.get('/api/locations', async (_req, res) => {
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
      res.json({ locations: summaries, weights });
    } catch (err) {
      console.error('Locations error:', err);
      res.status(500).json({ error: 'Failed to load locations.' });
    }
  });

  // 3. Water Stress weights read/update & stress calculation
  app.get('/api/stress', async (req, res) => {
    try {
      const locationId = parseLocationId(req.query.locationId);
      const range = parseRange(req.query.range);
      const [locations, weights] = await Promise.all([
        getAllLocations(),
        getStressWeights(),
      ]);
      const target =
        (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
      if (!target) {
        return res.status(404).json({ error: 'No locations found.' });
      }
      const readings = await getReadingsForLocation(target.id);
      const stress = computeWaterStress(target, readings, weights, range);
      res.json({ location: target, weights, stress });
    } catch (err) {
      console.error('Stress endpoint error:', err);
      res.status(500).json({ error: 'Failed to compute Water Stress Index.' });
    }
  });

  app.put('/api/stress/weights', async (req, res) => {
    try {
      const body = req.body as Partial<StressWeights>;
      const weights: StressWeights = {
        availability: clampNum(Number(body.availability ?? 25), 0, 100),
        depletion: clampNum(Number(body.depletion ?? 25), 0, 100),
        rainfallDeficit: clampNum(Number(body.rainfallDeficit ?? 20), 0, 100),
        demand: clampNum(Number(body.demand ?? 15), 0, 100),
        recharge: clampNum(Number(body.recharge ?? 15), 0, 100),
      };
      const sum =
        weights.availability +
        weights.depletion +
        weights.rainfallDeficit +
        weights.demand +
        weights.recharge;
      if (sum <= 0) {
        return res.status(400).json({ error: 'At least one factor weight must be > 0.' });
      }
      const saved = await updateStressWeights(weights);
      res.json({ weights: saved });
    } catch (err) {
      console.error('Update weights error:', err);
      res.status(500).json({ error: 'Failed to update Water Stress weights.' });
    }
  });

  // 4. Groundwater Analytics
  app.get('/api/analytics', async (req, res) => {
    try {
      const locationId = parseLocationId(req.query.locationId);
      const [locations, weights] = await Promise.all([
        getAllLocations(),
        getStressWeights(),
      ]);
      const target =
        (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
      if (!target) {
        return res.status(404).json({ error: 'No locations available.' });
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
      res.json(analytics);
    } catch (err) {
      console.error('Analytics error:', err);
      res.status(500).json({ error: 'Failed to compute groundwater analytics.' });
    }
  });

  // 5. Predictive Scenario Simulation
  app.post('/api/scenarios/simulate', async (req, res) => {
    try {
      const body = req.body as Partial<ScenarioRequest>;
      const locationId = parseLocationId(body.locationId) ?? 1;
      const location = await getLocationById(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Selected location not found.' });
      }
      const [readings, weights] = await Promise.all([
        getReadingsForLocation(location.id),
        getStressWeights(),
      ]);

      const horizonRaw = Number(body.horizonMonths ?? 12);
      const horizonMonths = [6, 12, 24, 36].includes(horizonRaw) ? horizonRaw : 12;

      const scenarioReq: ScenarioRequest = {
        locationId: location.id,
        rainfallVariationPct: clampNum(Number(body.rainfallVariationPct ?? 0), -50, 50),
        consumptionVariationPct: clampNum(Number(body.consumptionVariationPct ?? 0), -40, 40),
        rechargeBoostPct: clampNum(Number(body.rechargeBoostPct ?? 0), 0, 60),
        horizonMonths,
      };

      const result = runScenarioSimulation(location, readings, weights, scenarioReq);
      res.json(result);
    } catch (err) {
      console.error('Scenario error:', err);
      res.status(500).json({ error: 'Failed to run scenario simulation.' });
    }
  });

  // 6. Conservation Recommendations
  app.get('/api/conservation', async (req, res) => {
    try {
      const locationId = parseLocationId(req.query.locationId);
      const [locations, weights] = await Promise.all([
        getAllLocations(),
        getStressWeights(),
      ]);
      const target =
        (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
      if (!target) {
        return res.status(404).json({ error: 'No locations available.' });
      }
      const readings = await getReadingsForLocation(target.id);
      const stress = computeWaterStress(target, readings, weights, 'all');
      const recommendations = buildConservationRecommendations(target, stress);
      res.json({ location: target, stress, recommendations });
    } catch (err) {
      console.error('Conservation error:', err);
      res.status(500).json({ error: 'Failed to generate conservation plan.' });
    }
  });

  // 7. JalDrishti AI Copilot
  app.post('/api/copilot', async (req, res) => {
    try {
      const body = req.body as {
        question?: string;
        locationId?: number;
        compareLocationId?: number | null;
        history?: CopilotMessage[];
      };

      const question = (body.question ?? '').trim();
      if (!question) {
        return res.status(400).json({ error: 'Please provide a question for JalDrishti AI Copilot.' });
      }
      if (question.length > 1500) {
        return res.status(400).json({ error: 'Question exceeds 1500-character limit.' });
      }

      const [locations, weights] = await Promise.all([
        getAllLocations(),
        getStressWeights(),
      ]);
      const primary =
        (body.locationId ? locations.find((l) => l.id === Number(body.locationId)) : null) ??
        locations[0];
      if (!primary) {
        return res.status(404).json({ error: 'No monitored locations available.' });
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
      const compareSummary = body.compareLocationId
        ? allSummaries.find((s) => s.location.id === Number(body.compareLocationId)) ?? null
        : allSummaries.find((s) => s.location.id !== primary.id) ?? null;

      const primaryReadings = readingsMap.get(primary.id) ?? [];
      const recommendations = buildConservationRecommendations(primary, primarySummary.stress);
      const scenarioRainDrop20 = buildRainDrop20Preview(primary, primaryReadings, weights);

      const copilotRes = await generateCopilotResponse({
        question,
        history: Array.isArray(body.history) ? body.history : [],
        primaryLocation: primary,
        primaryStress: primarySummary.stress,
        compareSummary,
        allSummaries,
        recommendations,
        scenarioRainDrop20,
      });

      res.json(copilotRes);
    } catch (err) {
      console.error('Copilot error:', err);
      res.status(500).json({ error: 'Failed to process AI Copilot request.' });
    }
  });

  // 8. Datasets list & CSV Upload + Validation
  app.get('/api/datasets', async (_req, res) => {
    try {
      const datasets = await getUploadedDatasets();
      res.json({ datasets });
    } catch (err) {
      console.error('Datasets list error:', err);
      res.status(500).json({ error: 'Failed to load uploaded datasets.' });
    }
  });

  app.post('/api/datasets/upload', async (req, res) => {
    try {
      const body = req.body as { filename?: string; csvText?: string };
      const filename = (body.filename ?? 'uploaded_water_data.csv').trim().slice(0, 120);
      const csvText = body.csvText ?? '';

      if (!csvText.trim()) {
        return res.status(400).json({ error: 'CSV content is empty.' });
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
        return res.status(400).json({
          error: `Missing required CSV columns: ${missingHeaders.join(', ')}. Expected: location_name, year, month, groundwater_depth_m, rainfall_mm.`,
        });
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
        return res.status(400).json({
          error: 'No valid or partially valid rows could be parsed from the CSV file.',
          validationIssues,
        });
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

      res.json(response);
    } catch (err) {
      console.error('CSV upload error:', err);
      res.status(500).json({ error: 'Failed to parse and validate CSV dataset.' });
    }
  });

  // 9. CSV Export
  app.get('/api/datasets/export', async (req, res) => {
    try {
      const locationId = parseLocationId(req.query.locationId);
      const locations = await getAllLocations();
      const target =
        (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
      if (!target) {
        return res.status(404).json({ error: 'Location not found.' });
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
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="jaldrishti_${safeName}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error('CSV export error:', err);
      res.status(500).json({ error: 'Failed to export CSV.' });
    }
  });

  // Sample CSV Template Download
  app.get('/api/datasets/template', (_req, res) => {
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
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="jaldrishti_sample_template.csv"');
    res.send(csv);
  });

  // 10. Downloadable PDF Report
  app.get('/api/reports/pdf', async (req, res) => {
    try {
      const locationId = parseLocationId(req.query.locationId);
      const horizonRaw = Number(req.query.horizon ?? 12);
      const horizonMonths = [6, 12, 24, 36].includes(horizonRaw) ? horizonRaw : 12;

      const [locations, weights] = await Promise.all([
        getAllLocations(),
        getStressWeights(),
      ]);
      const target =
        (locationId ? locations.find((l) => l.id === locationId) : null) ?? locations[0];
      if (!target) {
        return res.status(404).json({ error: 'Location not found.' });
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
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="jaldrishti_report_${safeName}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error('PDF generation error:', err);
      res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
  });

  // Vite dev middleware or production static assets
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`JalDrishti AI server running on http://0.0.0.0:${port}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start JalDrishti AI server:', err);
  process.exit(1);
});

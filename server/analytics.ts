import type {
  ConservationRecommendation,
  DashboardInsight,
  DashboardOverviewResponse,
  DataConfidenceInfo,
  DateRangeKey,
  GroundwaterAnalyticsResponse,
  LocationSummary,
  RiskCategory,
  ScenarioOutcome,
  ScenarioPoint,
  ScenarioRequest,
  ScenarioResponse,
  SeasonalSummaryPoint,
  StressFactorContribution,
  StressWeights,
  WaterLocation,
  WaterReading,
  WaterStressResult,
  YearlySummaryPoint,
} from '../src/types/water.ts';

export function classifyRisk(score: number): RiskCategory {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Moderate';
  return 'Low';
}

export function filterReadingsByRange(readings: WaterReading[], range: DateRangeKey): WaterReading[] {
  if (range === 'all' || readings.length === 0) return readings;
  const countMap: Record<Exclude<DateRangeKey, 'all'>, number> = {
    '6m': 6,
    '1y': 12,
    '2y': 24,
    '3y': 36,
  };
  const limit = countMap[range];
  return readings.slice(Math.max(0, readings.length - limit));
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function computeLinearSlopePerYear(readings: WaterReading[]): number {
  const valid = readings
    .map((r, idx) => ({ idx, depth: r.groundwaterDepthM }))
    .filter((d): d is { idx: number; depth: number } => d.depth !== null);

  if (valid.length < 3) return 0;

  const n = valid.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const pt of valid) {
    const xYears = pt.idx / 12;
    sumX += xYears;
    sumY += pt.depth;
    sumXY += xYears * pt.depth;
    sumXX += xYears * xYears;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-9) return 0;
  return Number(((n * sumXY - sumX * sumY) / denominator).toFixed(2));
}

export function computeWaterStress(
  location: WaterLocation,
  allReadings: WaterReading[],
  weights: StressWeights,
  range: DateRangeKey = 'all',
): WaterStressResult {
  const windowReadings = filterReadingsByRange(allReadings, range);
  const validDepths = windowReadings.filter((r) => r.groundwaterDepthM !== null);
  const validRain = windowReadings.filter((r) => r.rainfallMm !== null);
  const validBoth = windowReadings.filter(
    (r) => r.groundwaterDepthM !== null && r.rainfallMm !== null,
  );

  const expectedReadings = Math.max(1, windowReadings.length);
  const missingCount = windowReadings.filter(
    (r) => r.isMissing || r.groundwaterDepthM === null || r.rainfallMm === null,
  ).length;
  const completenessPct = Number(
    clamp(((expectedReadings - missingCount) / expectedReadings) * 100, 0, 100).toFixed(1),
  );
  const confidenceLevel: DataConfidenceInfo['level'] =
    completenessPct >= 90 ? 'High' : completenessPct >= 70 ? 'Moderate' : 'Limited';

  const latestDepth =
    validDepths.length > 0 ? validDepths[validDepths.length - 1].groundwaterDepthM : null;
  const depletionRateMPerYear = computeLinearSlopePerYear(windowReadings);

  // Annualized rainfall from latest 12 months (or scaled from available valid months)
  const last12 = allReadings.slice(Math.max(0, allReadings.length - 12));
  const last12ValidRain = last12.filter((r) => r.rainfallMm !== null);
  const rawRainSum = last12ValidRain.reduce((acc, r) => acc + (r.rainfallMm ?? 0), 0);
  const annualizedRainMm =
    last12ValidRain.length > 0
      ? Number(((rawRainSum / last12ValidRain.length) * 12).toFixed(1))
      : 0;

  const expectedRain = Math.max(100, location.expectedAnnualRainfallMm);
  const rainfallAnomalyPct = Number(
    (((annualizedRainMm - expectedRain) / expectedRain) * 100).toFixed(1),
  );

  // 1. Groundwater availability stress (m bgl scale: 4m -> ~5, 32m -> ~95)
  const availabilityScore =
    latestDepth !== null ? clamp(((latestDepth - 4) / 28) * 90 + 5) : 50;

  // 2. Depletion rate stress (0 m/yr -> 10, 1.4 m/yr -> 95)
  const depletionScore = clamp(
    depletionRateMPerYear <= 0
      ? Math.max(4, 14 + depletionRateMPerYear * 10)
      : 14 + (depletionRateMPerYear / 1.35) * 81,
  );

  // 3. Rainfall deficit stress (0% anomaly -> 25; -35% deficit -> 90; +25% surplus -> 8)
  const deficitPct = Math.max(-40, -rainfallAnomalyPct);
  const rainfallDeficitScore =
    validRain.length === 0 ? 50 : clamp(24 + deficitPct * 1.85);

  // 4. Demand pressure (location pressure + observed extraction index if available)
  const validExt = windowReadings
    .map((r) => r.extractionIndex)
    .filter((v): v is number => v !== null);
  const avgExt =
    validExt.length > 0
      ? validExt.reduce((a, b) => a + b, 0) / validExt.length
      : location.demandPressureScore;
  const demandScore = clamp(0.6 * location.demandPressureScore + 0.4 * avgExt);

  // 5. Recharge deficit (inverse of recharge potential & observed recharge ratio)
  const validRecharge = windowReadings
    .map((r) => r.rechargeMm)
    .filter((v): v is number => v !== null);
  const avgRecharge =
    validRecharge.length > 0
      ? validRecharge.reduce((a, b) => a + b, 0) / validRecharge.length
      : null;
  const baseRechargeStress = 100 - location.rechargePotentialScore;
  const rechargeScore =
    avgRecharge !== null
      ? clamp(baseRechargeStress * 0.75 + clamp(100 - avgRecharge * 2.4) * 0.25)
      : baseRechargeStress;

  const weightSum =
    weights.availability +
    weights.depletion +
    weights.rainfallDeficit +
    weights.demand +
    weights.recharge || 100;

  const wAvail = (weights.availability / weightSum) * 100;
  const wDepl = (weights.depletion / weightSum) * 100;
  const wRain = (weights.rainfallDeficit / weightSum) * 100;
  const wDem = (weights.demand / weightSum) * 100;
  const wRech = (weights.recharge / weightSum) * 100;

  const factors: StressFactorContribution[] = [
    {
      key: 'availability',
      label: 'Groundwater Availability',
      rawMetric: latestDepth !== null ? `${latestDepth.toFixed(2)} m bgl` : 'Missing depth data',
      normalizedScore: Number(availabilityScore.toFixed(1)),
      weightPct: Number(wAvail.toFixed(1)),
      weightedContribution: Number(((availabilityScore * wAvail) / 100).toFixed(1)),
      explanation:
        latestDepth !== null
          ? `Latest water table sits at ${latestDepth.toFixed(2)} m below ground level; deeper levels require higher pumping energy and signal reduced accessible storage.`
          : 'Depth reading missing for selected window; neutral baseline weight applied and reflected in confidence indicator.',
    },
    {
      key: 'depletion',
      label: 'Depletion Rate',
      rawMetric: `${depletionRateMPerYear >= 0 ? '+' : ''}${depletionRateMPerYear.toFixed(2)} m/yr decline`,
      normalizedScore: Number(depletionScore.toFixed(1)),
      weightPct: Number(wDepl.toFixed(1)),
      weightedContribution: Number(((depletionScore * wDepl) / 100).toFixed(1)),
      explanation:
        depletionRateMPerYear > 0.4
          ? `Linear regression across ${validDepths.length} valid observations indicates a sustained water-table drop of ${depletionRateMPerYear.toFixed(2)} m/year.`
          : `Observed multi-month slope shows relatively modest net depth drift (${depletionRateMPerYear.toFixed(2)} m/year).`,
    },
    {
      key: 'rainfallDeficit',
      label: 'Rainfall Deficit',
      rawMetric: `${annualizedRainMm.toFixed(0)} mm/yr (${rainfallAnomalyPct >= 0 ? '+' : ''}${rainfallAnomalyPct.toFixed(1)}% vs normal)`,
      normalizedScore: Number(rainfallDeficitScore.toFixed(1)),
      weightPct: Number(wRain.toFixed(1)),
      weightedContribution: Number(((rainfallDeficitScore * wRain) / 100).toFixed(1)),
      explanation: `Annualized rainfall of ${annualizedRainMm.toFixed(0)} mm compared against regional benchmark ${expectedRain.toFixed(0)} mm/yr.`,
    },
    {
      key: 'demand',
      label: 'Demand Pressure',
      rawMetric: `${demandScore.toFixed(0)}/100 index (${location.agriculturalSharePct}% agri share)`,
      normalizedScore: Number(demandScore.toFixed(1)),
      weightPct: Number(wDem.toFixed(1)),
      weightedContribution: Number(((demandScore * wDem) / 100).toFixed(1)),
      explanation: `Driven by ${location.agriculturalSharePct}% agricultural withdrawal share and municipal extraction pressure serving ~${(location.populationServed / 1000).toFixed(0)}k residents.`,
    },
    {
      key: 'recharge',
      label: 'Recharge Deficit',
      rawMetric: `${location.rechargePotentialScore}/100 aquifer recharge index`,
      normalizedScore: Number(rechargeScore.toFixed(1)),
      weightPct: Number(wRech.toFixed(1)),
      weightedContribution: Number(((rechargeScore * wRech) / 100).toFixed(1)),
      explanation: `${location.aquiferType} exhibits ${location.rechargePotentialScore >= 60 ? 'favorable' : 'constrained'} natural percolation capacity.`,
    },
  ];

  const overallScore = Number(
    clamp(factors.reduce((sum, f) => sum + f.weightedContribution, 0)).toFixed(1),
  );
  const riskCategory = classifyRisk(overallScore);

  const topDriver = [...factors].sort((a, b) => b.weightedContribution - a.weightedContribution)[0];
  const explanation = `${location.name} scores ${overallScore}/100 (${riskCategory} Risk). The primary contributor is ${topDriver.label} (${topDriver.weightedContribution} pts), alongside ${
    depletionRateMPerYear > 0
      ? `an estimated ${depletionRateMPerYear.toFixed(2)} m/yr water-table decline`
      : 'stable seasonal depth fluctuations'
  } and ${rainfallAnomalyPct < 0 ? `${Math.abs(rainfallAnomalyPct).toFixed(1)}% rainfall deficit` : `${rainfallAnomalyPct.toFixed(1)}% rainfall surplus`} relative to normal.`;

  const confidenceNote =
    missingCount > 0
      ? `${missingCount} of ${expectedReadings} monthly observations are missing in this window. Missing values are preserved as gaps and excluded from trend regression rather than fabricated.`
      : `All ${expectedReadings} expected monthly observations are present with valid depth and rainfall figures.`;

  return {
    locationId: location.id,
    locationName: location.name,
    sourceType: location.sourceType,
    sourceNote: location.sourceNote,
    overallScore,
    riskCategory,
    currentDepthM: latestDepth,
    depletionRateMPerYear,
    annualRainfallMm: annualizedRainMm,
    rainfallAnomalyPct,
    factors,
    explanation,
    confidence: {
      completenessPct,
      level: confidenceLevel,
      validReadings: validBoth.length,
      expectedReadings,
      missingCount,
      note: confidenceNote,
    },
    methodologyNote:
      'Water Stress Index = weighted sum of 5 normalized 0–100 sub-indices (Availability, Depletion Rate, Rainfall Deficit, Demand Pressure, Recharge Deficit). Missing observations are excluded from regression and flagged in Data Confidence.',
  };
}

export function buildConservationRecommendations(
  location: WaterLocation,
  stress: WaterStressResult,
): ConservationRecommendation[] {
  const isCriticalOrHigh = stress.riskCategory === 'Critical' || stress.riskCategory === 'High';
  const isAgriHeavy = location.agriculturalSharePct >= 60;
  const isHardRockOrBasalt =
    location.aquiferType.toLowerCase().includes('hard-rock') ||
    location.aquiferType.toLowerCase().includes('granite') ||
    location.aquiferType.toLowerCase().includes('basalt');

  return [
    {
      id: `${location.id}-agri`,
      category: 'Agriculture',
      problemIdentified: isAgriHeavy
        ? `High agricultural extraction share (${location.agriculturalSharePct}%) accelerates seasonal drawdown during pre-monsoon months.`
        : `Peri-urban agricultural pumping competes with municipal groundwater supply during dry spells.`,
      suggestedAction:
        'Transition water-intensive summer crops toward less water-demanding pulses/millets and adopt laser land leveling with scheduled irrigation windows.',
      priority: isAgriHeavy && isCriticalOrHigh ? 'Critical' : isAgriHeavy ? 'High' : 'Medium',
      expectedBenefit:
        'Reduces peak dry-season abstraction stress on shallow and semi-confined aquifer zones while stabilizing soil moisture.',
      reason: `Agricultural demand accounts for ${location.agriculturalSharePct}% of local withdrawal pressure in ${location.basin}.`,
      applicableAquifer: location.aquiferType,
    },
    {
      id: `${location.id}-irrigation`,
      category: 'Efficient Irrigation',
      problemIdentified:
        'Conventional flood irrigation loses significant water to surface evaporation and unproductive runoff before reaching root zones.',
      suggestedAction:
        'Deploy pressurized drip and micro-sprinkler networks paired with low-cost soil moisture tensiometers for high-value horticulture and row crops.',
      priority: isAgriHeavy ? 'High' : 'Medium',
      expectedBenefit:
        'Improves field-level application uniformity and curbs unnecessary borewell pumping hours.',
      reason: `With a ${stress.depletionRateMPerYear.toFixed(2)} m/yr depletion trend, lowering pumping duration directly slows drawdown.`,
      applicableAquifer: location.aquiferType,
    },
    {
      id: `${location.id}-rwh`,
      category: 'Rainwater Harvesting',
      problemIdentified:
        location.demandPressureScore >= 70
          ? 'Impervious urban and institutional surfaces convert intense monsoon bursts into storm runoff rather than usable storage.'
          : 'Seasonal rainfall arrives in concentrated 3–4 month monsoon pulses with minimal local capture.',
      suggestedAction:
        'Mandate rooftop rainwater harvesting with first-flush diverters and silt-trap filtration chambers across public buildings, apartments, and industrial parks.',
      priority: isCriticalOrHigh ? 'Critical' : 'High',
      expectedBenefit:
        'Captures clean monsoon runoff on-site to offset municipal supply demand and replenish local shallow wells.',
      reason: `Annualized rainfall is ${stress.annualRainfallMm.toFixed(0)} mm/yr; capturing peak storm events relieves reliance on deep aquifers.`,
      applicableAquifer: location.aquiferType,
    },
    {
      id: `${location.id}-recharge`,
      category: 'Groundwater Recharge',
      problemIdentified: isHardRockOrBasalt
        ? `${location.aquiferType} has low primary porosity, limiting natural percolation velocity during brief heavy rainfall.`
        : 'Rapid extraction outpaces natural vertical infiltration across alluvial strata.',
      suggestedAction: isHardRockOrBasalt
        ? 'Construct contour bunds, check dams along first-order streams, and fracture-targeted recharge shafts with desilting basins.'
        : 'Install managed aquifer recharge (MAR) percolation ponds and injection recharge wells near seasonal drainage channels.',
      priority: location.rechargePotentialScore < 45 ? 'Critical' : 'High',
      expectedBenefit:
        'Enhances hydraulic head recovery post-monsoon and mitigates long-term water table decline.',
      reason: `Aquifer recharge potential is rated ${location.rechargePotentialScore}/100 for ${location.aquiferType}.`,
      applicableAquifer: location.aquiferType,
    },
    {
      id: `${location.id}-households`,
      category: 'Households',
      problemIdentified:
        'Unmetered domestic water usage and unaddressed distribution leaks contribute to avoidable baseline urban extraction.',
      suggestedAction:
        'Install low-flow aerators, dual-flush cisterns, greywater recycling for landscaping, and sub-metered leak alerts in multi-unit housing.',
      priority: location.populationServed > 1000000 ? 'High' : 'Medium',
      expectedBenefit:
        'Lowers per-capita daily freshwater withdrawal and dampens summer peak municipal water stress.',
      reason: `Serves an estimated ${(location.populationServed / 100000).toFixed(1)} lakh residents in ${location.name} (${location.state}).`,
      applicableAquifer: location.aquiferType,
    },
    {
      id: `${location.id}-community`,
      category: 'Community-Level Conservation',
      problemIdentified:
        'Unmonitored borewell drilling and lack of shared village/ward water budgets lead to competitive pumping ("tragedy of the commons").',
      suggestedAction:
        'Establish community piezometer monitoring committees, publish seasonal groundwater budgets, and restore encroached village tanks and stepwells.',
      priority: isCriticalOrHigh ? 'High' : 'Preventive',
      expectedBenefit:
        'Builds transparent local accountability, protects shared recharge zones, and supports early drought-response triggers.',
      reason: `Current Water Stress Index is ${stress.overallScore}/100 (${stress.riskCategory}), warranting coordinated basin governance.`,
      applicableAquifer: location.aquiferType,
    },
  ];
}

export function buildDashboardOverview(
  locations: WaterLocation[],
  readingsByLocation: Map<number, WaterReading[]>,
  weights: StressWeights,
  selectedLocationId: number | null,
  range: DateRangeKey,
): DashboardOverviewResponse {
  const summaries: LocationSummary[] = locations.map((loc) => {
    const readings = readingsByLocation.get(loc.id) ?? [];
    const stress = computeWaterStress(loc, readings, weights, range);
    const recs = buildConservationRecommendations(loc, stress);
    return {
      location: loc,
      stress,
      conservationOpportunityCount: recs.filter(
        (r) => r.priority === 'Critical' || r.priority === 'High',
      ).length,
    };
  });

  const activeSummary =
    summaries.find((s) => s.location.id === selectedLocationId) ?? summaries[0];

  const activeReadings = filterReadingsByRange(
    readingsByLocation.get(activeSummary.location.id) ?? [],
    range,
  );

  const avgBaselineDepth =
    summaries.reduce((acc, s) => acc + (s.stress.currentDepthM ?? 0), 0) /
    Math.max(1, summaries.length);

  const trendSeries = activeReadings.map((r) => ({
    dateLabel: r.dateLabel,
    groundwaterDepthM: r.groundwaterDepthM,
    rainfallMm: r.rainfallMm,
    rechargeMm: r.rechargeMm,
    baselineDepthM: Number(avgBaselineDepth.toFixed(2)),
  }));

  const riskCounts: Record<RiskCategory, number> = {
    Low: 0,
    Moderate: 0,
    High: 0,
    Critical: 0,
  };
  for (const s of summaries) {
    riskCounts[s.stress.riskCategory] += 1;
  }

  const insights: DashboardInsight[] = [...summaries]
    .sort((a, b) => b.stress.overallScore - a.stress.overallScore)
    .slice(0, 5)
    .map((s) => {
      const severity: DashboardInsight['severity'] =
        s.stress.riskCategory === 'Critical'
          ? 'critical'
          : s.stress.riskCategory === 'High'
            ? 'warning'
            : 'info';
      const missingNote =
        s.stress.confidence.missingCount > 0
          ? ` (${s.stress.confidence.missingCount} missing month(s) flagged)`
          : '';
      return {
        id: `insight-${s.location.id}`,
        severity,
        locationId: s.location.id,
        locationName: s.location.name,
        title:
          s.stress.riskCategory === 'Critical'
            ? `Critical groundwater stress detected in ${s.location.name}`
            : s.stress.riskCategory === 'High'
              ? `Elevated drawdown pressure in ${s.location.name}`
              : `${s.location.name} remains within ${s.stress.riskCategory.toLowerCase()} threshold`,
        detail: `${s.stress.explanation}${missingNote}`,
        metricTag: `${s.stress.overallScore}/100 · ${s.stress.depletionRateMPerYear.toFixed(2)} m/yr`,
      };
    });

  const highRiskCount = summaries.filter(
    (s) => s.stress.riskCategory === 'High' || s.stress.riskCategory === 'Critical',
  ).length;

  const totalConservationOps = summaries.reduce(
    (acc, s) => acc + s.conservationOpportunityCount,
    0,
  );

  return {
    range,
    selectedLocationId: activeSummary.location.id,
    weights,
    kpis: {
      totalMonitoredLocations: summaries.length,
      currentWaterStressIndex: activeSummary.stress.overallScore,
      currentRiskCategory: activeSummary.stress.riskCategory,
      groundwaterLevelM: activeSummary.stress.currentDepthM,
      depletionTrendMPerYear: activeSummary.stress.depletionRateMPerYear,
      rainfallTrendPct: activeSummary.stress.rainfallAnomalyPct,
      highRiskLocationsCount: highRiskCount,
      conservationOpportunitiesCount: totalConservationOps,
    },
    locations: summaries,
    trendSeries,
    stressDistribution: [...summaries]
      .sort((a, b) => b.stress.overallScore - a.stress.overallScore)
      .map((s) => ({
        name: s.location.name.replace(' Basin', '').replace(' Corridor', ''),
        score: s.stress.overallScore,
        riskCategory: s.stress.riskCategory,
        sourceType: s.location.sourceType,
      })),
    riskBreakdown: (['Critical', 'High', 'Moderate', 'Low'] as RiskCategory[]).map(
      (category) => ({
        category,
        count: riskCounts[category],
      }),
    ),
    insights,
  };
}

export function buildGroundwaterAnalytics(
  location: WaterLocation,
  readings: WaterReading[],
  allLocations: WaterLocation[],
  readingsByLocation: Map<number, WaterReading[]>,
  weights: StressWeights,
): GroundwaterAnalyticsResponse {
  const stress = computeWaterStress(location, readings, weights, 'all');

  // Yearly grouping
  const byYear = new Map<number, WaterReading[]>();
  for (const r of readings) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r);
  }
  const yearlySeries: YearlySummaryPoint[] = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => {
      const validD = list.filter((r) => r.groundwaterDepthM !== null);
      const validR = list.filter((r) => r.rainfallMm !== null);
      const validRech = list.filter((r) => r.rechargeMm !== null);
      return {
        year,
        avgDepthM:
          validD.length > 0
            ? Number(
                (validD.reduce((s, r) => s + (r.groundwaterDepthM ?? 0), 0) / validD.length).toFixed(2),
              )
            : null,
        totalRainfallMm: Number(
          validR.reduce((s, r) => s + (r.rainfallMm ?? 0), 0).toFixed(1),
        ),
        avgRechargeMm:
          validRech.length > 0
            ? Number(
                (validRech.reduce((s, r) => s + (r.rechargeMm ?? 0), 0) / validRech.length).toFixed(1),
              )
            : null,
        validMonths: validD.length,
      };
    });

  // Seasonal grouping (Indian hydrological seasons)
  const seasons: Array<{
    season: SeasonalSummaryPoint['season'];
    months: number[];
  }> = [
    { season: 'Winter (Jan-Feb)', months: [1, 2] },
    { season: 'Pre-Monsoon (Mar-May)', months: [3, 4, 5] },
    { season: 'Monsoon (Jun-Sep)', months: [6, 7, 8, 9] },
    { season: 'Post-Monsoon (Oct-Dec)', months: [10, 11, 12] },
  ];

  const seasonalBreakdown: SeasonalSummaryPoint[] = seasons.map((s) => {
    const sub = readings.filter((r) => s.months.includes(r.month));
    const validD = sub.filter((r) => r.groundwaterDepthM !== null);
    const validR = sub.filter((r) => r.rainfallMm !== null);
    return {
      season: s.season,
      avgDepthM:
        validD.length > 0
          ? Number(
              (validD.reduce((acc, r) => acc + (r.groundwaterDepthM ?? 0), 0) / validD.length).toFixed(2),
            )
          : null,
      avgRainfallMm:
        validR.length > 0
          ? Number(
              (validR.reduce((acc, r) => acc + (r.rainfallMm ?? 0), 0) / validR.length).toFixed(1),
            )
          : null,
      readingCount: validD.length,
    };
  });

  const comparisonLocations = allLocations.map((loc) => {
    const locReadings = readingsByLocation.get(loc.id) ?? [];
    const locStress = computeWaterStress(loc, locReadings, weights, 'all');
    return {
      locationId: loc.id,
      name: loc.name,
      state: loc.state,
      aquiferType: loc.aquiferType,
      sourceType: loc.sourceType,
      latestDepthM: locStress.currentDepthM,
      depletionRateMPerYear: locStress.depletionRateMPerYear,
      avgAnnualRainfallMm: locStress.annualRainfallMm,
      stressScore: locStress.overallScore,
      riskCategory: locStress.riskCategory,
      completenessPct: locStress.confidence.completenessPct,
    };
  });

  return {
    location,
    stress,
    monthlySeries: readings,
    yearlySeries,
    seasonalBreakdown,
    comparisonLocations,
  };
}

export function runScenarioSimulation(
  location: WaterLocation,
  readings: WaterReading[],
  weights: StressWeights,
  req: ScenarioRequest,
): ScenarioResponse {
  const currentStress = computeWaterStress(location, readings, weights, 'all');
  const startDepth = currentStress.currentDepthM ?? 15;
  const baseAnnualRate = currentStress.depletionRateMPerYear;

  const latestReading = readings[readings.length - 1];
  let curYear = latestReading?.year ?? 2026;
  let curMonth = latestReading?.month ?? 11;

  // Sensitivity coefficients (heuristic simplified water-balance approximations)
  const rainEffectAnnualM = -(req.rainfallVariationPct / 100) * 0.65;
  const consumptionEffectAnnualM = (req.consumptionVariationPct / 100) * 0.72;
  const rechargeEffectAnnualM = -(req.rechargeBoostPct / 100) * 0.55;

  const userAdjustedAnnualRate =
    baseAnnualRate + rainEffectAnnualM + consumptionEffectAnnualM + rechargeEffectAnnualM;

  // 3 distinct trajectories:
  // Optimistic: combines user-favorable adjustments + managed conservation rebound
  const optimisticRate = Math.min(
    userAdjustedAnnualRate - 0.32,
    baseAnnualRate * 0.45 + Math.min(0, rainEffectAnnualM) + rechargeEffectAnnualM - 0.25,
  );
  // Baseline: status quo historical slope
  const baselineRate = baseAnnualRate;
  // High Stress: user stress inputs or adverse compound (+18% demand / -20% rainfall)
  const highStressRate = Math.max(
    userAdjustedAnnualRate + 0.28,
    baseAnnualRate + 0.48 + Math.max(0, consumptionEffectAnnualM) + Math.max(0, rainEffectAnnualM),
  );

  const series: ScenarioPoint[] = [];
  const seasonalWave = [0.05, 0.2, 0.45, 0.75, 1.0, 0.8, 0.1, -0.55, -0.85, -0.7, -0.35, -0.1];

  for (let i = 1; i <= req.horizonMonths; i++) {
    curMonth += 1;
    if (curMonth > 12) {
      curMonth = 1;
      curYear += 1;
    }
    const years = i / 12;
    const seasonAdj = seasonalWave[curMonth - 1] * 0.55;

    series.push({
      monthOffset: i,
      dateLabel: `${curYear}-${String(curMonth).padStart(2, '0')}`,
      optimisticDepthM: Number(Math.max(1.5, startDepth + optimisticRate * years + seasonAdj * 0.75).toFixed(2)),
      baselineDepthM: Number(Math.max(1.5, startDepth + baselineRate * years + seasonAdj).toFixed(2)),
      highStressDepthM: Number(Math.max(1.5, startDepth + highStressRate * years + seasonAdj * 1.15).toFixed(2)),
    });
  }

  const endPt = series[series.length - 1];

  const estimateFutureStress = (endDepth: number, annualRate: number, rainDelta: number, demandDelta: number): number => {
    const depthDeltaScore = ((endDepth - startDepth) / 4) * 14;
    const rateDeltaScore = ((annualRate - baseAnnualRate) / 1.0) * 10;
    const rainStressDelta = (-rainDelta / 25) * 6;
    const demandStressDelta = (demandDelta / 25) * 6;
    return Number(
      clamp(
        currentStress.overallScore +
          depthDeltaScore +
          rateDeltaScore +
          rainStressDelta +
          demandStressDelta,
      ).toFixed(1),
    );
  };

  const buildOutcome = (
    name: ScenarioOutcome['name'],
    endDepth: number,
    rate: number,
    rainDelta: number,
    demandDelta: number,
  ): ScenarioOutcome => {
    const futureScore = estimateFutureStress(endDepth, rate, rainDelta, demandDelta);
    const futureRisk = classifyRisk(futureScore);
    const delta = Number((futureScore - currentStress.overallScore).toFixed(1));
    const sign = delta > 0 ? '+' : '';
    const riskChange =
      futureRisk === currentStress.riskCategory
        ? `Remains ${futureRisk} (${sign}${delta} pts)`
        : `${currentStress.riskCategory} -> ${futureRisk} (${sign}${delta} pts)`;

    return {
      name,
      projectedEndDepthM: endDepth,
      netDepthChangeM: Number((endDepth - startDepth).toFixed(2)),
      estimatedStressScore: futureScore,
      estimatedRiskCategory: futureRisk,
      riskChange,
    };
  };

  const outcomes: ScenarioOutcome[] = [
    buildOutcome(
      'Optimistic',
      endPt.optimisticDepthM,
      optimisticRate,
      Math.max(req.rainfallVariationPct, 10),
      Math.min(req.consumptionVariationPct, -10),
    ),
    buildOutcome('Baseline', endPt.baselineDepthM, baselineRate, 0, 0),
    buildOutcome(
      'High Stress',
      endPt.highStressDepthM,
      highStressRate,
      Math.min(req.rainfallVariationPct, -20),
      Math.max(req.consumptionVariationPct, 15),
    ),
  ];

  const preventiveActions: string[] = [];
  if (req.rainfallVariationPct < 0 || currentStress.rainfallAnomalyPct < -5) {
    preventiveActions.push(
      'Activate dry-spell irrigation scheduling and prioritize rooftop & check-dam rainwater capture before monsoon onset.',
    );
  }
  if (req.consumptionVariationPct > 0 || location.demandPressureScore >= 70) {
    preventiveActions.push(
      'Cap new high-capacity borewell abstractions and accelerate drip/micro-irrigation transitions in high-share agricultural blocks.',
    );
  }
  if (req.rechargeBoostPct < 20) {
    preventiveActions.push(
      `Scale managed aquifer recharge structures tailored to ${location.aquiferType} to offset baseline extraction.`,
    );
  }
  preventiveActions.push(
    'Maintain monthly piezometer depth audits so scenario trajectories can be recalibrated against observed seasonal recovery.',
  );

  return {
    location,
    currentStress,
    parameters: req,
    series,
    outcomes,
    preventiveActions,
    disclaimer:
      'Scenario Estimate Notice: Outputs represent exploratory what-if sensitivity trajectories derived from historical linear trends and simplified water-balance coefficients — NOT scientifically validated hydrogeological forecasts.',
    assumptions: [
      `Baseline slope (${baseAnnualRate.toFixed(2)} m/yr) assumes recent multi-year extraction behavior continues unchanged.`,
      `Rainfall sensitivity assumes linear recharge coupling scaled by ${location.aquiferType} percolation potential.`,
      'Seasonal oscillation follows historical 12-month monsoon/pre-monsoon amplitude observed at this station.',
    ],
    limitations: [
      'Does not simulate 3D groundwater flow boundaries, inter-aquifer leakage, or abrupt policy/reservoir releases.',
      'Extreme weather shocks or sudden industrial/agricultural land-use shifts can diverge substantially from linear approximations.',
    ],
  };
}

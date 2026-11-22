export type DataSourceType = 'simulated_demo' | 'user_uploaded';

export type RiskCategory = 'Low' | 'Moderate' | 'High' | 'Critical';

export type DateRangeKey = '6m' | '1y' | '2y' | '3y' | 'all';

export interface StressWeights {
  availability: number;
  depletion: number;
  rainfallDeficit: number;
  demand: number;
  recharge: number;
}

export interface WaterLocation {
  id: number;
  name: string;
  state: string;
  basin: string;
  aquiferType: string;
  latitude: number;
  longitude: number;
  sourceType: DataSourceType;
  sourceNote: string;
  populationServed: number;
  agriculturalSharePct: number;
  rechargePotentialScore: number; // 0-100 (higher = better natural recharge potential)
  demandPressureScore: number; // 0-100 (higher = higher demand stress)
  expectedAnnualRainfallMm: number;
  datasetId: number | null;
  createdAt: string;
}

export interface WaterReading {
  id: number;
  locationId: number;
  year: number;
  month: number;
  dateLabel: string; // YYYY-MM
  groundwaterDepthM: number | null; // meters below ground level (m bgl); higher = deeper/more depleted
  rainfallMm: number | null;
  extractionIndex: number | null; // 0-100 relative extraction pressure
  rechargeMm: number | null;
  sourceType: DataSourceType;
  isMissing: boolean;
}

export interface StressFactorContribution {
  key: keyof StressWeights;
  label: string;
  rawMetric: string;
  normalizedScore: number; // 0-100
  weightPct: number; // 0-100
  weightedContribution: number; // points added to 0-100 score
  explanation: string;
}

export interface DataConfidenceInfo {
  completenessPct: number;
  level: 'High' | 'Moderate' | 'Limited';
  validReadings: number;
  expectedReadings: number;
  missingCount: number;
  note: string;
}

export interface WaterStressResult {
  locationId: number;
  locationName: string;
  sourceType: DataSourceType;
  sourceNote: string;
  overallScore: number; // 0-100
  riskCategory: RiskCategory;
  currentDepthM: number | null;
  depletionRateMPerYear: number; // positive = water table falling (depth increasing)
  annualRainfallMm: number;
  rainfallAnomalyPct: number;
  factors: StressFactorContribution[];
  explanation: string;
  confidence: DataConfidenceInfo;
  methodologyNote: string;
}

export interface LocationSummary {
  location: WaterLocation;
  stress: WaterStressResult;
  conservationOpportunityCount: number;
}

export interface DashboardInsight {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  locationId: number;
  locationName: string;
  title: string;
  detail: string;
  metricTag: string;
}

export interface DashboardOverviewResponse {
  range: DateRangeKey;
  selectedLocationId: number | null;
  weights: StressWeights;
  kpis: {
    totalMonitoredLocations: number;
    currentWaterStressIndex: number;
    currentRiskCategory: RiskCategory;
    groundwaterLevelM: number | null;
    depletionTrendMPerYear: number;
    rainfallTrendPct: number;
    highRiskLocationsCount: number;
    conservationOpportunitiesCount: number;
  };
  locations: LocationSummary[];
  trendSeries: Array<{
    dateLabel: string;
    groundwaterDepthM: number | null;
    rainfallMm: number | null;
    rechargeMm: number | null;
    baselineDepthM: number | null;
  }>;
  stressDistribution: Array<{
    name: string;
    score: number;
    riskCategory: RiskCategory;
    sourceType: DataSourceType;
  }>;
  riskBreakdown: Array<{
    category: RiskCategory;
    count: number;
  }>;
  insights: DashboardInsight[];
}

export interface SeasonalSummaryPoint {
  season: 'Winter (Jan-Feb)' | 'Pre-Monsoon (Mar-May)' | 'Monsoon (Jun-Sep)' | 'Post-Monsoon (Oct-Dec)';
  avgDepthM: number | null;
  avgRainfallMm: number | null;
  readingCount: number;
}

export interface YearlySummaryPoint {
  year: number;
  avgDepthM: number | null;
  totalRainfallMm: number;
  avgRechargeMm: number | null;
  validMonths: number;
}

export interface GroundwaterAnalyticsResponse {
  location: WaterLocation;
  stress: WaterStressResult;
  monthlySeries: WaterReading[];
  yearlySeries: YearlySummaryPoint[];
  seasonalBreakdown: SeasonalSummaryPoint[];
  comparisonLocations: Array<{
    locationId: number;
    name: string;
    state: string;
    aquiferType: string;
    sourceType: DataSourceType;
    latestDepthM: number | null;
    depletionRateMPerYear: number;
    avgAnnualRainfallMm: number;
    stressScore: number;
    riskCategory: RiskCategory;
    completenessPct: number;
  }>;
}

export interface ScenarioRequest {
  locationId: number;
  rainfallVariationPct: number; // -50 to +50
  consumptionVariationPct: number; // -40 to +40
  rechargeBoostPct: number; // 0 to +60
  horizonMonths: number; // 6, 12, 24, 36
}

export interface ScenarioPoint {
  monthOffset: number;
  dateLabel: string;
  optimisticDepthM: number;
  baselineDepthM: number;
  highStressDepthM: number;
}

export interface ScenarioOutcome {
  name: 'Optimistic' | 'Baseline' | 'High Stress';
  projectedEndDepthM: number;
  netDepthChangeM: number;
  estimatedStressScore: number;
  estimatedRiskCategory: RiskCategory;
  riskChange: string;
}

export interface ScenarioResponse {
  location: WaterLocation;
  currentStress: WaterStressResult;
  parameters: ScenarioRequest;
  series: ScenarioPoint[];
  outcomes: ScenarioOutcome[];
  preventiveActions: string[];
  disclaimer: string;
  assumptions: string[];
  limitations: string[];
}

export type ConservationCategory =
  | 'Agriculture'
  | 'Households'
  | 'Rainwater Harvesting'
  | 'Groundwater Recharge'
  | 'Efficient Irrigation'
  | 'Community-Level Conservation';

export interface ConservationRecommendation {
  id: string;
  category: ConservationCategory;
  problemIdentified: string;
  suggestedAction: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Preventive';
  expectedBenefit: string;
  reason: string;
  applicableAquifer: string;
}

export interface ConservationResponse {
  location: WaterLocation;
  stress: WaterStressResult;
  recommendations: ConservationRecommendation[];
}

export interface DatasetRecord {
  id: number;
  filename: string;
  uploadedAt: string;
  rowCount: number;
  validRows: number;
  missingRows: number;
  invalidRows: number;
  locationCount: number;
  validationIssues: string[];
}

export interface CsvUploadResponse {
  dataset: DatasetRecord;
  importedLocationIds: number[];
  previewRows: Array<{
    rowNumber: number;
    locationName: string;
    year: number | string;
    month: number | string;
    groundwaterDepthM: number | null;
    rainfallMm: number | null;
    status: 'valid' | 'missing_values' | 'invalid';
    issue?: string;
  }>;
  message: string;
}

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotResponse {
  reply: string;
  mode: 'gemini' | 'fallback';
  modelUsed: string;
  contextLocationName: string;
  dataSourceNote: string;
  errorNotice?: string;
}

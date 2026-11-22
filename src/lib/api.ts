import type {
  ConservationResponse,
  CopilotMessage,
  CopilotResponse,
  CsvUploadResponse,
  DashboardOverviewResponse,
  DatasetRecord,
  DateRangeKey,
  GroundwaterAnalyticsResponse,
  LocationSummary,
  RiskCategory,
  ScenarioRequest,
  ScenarioResponse,
  StressWeights,
  WaterLocation,
  WaterStressResult,
} from '../types/water';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) message = errBody.error;
    } catch {
      // ignore non-json error body
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  getOverview(locationId: number | null, range: DateRangeKey): Promise<DashboardOverviewResponse> {
    const params = new URLSearchParams({ range });
    if (locationId) params.set('locationId', String(locationId));
    return fetchJson(`/api/dashboard/overview?${params.toString()}`);
  },

  getLocations(): Promise<{ locations: LocationSummary[]; weights: StressWeights }> {
    return fetchJson('/api/locations');
  },

  getStress(
    locationId: number,
    range: DateRangeKey = 'all',
  ): Promise<{ location: WaterLocation; weights: StressWeights; stress: WaterStressResult }> {
    return fetchJson(`/api/stress?locationId=${locationId}&range=${range}`);
  },

  updateWeights(weights: StressWeights): Promise<{ weights: StressWeights }> {
    return fetchJson('/api/stress/weights', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weights),
    });
  },

  getAnalytics(locationId: number): Promise<GroundwaterAnalyticsResponse> {
    return fetchJson(`/api/analytics?locationId=${locationId}`);
  },

  runScenario(payload: ScenarioRequest): Promise<ScenarioResponse> {
    return fetchJson('/api/scenarios/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getConservation(locationId: number): Promise<ConservationResponse> {
    return fetchJson(`/api/conservation?locationId=${locationId}`);
  },

  askCopilot(payload: {
    question: string;
    locationId: number;
    compareLocationId?: number | null;
    history: CopilotMessage[];
  }): Promise<CopilotResponse> {
    return fetchJson('/api/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getDatasets(): Promise<{ datasets: DatasetRecord[] }> {
    return fetchJson('/api/datasets');
  },

  uploadCsv(filename: string, csvText: string): Promise<CsvUploadResponse> {
    return fetchJson('/api/datasets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, csvText }),
    });
  },

  getPdfReportUrl(locationId: number, horizon = 12): string {
    return `/api/reports/pdf?locationId=${locationId}&horizon=${horizon}`;
  },

  getCsvExportUrl(locationId: number): string {
    return `/api/datasets/export?locationId=${locationId}`;
  },

  getCsvTemplateUrl(): string {
    return '/api/datasets/template';
  },
};

export function riskTextColor(risk: RiskCategory): string {
  switch (risk) {
    case 'Critical':
      return 'text-[#DC2626]';
    case 'High':
      return 'text-[#EA580C]';
    case 'Moderate':
      return 'text-[#D97706]';
    case 'Low':
      return 'text-[#0D9488]';
  }
}

export function riskHexColor(risk: RiskCategory): string {
  switch (risk) {
    case 'Critical':
      return '#DC2626';
    case 'High':
      return '#EA580C';
    case 'Moderate':
      return '#D97706';
    case 'Low':
      return '#0D9488';
  }
}

export function formatSourceLabel(sourceType: 'simulated_demo' | 'user_uploaded'): string {
  return sourceType === 'user_uploaded' ? 'User-Uploaded Data' : 'Simulated Demo Data';
}

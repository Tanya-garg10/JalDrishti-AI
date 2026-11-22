import React, { useCallback, useEffect, useState } from 'react';
import type { DashboardOverviewResponse, DateRangeKey } from './types/water';
import { api } from './lib/api';
import { LayoutShell, type NavPageId } from './components/LayoutShell';
import { OverviewView } from './views/OverviewView';
import { WaterRiskView } from './views/WaterRiskView';
import { AnalyticsView } from './views/AnalyticsView';
import { PredictiveEngineView } from './views/PredictiveEngineView';
import { ConservationView } from './views/ConservationView';
import { InteractiveMapView } from './views/InteractiveMapView';
import { CopilotView } from './views/CopilotView';
import { ReportsDataView } from './views/ReportsDataView';
import { MethodologyView } from './views/MethodologyView';

export default function App() {
  const [activePage, setActivePage] = useState<NavPageId>('overview');
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [range, setRange] = useState<DateRangeKey>('all');
  const [overviewData, setOverviewData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(
    async (locId: number | null, dateRange: DateRangeKey) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getOverview(locId, dateRange);
        setOverviewData(res);
        if (locId === null && res.selectedLocationId) {
          setSelectedLocationId(res.selectedLocationId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load water intelligence data.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadOverview(selectedLocationId, range);
  }, [selectedLocationId, range, loadOverview]);

  const effectiveLocationId =
    selectedLocationId ?? overviewData?.selectedLocationId ?? overviewData?.locations[0]?.location.id ?? 1;

  const locations = overviewData?.locations ?? [];

  return (
    <LayoutShell
      activePage={activePage}
      onNavigate={setActivePage}
      locations={locations}
      selectedLocationId={effectiveLocationId}
      onSelectLocation={(id) => setSelectedLocationId(id)}
      pdfUrl={api.getPdfReportUrl(effectiveLocationId, 12)}
    >
      {error && (
        <div className="mb-6 p-4 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-xl text-sm text-[#DC2626]">
          {error}
        </div>
      )}

      {activePage === 'overview' && (
        <OverviewView
          data={overviewData}
          loading={loading}
          range={range}
          onChangeRange={setRange}
          onSelectLocation={(id) => setSelectedLocationId(id)}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'risk' && (
        <WaterRiskView
          locationId={effectiveLocationId}
          onWeightsUpdated={() => void loadOverview(effectiveLocationId, range)}
        />
      )}

      {activePage === 'analytics' && (
        <AnalyticsView
          locationId={effectiveLocationId}
          onSelectLocation={(id) => setSelectedLocationId(id)}
        />
      )}

      {activePage === 'predictive' && <PredictiveEngineView locationId={effectiveLocationId} />}

      {activePage === 'conservation' && <ConservationView locationId={effectiveLocationId} />}

      {activePage === 'map' && (
        <InteractiveMapView
          locations={locations}
          selectedLocationId={effectiveLocationId}
          onSelectLocation={(id) => setSelectedLocationId(id)}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'copilot' && (
        <CopilotView locations={locations} selectedLocationId={effectiveLocationId} />
      )}

      {activePage === 'reports' && (
        <ReportsDataView
          locations={locations}
          selectedLocationId={effectiveLocationId}
          onDatasetImported={(newLocId) => {
            const targetId = newLocId ?? effectiveLocationId;
            setSelectedLocationId(targetId);
            void loadOverview(targetId, range);
          }}
        />
      )}

      {activePage === 'methodology' && <MethodologyView />}
    </LayoutShell>
  );
}

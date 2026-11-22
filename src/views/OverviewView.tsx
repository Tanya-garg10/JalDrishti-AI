import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ArrowRight, Info, ShieldAlert } from 'lucide-react';
import type { DashboardOverviewResponse, DateRangeKey } from '../types/water';
import { formatSourceLabel, riskHexColor, riskTextColor } from '../lib/api';
import type { NavPageId } from '../components/LayoutShell';

interface OverviewViewProps {
  data: DashboardOverviewResponse | null;
  loading: boolean;
  range: DateRangeKey;
  onChangeRange: (range: DateRangeKey) => void;
  onSelectLocation: (id: number) => void;
  onNavigate: (page: NavPageId) => void;
}

const RANGE_OPTIONS: Array<{ key: DateRangeKey; label: string }> = [
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
  { key: '3y', label: '3Y' },
  { key: 'all', label: 'All' },
];

export function OverviewView({
  data,
  loading,
  range,
  onChangeRange,
  onSelectLocation,
  onNavigate,
}: OverviewViewProps) {
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
      </div>
    );
  }

  const activeSummary =
    data.locations.find((l) => l.location.id === data.selectedLocationId) ?? data.locations[0];

  return (
    <div className="space-y-8">
      {/* Executive Header Strip */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="text-xs font-medium text-[#0F766E]">
            Hydrological Executive Overview · {formatSourceLabel(activeSummary.location.sourceType)}
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1F3A] text-balance">
            {activeSummary.location.name}
          </h1>
          <p className="mt-1.5 text-sm text-[#334E68] max-w-2xl">
            {activeSummary.location.state} · {activeSummary.location.aquiferType} · Completeness{' '}
            <span className="font-mono tabular-nums font-medium text-[#0B1F3A]">
              {activeSummary.stress.confidence.completenessPct}%
            </span>
          </p>
        </div>

        {/* Date-Range Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-[#F2EFE9] rounded-lg self-start lg:self-auto">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChangeRange(opt.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                range === opt.key
                  ? 'bg-white text-[#0B1F3A] shadow-sm'
                  : 'text-[#334E68] hover:text-[#0B1F3A]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Primary KPI Grid (All 7 required Overview metrics) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#627D98]">Current Water Stress Index</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
              {data.kpis.currentWaterStressIndex}
              <span className="text-sm font-normal text-[#627D98]">/100</span>
            </span>
            <span className={`text-xs font-semibold ${riskTextColor(data.kpis.currentRiskCategory)}`}>
              {data.kpis.currentRiskCategory} Risk
            </span>
          </div>
          <div className="mt-2 text-xs text-[#627D98]">
            Weighted 5-factor groundwater &amp; rainfall index
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#627D98]">Groundwater Level &amp; Depletion</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
              {data.kpis.groundwaterLevelM !== null ? data.kpis.groundwaterLevelM.toFixed(2) : 'N/A'}
              <span className="text-sm font-normal text-[#627D98] ml-1">m bgl</span>
            </span>
            <span
              className={`text-xs font-mono tabular-nums font-medium ${
                data.kpis.depletionTrendMPerYear > 0.5 ? 'text-[#DC2626]' : 'text-[#0D9488]'
              }`}
            >
              {data.kpis.depletionTrendMPerYear >= 0 ? '+' : ''}
              {data.kpis.depletionTrendMPerYear.toFixed(2)} m/yr
            </span>
          </div>
          <div className="mt-2 text-xs text-[#627D98]">
            Positive slope indicates falling water table
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#627D98]">Rainfall Trend (vs Normal)</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
              {data.kpis.rainfallTrendPct >= 0 ? '+' : ''}
              {data.kpis.rainfallTrendPct.toFixed(1)}%
            </span>
            <span className="text-xs font-mono tabular-nums text-[#334E68]">
              {activeSummary.stress.annualRainfallMm.toFixed(0)} mm/yr
            </span>
          </div>
          <div className="mt-2 text-xs text-[#627D98]">
            Compared to {activeSummary.location.expectedAnnualRainfallMm} mm benchmark
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#627D98]">Monitored Network Summary</div>
          <div className="mt-2 grid grid-cols-3 gap-2 pt-0.5">
            <div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {data.kpis.totalMonitoredLocations}
              </div>
              <div className="text-[11px] text-[#627D98]">Stations</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#EA580C]">
                {data.kpis.highRiskLocationsCount}
              </div>
              <div className="text-[11px] text-[#627D98]">High/Crit</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#0D9488]">
                {data.kpis.conservationOpportunitiesCount}
              </div>
              <div className="text-[11px] text-[#627D98]">Actions</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-[#627D98]">
            Priority conservation opportunities across stations
          </div>
        </div>
      </section>

      {/* Main Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Groundwater Trend Chart */}
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Groundwater Depth Trajectory (m bgl)
              </h2>
              <p className="text-xs text-[#627D98] mt-0.5">
                Higher values indicate deeper water tables · Dashed line shows network mean
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Deep Dive</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trendSeries} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#627D98' }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#627D98' }}
                  domain={['auto', 'auto']}
                  unit="m"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="groundwaterDepthM"
                  name="Water Depth (m bgl)"
                  stroke="#0D9488"
                  strokeWidth={2.2}
                  fill="url(#depthGrad)"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="baselineDepthM"
                  name="Network Mean (m bgl)"
                  stroke="#627D98"
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rainfall vs Groundwater Comparison */}
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Rainfall vs. Groundwater Level Comparison
              </h2>
              <p className="text-xs text-[#627D98] mt-0.5">
                Monthly precipitation (mm) overlaid with aquifer depth response (m bgl)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('predictive')}
              className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Simulate</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trendSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#627D98' }} minTickGap={24} />
                <YAxis yAxisId="rain" tick={{ fontSize: 11, fill: '#627D98' }} unit="mm" />
                <YAxis
                  yAxisId="depth"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#627D98' }}
                  unit="m"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  yAxisId="rain"
                  dataKey="rainfallMm"
                  name="Rainfall (mm)"
                  fill="#06B6D4"
                  opacity={0.75}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="depth"
                  type="monotone"
                  dataKey="groundwaterDepthM"
                  name="Depth (m bgl)"
                  stroke="#0B1F3A"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Stress Distribution & Risk Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Water Stress Distribution Across Monitored Locations
              </h2>
              <p className="text-xs text-[#627D98] mt-0.5">
                0–100 composite index · Click any location in the insights list to switch focus
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('risk')}
              className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Inspect Weights</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.stressDistribution}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#627D98' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={135}
                  tick={{ fontSize: 11, fill: '#0B1F3A' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="score" name="Stress Index" radius={[0, 4, 4, 0]}>
                  {data.stressDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={riskHexColor(entry.riskCategory)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Category Breakdown */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#0B1F3A]">Risk Category Breakdown</h2>
            <p className="text-xs text-[#627D98] mt-0.5">
              Distribution across {data.kpis.totalMonitoredLocations} monitored stations
            </p>
            <div className="mt-6 space-y-4">
              {data.riskBreakdown.map((item) => {
                const pct =
                  data.kpis.totalMonitoredLocations > 0
                    ? (item.count / data.kpis.totalMonitoredLocations) * 100
                    : 0;
                return (
                  <div key={item.category}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className={`font-semibold ${riskTextColor(item.category)}`}>
                        {item.category} Stress
                      </span>
                      <span className="font-mono tabular-nums text-[#0B1F3A]">
                        {item.count} station{item.count === 1 ? '' : 's'} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-[#F2EFE9] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: riskHexColor(item.category),
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
            <span className="text-[#627D98]">Need basin-specific actions?</span>
            <button
              type="button"
              onClick={() => onNavigate('conservation')}
              className="font-medium text-[#0D9488] hover:text-[#0F766E]"
            >
              Open Planner
            </button>
          </div>
        </div>
      </section>

      {/* Recent Insights & Alerts */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#0B1F3A]">Recent Insights &amp; Risk Alerts</h2>
            <p className="text-xs text-[#627D98]">
              Automated diagnostic summaries generated from SQLite water records
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('copilot')}
            className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] self-start sm:self-auto"
          >
            Ask AI Copilot about these alerts
          </button>
        </div>

        <div className="divide-y divide-[#E2E8F0]">
          {data.insights.map((insight) => {
            const Icon =
              insight.severity === 'critical'
                ? ShieldAlert
                : insight.severity === 'warning'
                  ? AlertTriangle
                  : Info;
            const iconColor =
              insight.severity === 'critical'
                ? 'text-[#DC2626]'
                : insight.severity === 'warning'
                  ? 'text-[#EA580C]'
                  : 'text-[#0D9488]';

            return (
              <div
                key={insight.id}
                className="py-4 first:pt-2 last:pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                  <div>
                    <div className="text-sm font-medium text-[#0B1F3A]">{insight.title}</div>
                    <p className="text-xs text-[#334E68] mt-1 leading-relaxed">{insight.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 pl-7 sm:pl-0">
                  <span className="text-xs font-mono tabular-nums text-[#627D98]">
                    {insight.metricTag}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectLocation(insight.locationId)}
                    className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] whitespace-nowrap"
                  >
                    Focus Station
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

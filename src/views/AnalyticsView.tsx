import React, { useEffect, useState } from 'react';
import {
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
import type { GroundwaterAnalyticsResponse } from '../types/water';
import { api, formatSourceLabel, riskHexColor, riskTextColor } from '../lib/api';

interface AnalyticsViewProps {
  locationId: number;
  onSelectLocation: (id: number) => void;
}

export function AnalyticsView({ locationId, onSelectLocation }: AnalyticsViewProps) {
  const [data, setData] = useState<GroundwaterAnalyticsResponse | null>(null);
  const [granularity, setGranularity] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getAnalytics(locationId)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load analytics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locationId]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-28 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
        <div className="h-80 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-xl text-sm text-[#DC2626]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="text-xs font-medium text-[#0F766E]">
            Groundwater Analytics · {formatSourceLabel(data.location.sourceType)}
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
            {data.location.name} — Multi-Year Hydrological Trends
          </h1>
          <p className="mt-1 text-sm text-[#334E68]">
            {data.location.aquiferType} · Linear depletion slope:{' '}
            <span className="font-mono tabular-nums font-semibold text-[#0B1F3A]">
              {data.stress.depletionRateMPerYear >= 0 ? '+' : ''}
              {data.stress.depletionRateMPerYear.toFixed(2)} m/year
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F2EFE9] rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setGranularity('monthly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              granularity === 'monthly' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-[#334E68]'
            }`}
          >
            Monthly Series
          </button>
          <button
            type="button"
            onClick={() => setGranularity('yearly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              granularity === 'yearly' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-[#334E68]'
            }`}
          >
            Yearly Aggregate
          </button>
        </div>
      </header>

      {/* Historical Depth & Rainfall Chart */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            {granularity === 'monthly'
              ? 'Monthly Groundwater Depth (m bgl) & Rainfall (mm)'
              : 'Annual Mean Groundwater Depth & Cumulative Rainfall'}
          </h2>
          <p className="text-xs text-[#627D98] mt-0.5">
            Missing monthly measurements appear as explicit breaks in the line rather than interpolated estimates.
          </p>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {granularity === 'monthly' ? (
              <ComposedChart
                data={data.monthlySeries}
                margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#627D98' }} minTickGap={28} />
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
                  opacity={0.7}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="depth"
                  type="monotone"
                  dataKey="groundwaterDepthM"
                  name="Groundwater Depth (m bgl)"
                  stroke="#0B1F3A"
                  strokeWidth={2.2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                />
              </ComposedChart>
            ) : (
              <ComposedChart
                data={data.yearlySeries}
                margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#627D98' }} />
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
                  dataKey="totalRainfallMm"
                  name="Total Rainfall (mm)"
                  fill="#06B6D4"
                  opacity={0.75}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="depth"
                  type="monotone"
                  dataKey="avgDepthM"
                  name="Mean Depth (m bgl)"
                  stroke="#0B1F3A"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* Seasonal Variation & Depletion Calculation */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Seasonal Hydrological Variation
          </h2>
          <p className="text-xs text-[#627D98] mt-0.5 mb-4">
            Average depth to water table (m bgl) vs. average monthly rainfall across Indian hydrological seasons
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data.seasonalBreakdown}
                margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="season" tick={{ fontSize: 11, fill: '#334E68' }} />
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
                  dataKey="avgRainfallMm"
                  name="Mean Monthly Rain (mm)"
                  fill="#0D9488"
                  opacity={0.75}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="depth"
                  type="monotone"
                  dataKey="avgDepthM"
                  name="Mean Depth (m bgl)"
                  stroke="#DC2626"
                  strokeWidth={2.2}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Depletion Rate Calculation Summary */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              Depletion Rate Calculation
            </h2>
            <p className="text-xs text-[#627D98] mt-0.5">
              Ordinary Least Squares (OLS) linear trend across non-missing monthly observations
            </p>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="p-4 bg-[#FAF9F5] border border-[#E2E8F0] rounded-lg">
                <div className="text-xs text-[#627D98]">Annualized Depletion</div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                  {data.stress.depletionRateMPerYear >= 0 ? '+' : ''}
                  {data.stress.depletionRateMPerYear.toFixed(2)} m/yr
                </div>
              </div>
              <div className="p-4 bg-[#FAF9F5] border border-[#E2E8F0] rounded-lg">
                <div className="text-xs text-[#627D98]">Latest Observed Depth</div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                  {data.stress.currentDepthM?.toFixed(2) ?? 'Missing'} m
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-[#334E68] leading-relaxed">
              Valid depth records analyzed:{' '}
              <span className="font-mono tabular-nums font-medium text-[#0B1F3A]">
                {data.stress.confidence.validReadings}/{data.stress.confidence.expectedReadings}
              </span>
              . Positive depletion slope denotes increasing depth below ground level (net storage loss); negative slope denotes recovery.
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-xs">
            {data.seasonalBreakdown.map((s) => (
              <div key={s.season} className="text-[#334E68]">
                <div className="font-medium text-[#0B1F3A]">{s.season.split(' ')[0]}</div>
                <div className="font-mono tabular-nums text-[#627D98]">
                  {s.avgDepthM !== null ? `${s.avgDepthM}m` : 'N/A'} · {s.avgRainfallMm ?? 0}mm
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Location-Wise Comparison Chart & Table */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Cross-Location Depletion &amp; Stress Comparison
          </h2>
          <p className="text-xs text-[#627D98] mt-0.5">
            Select any row to switch the active station across the entire workspace
          </p>
          <div className="h-56 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.comparisonLocations}
                margin={{ top: 6, right: 16, left: -12, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#334E68' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={48}
                />
                <YAxis tick={{ fontSize: 11, fill: '#627D98' }} unit=" m/yr" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="depletionRateMPerYear" name="Depletion Rate (m/yr)" radius={[4, 4, 0, 0]}>
                  {data.comparisonLocations.map((entry, idx) => (
                    <Cell key={idx} fill={riskHexColor(entry.riskCategory)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#FAF9F5] text-[11px] font-semibold text-[#627D98]">
                <th className="py-3 px-6">Location</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4 text-right">Latest Depth</th>
                <th className="py-3 px-4 text-right">Depletion Slope</th>
                <th className="py-3 px-4 text-right">Annual Rain</th>
                <th className="py-3 px-4 text-right">Stress Score</th>
                <th className="py-3 px-6 text-right">Completeness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {data.comparisonLocations.map((row) => {
                const isSelected = row.locationId === locationId;
                return (
                  <tr
                    key={row.locationId}
                    onClick={() => onSelectLocation(row.locationId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#0D9488]/8' : 'hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <td className="py-3 px-6">
                      <div className="font-medium text-[#0B1F3A]">{row.name}</div>
                      <div className="text-xs text-[#627D98]">
                        {row.state} · {row.aquiferType}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#334E68] whitespace-nowrap">
                      {formatSourceLabel(row.sourceType)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {row.latestDepthM !== null ? `${row.latestDepthM.toFixed(2)} m` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#334E68]">
                      {row.depletionRateMPerYear >= 0 ? '+' : ''}
                      {row.depletionRateMPerYear.toFixed(2)} m/yr
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#334E68]">
                      {row.avgAnnualRainfallMm.toFixed(0)} mm
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="font-mono tabular-nums font-semibold text-[#0B1F3A] mr-2">
                        {row.stressScore}
                      </span>
                      <span className={`text-xs font-semibold ${riskTextColor(row.riskCategory)}`}>
                        {row.riskCategory}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums text-xs text-[#627D98]">
                      {row.completenessPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

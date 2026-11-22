import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import type { StressWeights, WaterLocation, WaterStressResult } from '../types/water';
import { api, formatSourceLabel, riskHexColor, riskTextColor } from '../lib/api';

interface WaterRiskViewProps {
  locationId: number;
  onWeightsUpdated: () => void;
}

const DEFAULT_WEIGHTS: StressWeights = {
  availability: 25,
  depletion: 25,
  rainfallDeficit: 20,
  demand: 15,
  recharge: 15,
};

export function WaterRiskView({ locationId, onWeightsUpdated }: WaterRiskViewProps) {
  const [location, setLocation] = useState<WaterLocation | null>(null);
  const [stress, setStress] = useState<WaterStressResult | null>(null);
  const [weights, setWeights] = useState<StressWeights>(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStress = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getStress(locationId, 'all');
      setLocation(res.location);
      setStress(res.stress);
      setWeights(res.weights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load water stress monitor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStress();
  }, [locationId]);

  const weightSum =
    weights.availability +
    weights.depletion +
    weights.rainfallDeficit +
    weights.demand +
    weights.recharge;

  const handleSaveWeights = async () => {
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await api.updateWeights(weights);
      setWeights(res.weights);
      setSaveNotice('Weights normalized to 100% and saved to SQLite.');
      await loadStress();
      onWeightsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save weights.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setWeights(DEFAULT_WEIGHTS);
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await api.updateWeights(DEFAULT_WEIGHTS);
      setWeights(res.weights);
      setSaveNotice('Reset to default hydrological weights.');
      await loadStress();
      onWeightsUpdated();
    } finally {
      setSaving(false);
    }
  };

  if (loading || !stress || !location) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
        <div className="h-80 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="pb-6 border-b border-[#E2E8F0]">
        <div className="text-xs font-medium text-[#0F766E]">
          Water Risk Monitor · {formatSourceLabel(location.sourceType)}
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
          Transparent Water Stress Index — {location.name}
        </h1>
        <p className="mt-1.5 text-sm text-[#334E68] max-w-3xl">
          Every Water Stress Index score (0–100) is computed transparently from five normalized hydrological indicators. Adjust weights below to inspect sensitivity and inspect missing-data confidence.
        </p>
      </header>

      {error && (
        <div className="p-4 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-xl text-sm text-[#DC2626]">
          {error}
        </div>
      )}

      {/* Overall Score & Data Confidence */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-[#627D98]">Composite Water Stress Score</div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-5xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                    {stress.overallScore}
                  </span>
                  <span className="text-base text-[#627D98] font-mono">/ 100</span>
                  <span className={`text-base font-semibold ${riskTextColor(stress.riskCategory)}`}>
                    {stress.riskCategory} Risk
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-[#627D98] font-mono tabular-nums">
                <div>Depth: {stress.currentDepthM?.toFixed(2) ?? 'Missing'} m bgl</div>
                <div className="mt-1">
                  Depletion: {stress.depletionRateMPerYear >= 0 ? '+' : ''}
                  {stress.depletionRateMPerYear.toFixed(2)} m/yr
                </div>
              </div>
            </div>

            {/* Linear threshold gauge */}
            <div className="mt-6">
              <div className="h-3 w-full rounded-full bg-[#F2EFE9] overflow-hidden relative">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${stress.overallScore}%`,
                    backgroundColor: riskHexColor(stress.riskCategory),
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[#627D98] font-mono tabular-nums">
                <span>0 · Low (0-24)</span>
                <span>25 · Moderate (25-49)</span>
                <span>50 · High (50-74)</span>
                <span>75–100 · Critical</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
            <div className="text-xs font-semibold text-[#0B1F3A]">Score Explanation</div>
            <p className="mt-1 text-sm text-[#334E68] leading-relaxed">{stress.explanation}</p>
          </div>
        </div>

        {/* Data Confidence Indicator */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-[#627D98]">Data Confidence &amp; Completeness</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {stress.confidence.completenessPct}%
              </span>
              <span
                className={`text-sm font-semibold ${
                  stress.confidence.level === 'High'
                    ? 'text-[#0D9488]'
                    : stress.confidence.level === 'Moderate'
                      ? 'text-[#D97706]'
                      : 'text-[#DC2626]'
                }`}
              >
                {stress.confidence.level} Confidence
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 py-3 border-y border-[#E2E8F0] text-center">
              <div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                  {stress.confidence.validReadings}
                </div>
                <div className="text-[11px] text-[#627D98]">Complete Months</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#D97706]">
                  {stress.confidence.missingCount}
                </div>
                <div className="text-[11px] text-[#627D98]">Missing Months</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                  {stress.confidence.expectedReadings}
                </div>
                <div className="text-[11px] text-[#627D98]">Expected Window</div>
              </div>
            </div>

            <p className="mt-4 text-xs text-[#334E68] leading-relaxed">{stress.confidence.note}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-[11px] text-[#627D98]">
            Provenance: {location.sourceNote}
          </div>
        </div>
      </section>

      {/* Factor Contribution Chart + Interactive Weight Configurator */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Factor-Wise Weighted Contribution (Points toward 0–100 Score)
          </h2>
          <p className="text-xs text-[#627D98] mt-0.5 mb-4">
            Each factor sub-score (0–100) multiplied by its normalized percentage weight
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stress.factors}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" domain={[0, 45]} tick={{ fontSize: 11, fill: '#627D98' }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
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
                <Bar dataKey="weightedContribution" name="Weighted Points" radius={[0, 4, 4, 0]}>
                  {stress.factors.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={idx % 2 === 0 ? '#0D9488' : '#0B1F3A'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Configurable Factor Weights */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">Configurable Scoring Weights</h2>
              <p className="text-xs text-[#627D98] mt-0.5">
                Auto-normalized to 100% upon saving (current sum: {weightSum.toFixed(1)}%)
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#334E68] hover:text-[#0B1F3A] px-2.5 py-1.5 border border-[#CBD5E1] rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {(
              [
                ['availability', 'Groundwater Availability'],
                ['depletion', 'Depletion Rate'],
                ['rainfallDeficit', 'Rainfall Deficit'],
                ['demand', 'Demand Pressure'],
                ['recharge', 'Recharge Indicators'],
              ] as Array<[keyof StressWeights, string]>
            ).map(([key, label]) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#0B1F3A]">{label}</span>
                  <span className="font-mono tabular-nums text-[#0F766E]">
                    {weights[key]}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                  className="w-full accent-[#0D9488] cursor-pointer"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 pt-4 border-t border-[#E2E8F0]">
            {saveNotice ? (
              <span className="text-xs text-[#0D9488] inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{saveNotice}</span>
              </span>
            ) : (
              <span className="text-xs text-[#627D98]">Persists across all stations</span>
            )}
            <button
              type="button"
              onClick={handleSaveWeights}
              disabled={saving || weightSum <= 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Apply Weights'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Transparent Factor Audit Table */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Transparent Methodology &amp; Factor Audit Table
          </h2>
          <p className="text-xs text-[#627D98] mt-0.5">{stress.methodologyNote}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#FAF9F5] text-[11px] font-semibold text-[#627D98]">
                <th className="py-3 px-6">Factor</th>
                <th className="py-3 px-4">Observed Value</th>
                <th className="py-3 px-4 text-right">Sub-Score</th>
                <th className="py-3 px-4 text-right">Weight</th>
                <th className="py-3 px-4 text-right">Contribution</th>
                <th className="py-3 px-6">Hydrological Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {stress.factors.map((f) => (
                <tr key={f.key} className="hover:bg-[#FAF9F5]/60">
                  <td className="py-3.5 px-6 font-medium text-[#0B1F3A] whitespace-nowrap">
                    {f.label}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-[#334E68] whitespace-nowrap">
                    {f.rawMetric}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-right text-[#0B1F3A]">
                    {f.normalizedScore}/100
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-right text-[#334E68]">
                    {f.weightPct}%
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-right font-semibold text-[#0F766E]">
                    +{f.weightedContribution} pts
                  </td>
                  <td className="py-3.5 px-6 text-xs text-[#334E68] leading-relaxed max-w-md">
                    {f.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, ArrowRight, Play, RotateCcw } from 'lucide-react';
import type { ScenarioResponse } from '../types/water';
import { api, formatSourceLabel, riskTextColor } from '../lib/api';

interface PredictiveEngineViewProps {
  locationId: number;
}

export function PredictiveEngineView({ locationId }: PredictiveEngineViewProps) {
  const [rainfallVar, setRainfallVar] = useState(-15);
  const [consumptionVar, setConsumptionVar] = useState(10);
  const [rechargeBoost, setRechargeBoost] = useState(15);
  const [horizonMonths, setHorizonMonths] = useState<number>(12);

  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async (
    locId = locationId,
    rVar = rainfallVar,
    cVar = consumptionVar,
    rech = rechargeBoost,
    horizon = horizonMonths,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runScenario({
        locationId: locId,
        rainfallVariationPct: rVar,
        consumptionVariationPct: cVar,
        rechargeBoostPct: rech,
        horizonMonths: horizon,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSimulation(locationId, rainfallVar, consumptionVar, rechargeBoost, horizonMonths);
  }, [locationId]);

  const handlePreset = (preset: 'drought' | 'balanced' | 'recharge') => {
    if (preset === 'drought') {
      setRainfallVar(-25);
      setConsumptionVar(15);
      setRechargeBoost(0);
      void runSimulation(locationId, -25, 15, 0, horizonMonths);
    } else if (preset === 'balanced') {
      setRainfallVar(0);
      setConsumptionVar(0);
      setRechargeBoost(15);
      void runSimulation(locationId, 0, 0, 15, horizonMonths);
    } else {
      setRainfallVar(10);
      setConsumptionVar(-15);
      setRechargeBoost(40);
      void runSimulation(locationId, 10, -15, 40, horizonMonths);
    }
  };

  return (
    <div className="space-y-8">
      <header className="pb-6 border-b border-[#E2E8F0]">
        <div className="text-xs font-medium text-[#0F766E]">
          Predictive What-If Scenario Engine
          {result ? ` · ${formatSourceLabel(result.location.sourceType)}` : ''}
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
          Multi-Scenario Groundwater Stress Simulator
        </h1>
        <p className="mt-1.5 text-sm text-[#334E68] max-w-3xl">
          Test rainfall shocks, demand shifts, and artificial recharge interventions to compare Optimistic, Baseline, and High Stress trajectories.
        </p>
      </header>

      {/* Mandatory Scientific Honesty Disclosure */}
      <section className="p-4 bg-[#F2EFE9] border border-[#CBD5E1] rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[#0F766E] shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-[#0B1F3A] leading-relaxed">
          <span className="font-semibold">Scenario Estimates — Not Validated Forecasts:</span>{' '}
          {result?.disclaimer ??
            'Outputs represent exploratory what-if sensitivity trajectories derived from historical linear trends and simplified water-balance coefficients, not calibrated 3D hydrogeological forecasts.'}
        </div>
      </section>

      {error && (
        <div className="p-4 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-xl text-sm text-[#DC2626]">
          {error}
        </div>
      )}

      {/* Controls + Trajectory Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Simulation Parameters */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#0B1F3A]">Scenario Controls</h2>
              <button
                type="button"
                onClick={() => handlePreset('balanced')}
                className="inline-flex items-center gap-1 text-xs text-[#627D98] hover:text-[#0B1F3A]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Defaults</span>
              </button>
            </div>

            {/* Quick Presets */}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handlePreset('drought')}
                className="px-2 py-1.5 text-[11px] font-medium border border-[#CBD5E1] rounded-md hover:bg-[#FAF9F5] text-[#0B1F3A]"
              >
                Dry Shock
              </button>
              <button
                type="button"
                onClick={() => handlePreset('balanced')}
                className="px-2 py-1.5 text-[11px] font-medium border border-[#CBD5E1] rounded-md hover:bg-[#FAF9F5] text-[#0B1F3A]"
              >
                Status Quo
              </button>
              <button
                type="button"
                onClick={() => handlePreset('recharge')}
                className="px-2 py-1.5 text-[11px] font-medium border border-[#CBD5E1] rounded-md hover:bg-[#FAF9F5] text-[#0B1F3A]"
              >
                Recharge Push
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#0B1F3A]">Rainfall Variation</span>
                  <span className="font-mono tabular-nums font-semibold text-[#0F766E]">
                    {rainfallVar >= 0 ? '+' : ''}
                    {rainfallVar}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={rainfallVar}
                  onChange={(e) => setRainfallVar(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-[11px] text-[#627D98]">
                  <span>-50% Deficit</span>
                  <span>0%</span>
                  <span>+50% Surplus</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#0B1F3A]">Water Consumption Variation</span>
                  <span className="font-mono tabular-nums font-semibold text-[#0F766E]">
                    {consumptionVar >= 0 ? '+' : ''}
                    {consumptionVar}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  step={5}
                  value={consumptionVar}
                  onChange={(e) => setConsumptionVar(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-[11px] text-[#627D98]">
                  <span>-40% Demand Cut</span>
                  <span>0%</span>
                  <span>+40% Growth</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#0B1F3A]">Groundwater Recharge Boost</span>
                  <span className="font-mono tabular-nums font-semibold text-[#0F766E]">
                    +{rechargeBoost}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={rechargeBoost}
                  onChange={(e) => setRechargeBoost(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-[11px] text-[#627D98]">
                  <span>0%</span>
                  <span>+30%</span>
                  <span>+60% MAR</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-[#0B1F3A] mb-2">Projection Duration</div>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#F2EFE9] rounded-lg">
                  {[6, 12, 24, 36].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setHorizonMonths(m)}
                      className={`py-1.5 text-xs font-mono font-medium rounded-md transition-colors ${
                        horizonMonths === m
                          ? 'bg-white text-[#0B1F3A] shadow-sm'
                          : 'text-[#334E68] hover:text-[#0B1F3A]'
                      }`}
                    >
                      {m}M
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void runSimulation(locationId, rainfallVar, consumptionVar, rechargeBoost, horizonMonths)
            }
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#16325B] disabled:opacity-60 rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>{loading ? 'Running Simulation...' : 'Run What-If Simulation'}</span>
          </button>
        </div>

        {/* Scenario Comparison Chart */}
        <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              {result ? `${result.location.name} — ` : ''}Projected Groundwater Depth Comparison (m bgl)
            </h2>
            <p className="text-xs text-[#627D98] mt-0.5">
              Lower line indicates shallower, healthier water table; upward curve indicates deeper depletion
            </p>
          </div>

          <div className="h-80 w-full">
            {result ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.series} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#627D98' }} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11, fill: '#627D98' }} domain={['auto', 'auto']} unit="m" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="optimisticDepthM"
                    name="Optimistic (m bgl)"
                    stroke="#0D9488"
                    strokeWidth={2.4}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baselineDepthM"
                    name="Baseline (m bgl)"
                    stroke="#0B1F3A"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="highStressDepthM"
                    name="High Stress (m bgl)"
                    stroke="#DC2626"
                    strokeWidth={2.4}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full bg-[#FAF9F5] rounded-lg animate-pulse" />
            )}
          </div>
        </div>
      </section>

      {/* Scenario Outcome Cards */}
      {result && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {result.outcomes.map((o) => (
            <div key={o.name} className="bg-white border border-[#E2E8F0] rounded-xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#0B1F3A]">{o.name} Scenario</span>
                <span className={`text-xs font-semibold ${riskTextColor(o.estimatedRiskCategory)}`}>
                  {o.estimatedRiskCategory} Risk
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#627D98]">Projected End Depth</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                    {o.projectedEndDepthM.toFixed(2)} m
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#627D98]">
                    Net: {o.netDepthChangeM >= 0 ? '+' : ''}
                    {o.netDepthChangeM.toFixed(2)} m
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#627D98]">Est. Stress Index</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                    {o.estimatedStressScore}
                    <span className="text-sm font-normal text-[#627D98]">/100</span>
                  </div>
                  <div className="text-xs text-[#334E68]">{o.riskChange}</div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Preventive Actions + Model Assumptions & Limitations */}
      {result && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              Suggested Preventive Actions
            </h2>
            <p className="text-xs text-[#627D98] mt-0.5 mb-4">
              Measures triggered by your selected stress sensitivity parameters
            </p>
            <ul className="space-y-3">
              {result.preventiveActions.map((act, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-[#334E68]">
                  <ArrowRight className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Assumptions &amp; Limitations
              </h2>
              <p className="text-xs text-[#627D98] mt-0.5">
                Full transparency on how scenario trajectories are calculated
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0F766E] mb-1.5">Model Assumptions</div>
              <ul className="space-y-1.5 text-xs text-[#334E68] list-disc pl-4">
                {result.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0B1F3A] mb-1.5">Key Limitations</div>
              <ul className="space-y-1.5 text-xs text-[#334E68] list-disc pl-4">
                {result.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

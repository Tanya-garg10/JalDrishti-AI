import React, { useEffect, useState } from 'react';
import type { ConservationCategory, ConservationResponse } from '../types/water';
import { api, formatSourceLabel, riskTextColor } from '../lib/api';

interface ConservationViewProps {
  locationId: number;
}

const CATEGORIES: Array<'All' | ConservationCategory> = [
  'All',
  'Agriculture',
  'Efficient Irrigation',
  'Rainwater Harvesting',
  'Groundwater Recharge',
  'Households',
  'Community-Level Conservation',
];

export function ConservationView({ locationId }: ConservationViewProps) {
  const [data, setData] = useState<ConservationResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'All' | ConservationCategory>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getConservation(locationId)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load recommendations.');
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 bg-white border border-[#E2E8F0] rounded-xl animate-pulse" />
          ))}
        </div>
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

  const visibleRecs =
    selectedCategory === 'All'
      ? data.recommendations
      : data.recommendations.filter((r) => r.category === selectedCategory);

  const priorityColor = (p: string) => {
    if (p === 'Critical') return 'text-[#DC2626]';
    if (p === 'High') return 'text-[#EA580C]';
    if (p === 'Medium') return 'text-[#D97706]';
    return 'text-[#0D9488]';
  };

  return (
    <div className="space-y-8">
      <header className="pb-6 border-b border-[#E2E8F0]">
        <div className="text-xs font-medium text-[#0F766E]">
          Smart Conservation Planner · {formatSourceLabel(data.location.sourceType)}
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
          Targeted Water Protection Plan — {data.location.name}
        </h1>
        <p className="mt-1.5 text-sm text-[#334E68] max-w-3xl">
          Interventions generated from local aquifer characteristics ({data.location.aquiferType}), stress score{' '}
          <span className={`font-semibold ${riskTextColor(data.stress.riskCategory)}`}>
            {data.stress.overallScore}/100 ({data.stress.riskCategory})
          </span>
          , and sectoral withdrawal shares. Benefits are stated qualitatively without unverified savings percentages.
        </p>
      </header>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#F2EFE9] rounded-xl">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-white text-[#0B1F3A] shadow-sm'
                : 'text-[#334E68] hover:text-[#0B1F3A]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Recommendations Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleRecs.map((rec) => (
          <article
            key={rec.id}
            className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between space-y-5"
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <span className="text-xs font-semibold text-[#0F766E]">{rec.category}</span>
                <span className={`text-xs font-semibold ${priorityColor(rec.priority)}`}>
                  {rec.priority} Priority
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-[#627D98]">Problem Identified</div>
                  <p className="mt-0.5 text-sm text-[#0B1F3A] leading-relaxed">
                    {rec.problemIdentified}
                  </p>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-[#627D98]">Suggested Action</div>
                  <p className="mt-0.5 text-sm font-medium text-[#0B1F3A] leading-relaxed">
                    {rec.suggestedAction}
                  </p>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-[#627D98]">Expected Benefit</div>
                  <p className="mt-0.5 text-xs text-[#334E68] leading-relaxed">
                    {rec.expectedBenefit}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E2E8F0] text-xs text-[#627D98]">
              <span className="font-semibold text-[#334E68]">Data Rationale:</span> {rec.reason}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

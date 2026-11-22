import React, { useState } from 'react';
import { Droplets, ShieldCheck } from 'lucide-react';

export function MethodologyView() {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="space-y-8">
      <header className="pb-6 border-b border-[#E2E8F0]">
        <div className="text-xs font-medium text-[#0F766E]">
          Scientific Transparency &amp; Data Integrity Charter
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
          Hydrological Methodology &amp; Assumptions
        </h1>
        <p className="mt-1.5 text-sm text-[#334E68] max-w-3xl">
          JalDrishti AI is built on verifiable, transparent calculations. Every score, trend slope, and scenario trajectory exposes its mathematical basis and distinguishes simulated demo records from user-uploaded observations.
        </p>
      </header>

      {/* Aquifer Cross-Section Visual */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Subterranean Aquifer &amp; Recharge Conceptual Model
          </h2>
          <p className="text-xs text-[#627D98] mt-0.5">
            Groundwater depth is measured in meters below ground level (m bgl) via monitoring piezometers; higher depth values signify water-table drawdown.
          </p>
        </div>
        <div className="bg-[#FAF9F5] p-4 sm:p-6">
          {!imgError ? (
            <img
              src="/src/assets/images/aquifer_cross_section_1795337211711.jpg"
              alt="Hydrological cross-section showing rainfall infiltration, recharge percolation well, monitoring piezometers, water table, and aquifer strata"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full max-h-[420px] object-contain rounded-lg mx-auto"
            />
          ) : (
            <div className="h-64 rounded-lg bg-gradient-to-br from-[#F2EFE9] to-[#E2E8F0] flex flex-col items-center justify-center text-center p-6">
              <Droplets className="w-8 h-8 text-[#0D9488]" />
              <div className="mt-2 text-sm font-semibold text-[#0B1F3A]">
                Aquifer Cross-Section Reference
              </div>
              <p className="mt-1 text-xs text-[#627D98] max-w-md">
                Rainfall infiltration and recharge percolation wells replenish unconfined aquifer sands above the impervious aquitard, tracked by monitoring piezometers.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Formula Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            01. Water Stress Index (0–100)
          </h2>
          <p className="text-xs text-[#334E68] leading-relaxed">
            Each monitoring station is evaluated across five normalized 0–100 sub-indices combined via user-configurable weights (normalized to 100%):
          </p>
          <div className="p-3 bg-[#FAF9F5] border border-[#E2E8F0] rounded-lg font-mono text-xs text-[#0B1F3A]">
            WSI = Σ (SubScore_i × Weight_i) / 100
          </div>
          <ul className="text-xs text-[#334E68] space-y-1.5 list-disc pl-4">
            <li><strong className="text-[#0B1F3A]">Low (0–24):</strong> Healthy storage with minimal net drawdown.</li>
            <li><strong className="text-[#0B1F3A]">Moderate (25–49):</strong> Seasonal drawdown requiring preventive demand balance.</li>
            <li><strong className="text-[#0B1F3A]">High (50–74):</strong> Sustained depletion or rainfall deficit outpacing natural recharge.</li>
            <li><strong className="text-[#0B1F3A]">Critical (75–100):</strong> Severe multi-factor groundwater stress needing urgent intervention.</li>
          </ul>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            02. Depletion Rate &amp; Scenario Approximations
          </h2>
          <p className="text-xs text-[#334E68] leading-relaxed">
            Historical depletion slope (m/year) is calculated using Ordinary Least Squares linear regression strictly over non-missing depth readings:
          </p>
          <div className="p-3 bg-[#FAF9F5] border border-[#E2E8F0] rounded-lg font-mono text-xs text-[#0B1F3A]">
            Slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)
          </div>
          <p className="text-xs text-[#334E68] leading-relaxed">
            The Predictive Engine applies simplified water-balance sensitivity coefficients for rainfall variation, consumption growth, and recharge enhancement atop the historical slope plus seasonal monsoon amplitude. These are <strong className="text-[#0B1F3A]">exploratory decision-support estimates</strong>, not 3D MODFLOW finite-difference forecasts.
          </p>
        </div>
      </section>

      {/* Data Integrity Charter */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-[#0F766E]">
          <ShieldCheck className="w-5 h-5" />
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Data Provenance &amp; Integrity Commitments
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-[#334E68] leading-relaxed">
          <div>
            <div className="font-semibold text-[#0B1F3A] mb-1">1. Clear Source Labeling</div>
            Built-in demonstration stations are explicitly tagged as{' '}
            <span className="font-medium text-[#0B1F3A]">Simulated Demo Data</span> modeled on regional aquifer behavior. Uploaded CSV records are tagged as{' '}
            <span className="font-medium text-[#0B1F3A]">User-Uploaded Data</span>.
          </div>
          <div>
            <div className="font-semibold text-[#0B1F3A] mb-1">2. Honest Missing-Data Handling</div>
            Missing observations are preserved as null gaps, excluded from regression slopes, and surfaced via the{' '}
            <span className="font-medium text-[#0B1F3A]">Data Confidence &amp; Completeness</span> score rather than silently interpolated.
          </div>
          <div>
            <div className="font-semibold text-[#0B1F3A] mb-1">3. Grounded AI Copilot</div>
            JalDrishti AI Copilot receives real SQLite telemetry for the selected station and is instructed never to fabricate measurements or claim unverified savings percentages.
          </div>
        </div>
      </section>
    </div>
  );
}

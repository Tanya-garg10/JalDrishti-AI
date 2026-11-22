import { GoogleGenAI } from '@google/genai';
import type {
  ConservationRecommendation,
  CopilotMessage,
  CopilotResponse,
  LocationSummary,
  ScenarioResponse,
  WaterLocation,
  WaterStressResult,
} from '../src/types/water.ts';
import { runScenarioSimulation } from './analytics.ts';

function isValidApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed === 'MY_GEMINI_API_KEY' || trimmed.includes('YOUR_')) {
    return false;
  }
  return true;
}

function buildGroundedFallbackReply(params: {
  question: string;
  primaryLocation: WaterLocation;
  primaryStress: WaterStressResult;
  compareSummary?: LocationSummary | null;
  recommendations: ConservationRecommendation[];
  scenarioRainDrop20: ScenarioResponse;
}): string {
  const q = params.question.toLowerCase();
  const { primaryLocation, primaryStress, compareSummary, recommendations, scenarioRainDrop20 } =
    params;
  const provenanceLabel =
    primaryLocation.sourceType === 'user_uploaded' ? 'User-Uploaded Data' : 'Simulated Demo Data';

  // 1. Simple Hindi explanation request
  if (q.includes('hindi') || q.includes('हिंदी') || q.includes('saral')) {
    const riskHindi: Record<string, string> = {
      Low: 'कम जोखिम (Low)',
      Moderate: 'मध्यम जोखिम (Moderate)',
      High: 'उच्च जोखिम (High)',
      Critical: 'अत्यधिक गंभीर जोखिम (Critical)',
    };
    const topFactor = [...primaryStress.factors].sort(
      (a, b) => b.weightedContribution - a.weightedContribution,
    )[0];

    return [
      `### जलदृष्टि AI — वाटर स्ट्रेस इंडेक्स (सरल हिंदी में व्याख्या)`,
      ``,
      `**${primaryLocation.name}** (${provenanceLabel}) का वर्तमान वाटर स्ट्रेस स्कोर **${primaryStress.overallScore}/100** है, जो **${riskHindi[primaryStress.riskCategory]}** श्रेणी में आता है।`,
      ``,
      `**इसका क्या मतलब है?**`,
      `- वाटर स्ट्रेस इंडेक्स 0 से 100 का एक पैमाना है जो बताता है कि किसी क्षेत्र के भूजल (groundwater) पर कितना दबाव है। 0 के करीब स्कोर सुरक्षित स्थिति दिखाता है, जबकि 75 से ऊपर स्कोर गंभीर संकट दर्शाता है।`,
      `- **मुख्य कारण:** यहाँ सबसे बड़ा दबाव **${topFactor.label}** (${topFactor.weightedContribution} अंक योगदान) के कारण है।`,
      `- **भूजल स्तर:** वर्तमान में भूजल स्तर जमीन से **${primaryStress.currentDepthM?.toFixed(2) ?? 'अज्ञात'} मीटर नीचे** है और इसमें सालाना लगभग **${primaryStress.depletionRateMPerYear.toFixed(2)} मीटर/वर्ष** की गिरावट दर्ज की गई है।`,
      `- **वर्षा की स्थिति:** वार्षिक वर्षा लगभग **${primaryStress.annualRainfallMm.toFixed(0)} mm** रही है (${primaryStress.rainfallAnomalyPct >= 0 ? '+' : ''}${primaryStress.rainfallAnomalyPct.toFixed(1)}% सामान्य से)।`,
      ``,
      `**सुझाव:** ${recommendations[0]?.suggestedAction ?? 'वर्षा जल संचयन और कुशल सिंचाई अपनाएं।'}`,
      ``,
      `*डेटा नोट: यह विश्लेषण ${provenanceLabel} पर आधारित है (डेटा पूर्णता: ${primaryStress.confidence.completenessPct}%)।*`,
    ].join('\n');
  }

  // 2. Compare two locations
  if ((q.includes('compare') || q.includes('vs') || q.includes('difference')) && compareSummary) {
    const cLoc = compareSummary.location;
    const cStress = compareSummary.stress;
    const higherRisk =
      primaryStress.overallScore >= cStress.overallScore ? primaryLocation.name : cLoc.name;

    return [
      `### Location Comparison: ${primaryLocation.name} vs ${cLoc.name}`,
      ``,
      `- **Water Stress Index:** ${primaryLocation.name} is at **${primaryStress.overallScore}/100 (${primaryStress.riskCategory})** vs ${cLoc.name} at **${cStress.overallScore}/100 (${cStress.riskCategory})**. **${higherRisk}** faces greater overall water stress.`,
      `- **Groundwater Depth:** ${primaryLocation.name} sits at **${primaryStress.currentDepthM?.toFixed(2) ?? 'N/A'} m bgl** (${primaryStress.depletionRateMPerYear.toFixed(2)} m/yr decline) compared to **${cStress.currentDepthM?.toFixed(2) ?? 'N/A'} m bgl** (${cStress.depletionRateMPerYear.toFixed(2)} m/yr decline) in ${cLoc.name}.`,
      `- **Rainfall & Aquifer:** ${primaryLocation.name} (${primaryLocation.aquiferType}) records ~${primaryStress.annualRainfallMm.toFixed(0)} mm/yr (${primaryStress.rainfallAnomalyPct >= 0 ? '+' : ''}${primaryStress.rainfallAnomalyPct.toFixed(1)}% anomaly), while ${cLoc.name} (${cLoc.aquiferType}) records ~${cStress.annualRainfallMm.toFixed(0)} mm/yr (${cStress.rainfallAnomalyPct >= 0 ? '+' : ''}${cStress.rainfallAnomalyPct.toFixed(1)}% anomaly).`,
      `- **Data Completeness:** ${primaryStress.confidence.completenessPct}% (${primaryLocation.name}) vs ${cStress.confidence.completenessPct}% (${cLoc.name}).`,
    ].join('\n');
  }

  // 3. What happens if rainfall decreases by 20%?
  if (q.includes('20%') || (q.includes('rainfall') && (q.includes('decrease') || q.includes('drop') || q.includes('less')))) {
    const baseline = scenarioRainDrop20.outcomes.find((o) => o.name === 'Baseline');
    const highStress = scenarioRainDrop20.outcomes.find((o) => o.name === 'High Stress');
    return [
      `### 12-Month Scenario Estimate: 20% Rainfall Reduction for ${primaryLocation.name}`,
      ``,
      `Based on JalDrishti's simplified water-balance scenario model (${provenanceLabel}):`,
      `- **Current Baseline:** Depth **${primaryStress.currentDepthM?.toFixed(2) ?? 'N/A'} m bgl**, Stress Index **${primaryStress.overallScore}/100 (${primaryStress.riskCategory})**.`,
      `- **Status-Quo Baseline (12 months):** Estimated depth **${baseline?.projectedEndDepthM.toFixed(2)} m bgl** (Stress ~${baseline?.estimatedStressScore}/100).`,
      `- **Under -20% Rainfall Stress (12 months):** Estimated depth shifts to **${highStress?.projectedEndDepthM.toFixed(2)} m bgl** (${highStress && highStress.netDepthChangeM >= 0 ? '+' : ''}${highStress?.netDepthChangeM.toFixed(2)} m deeper), pushing the Water Stress Index to **${highStress?.estimatedStressScore}/100 (${highStress?.riskChange})**.`,
      ``,
      `**Recommended Safeguards:**`,
      ...scenarioRainDrop20.preventiveActions.slice(0, 3).map((a) => `- ${a}`),
      ``,
      `*Disclosure: Scenario outputs are exploratory sensitivity estimates, not validated hydrological forecasts.*`,
    ].join('\n');
  }

  // 4. Conservation measures
  if (q.includes('conservation') || q.includes('measure') || q.includes('priorit') || q.includes('protect') || q.includes('action')) {
    const topRecs = recommendations.slice(0, 3);
    return [
      `### Priority Conservation Measures for ${primaryLocation.name}`,
      ``,
      `Given a **${primaryStress.overallScore}/100 (${primaryStress.riskCategory})** stress score and **${primaryLocation.aquiferType}** hydrogeology (${provenanceLabel}):`,
      ...topRecs.map(
        (r, i) =>
          `${i + 1}. **${r.category} [${r.priority}]:** ${r.suggestedAction} *(Reason: ${r.reason})*`,
      ),
    ].join('\n');
  }

  // 5. Trend / Why experiencing water stress / Summary
  const topFactors = [...primaryStress.factors]
    .sort((a, b) => b.weightedContribution - a.weightedContribution)
    .slice(0, 3);

  return [
    `### Water Intelligence Brief: ${primaryLocation.name} (${primaryLocation.state})`,
    ``,
    `- **Source & Confidence:** ${provenanceLabel} · Completeness **${primaryStress.confidence.completenessPct}% (${primaryStress.confidence.level})**${primaryStress.confidence.missingCount > 0 ? ` · ${primaryStress.confidence.missingCount} missing month(s) excluded from trend slope` : ''}.`,
    `- **Overall Stress:** **${primaryStress.overallScore}/100 (${primaryStress.riskCategory} Risk)**.`,
    `- **Primary Drivers:** ${topFactors.map((f) => `${f.label} (${f.weightedContribution} pts — ${f.rawMetric})`).join('; ')}.`,
    `- **Groundwater Trend:** Current depth is **${primaryStress.currentDepthM?.toFixed(2) ?? 'N/A'} m bgl**, changing at **${primaryStress.depletionRateMPerYear >= 0 ? '+' : ''}${primaryStress.depletionRateMPerYear.toFixed(2)} m/year** (positive values indicate a falling water table).`,
    `- **Top Priority Action:** ${recommendations[0]?.suggestedAction ?? 'Expand local recharge and demand management.'}`,
  ].join('\n');
}

export async function generateCopilotResponse(params: {
  question: string;
  history: CopilotMessage[];
  primaryLocation: WaterLocation;
  primaryStress: WaterStressResult;
  compareSummary?: LocationSummary | null;
  allSummaries: LocationSummary[];
  recommendations: ConservationRecommendation[];
  scenarioRainDrop20: ScenarioResponse;
}): Promise<CopilotResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const provenanceLabel =
    params.primaryLocation.sourceType === 'user_uploaded'
      ? 'User-Uploaded Dataset'
      : 'Simulated Demo Dataset';

  if (!isValidApiKey(apiKey)) {
    return {
      reply: buildGroundedFallbackReply(params),
      mode: 'fallback',
      modelUsed: 'deterministic-context-fallback',
      contextLocationName: params.primaryLocation.name,
      dataSourceNote: `${provenanceLabel} · ${params.primaryLocation.sourceNote}`,
      errorNotice:
        'Gemini API key is not configured in environment variables; using deterministic context-grounded analytical fallback.',
    };
  }

  const portfolioSnapshot = params.allSummaries
    .map(
      (s) =>
        `- ${s.location.name} (${s.location.state}, ${s.location.sourceType}): Stress ${s.stress.overallScore}/100 (${s.stress.riskCategory}), Depth ${s.stress.currentDepthM?.toFixed(2) ?? 'Missing'} m bgl, Trend ${s.stress.depletionRateMPerYear.toFixed(2)} m/yr, Rain ${s.stress.annualRainfallMm.toFixed(0)} mm/yr, Completeness ${s.stress.confidence.completenessPct}%`,
    )
    .join('\n');

  const factorsSnapshot = params.primaryStress.factors
    .map(
      (f) =>
        `- ${f.label}: Raw=${f.rawMetric}, SubScore=${f.normalizedScore}/100, Weight=${f.weightPct}%, Contribution=${f.weightedContribution} pts`,
    )
    .join('\n');

  const compareBlock = params.compareSummary
    ? `\nComparison Location Context (${params.compareSummary.location.name}):\n- State/Basin: ${params.compareSummary.location.state}, ${params.compareSummary.location.basin}\n- Aquifer: ${params.compareSummary.location.aquiferType}\n- Source Type: ${params.compareSummary.location.sourceType}\n- Stress Score: ${params.compareSummary.stress.overallScore}/100 (${params.compareSummary.stress.riskCategory})\n- Depth: ${params.compareSummary.stress.currentDepthM?.toFixed(2) ?? 'Missing'} m bgl, Depletion Slope: ${params.compareSummary.stress.depletionRateMPerYear.toFixed(2)} m/yr\n- Annual Rainfall: ${params.compareSummary.stress.annualRainfallMm.toFixed(0)} mm (${params.compareSummary.stress.rainfallAnomalyPct}% vs normal)\n- Completeness: ${params.compareSummary.stress.confidence.completenessPct}%\n`
    : '';

  const systemInstruction = `You are JalDrishti AI Copilot, an analytical water intelligence assistant.
STRICT DATA INTEGRITY RULES:
1. Ground EVERY number, location metric, and trend strictly in the application context provided below. NEVER invent measurements, sensors, or external statistics not present in the context.
2. Always note clearly when data is from "${provenanceLabel}" (${params.primaryLocation.sourceNote}) and disclose missing observations (${params.primaryStress.confidence.missingCount} missing months) if relevant.
3. For future projections, clearly frame them as scenario estimates, not guaranteed forecasts.
4. Keep responses concise, structured with clean markdown bullets, and directly actionable. If the user asks in Hindi or asks for simple Hindi, respond clearly in simple, natural Hindi (Devanagari).

PRIMARY SELECTED LOCATION:
- Name: ${params.primaryLocation.name} (${params.primaryLocation.state}, ${params.primaryLocation.basin})
- Aquifer: ${params.primaryLocation.aquiferType}
- Source Type: ${params.primaryLocation.sourceType} (${params.primaryLocation.sourceNote})
- Water Stress Index: ${params.primaryStress.overallScore}/100 (${params.primaryStress.riskCategory} Risk)
- Latest Groundwater Depth: ${params.primaryStress.currentDepthM?.toFixed(2) ?? 'Missing'} m below ground level (higher = deeper/more depleted)
- Depletion Rate: ${params.primaryStress.depletionRateMPerYear.toFixed(2)} m/year
- Annualized Rainfall: ${params.primaryStress.annualRainfallMm.toFixed(0)} mm/yr (${params.primaryStress.rainfallAnomalyPct}% vs ${params.primaryLocation.expectedAnnualRainfallMm} mm benchmark)
- Data Confidence: ${params.primaryStress.confidence.completenessPct}% (${params.primaryStress.confidence.level}; ${params.primaryStress.confidence.missingCount} missing months)

FACTOR CONTRIBUTIONS:
${factorsSnapshot}

12-MONTH -20% RAINFALL SCENARIO PREVIEW FOR ${params.primaryLocation.name}:
${params.scenarioRainDrop20.outcomes.map((o) => `- ${o.name}: End Depth ${o.projectedEndDepthM} m bgl, Est. Stress ${o.estimatedStressScore}/100 (${o.riskChange})`).join('\n')}

TOP CONSERVATION OPTIONS:
${params.recommendations.slice(0, 4).map((r) => `- [${r.priority}] ${r.category}: ${r.suggestedAction} (Reason: ${r.reason})`).join('\n')}
${compareBlock}
ALL MONITORED LOCATIONS SUMMARY:
${portfolioSnapshot}`;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const recentHistory = params.history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const promptContents = recentHistory
      ? `Recent conversation:\n${recentHistory}\n\nCurrent question:\n${params.question}`
      : params.question;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptContents,
      config: {
        systemInstruction,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response received from Gemini model.');
    }

    return {
      reply: text,
      mode: 'gemini',
      modelUsed: 'gemini-4-hydrogen',
      contextLocationName: params.primaryLocation.name,
      dataSourceNote: `${provenanceLabel} · ${params.primaryLocation.sourceNote}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini request failed';
    return {
      reply: buildGroundedFallbackReply(params),
      mode: 'fallback',
      modelUsed: 'deterministic-context-fallback',
      contextLocationName: params.primaryLocation.name,
      dataSourceNote: `${provenanceLabel} · ${params.primaryLocation.sourceNote}`,
      errorNotice: `Gemini API unavailable (${message}); served context-grounded analytical fallback.`,
    };
  }
}

export function buildRainDrop20Preview(
  location: WaterLocation,
  readings: Parameters<typeof runScenarioSimulation>[1],
  weights: Parameters<typeof runScenarioSimulation>[2],
): ScenarioResponse {
  return runScenarioSimulation(location, readings, weights, {
    locationId: location.id,
    rainfallVariationPct: -20,
    consumptionVariationPct: 5,
    rechargeBoostPct: 0,
    horizonMonths: 12,
  });
}

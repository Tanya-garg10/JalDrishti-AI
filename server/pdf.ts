import PDFDocument from 'pdfkit';
import type {
  ConservationRecommendation,
  ScenarioResponse,
  WaterLocation,
  WaterReading,
  WaterStressResult,
} from '../src/types/water.ts';

export function buildWaterReportPdfBuffer(params: {
  location: WaterLocation;
  stress: WaterStressResult;
  readings: WaterReading[];
  scenario: ScenarioResponse;
  recommendations: ConservationRecommendation[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `JalDrishti AI Water Intelligence Report - ${params.location.name}`,
        Author: 'JalDrishti AI',
        Subject: 'Groundwater & Water Stress Decision Support Report',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#0B1F3A';
    const slate = '#334E68';
    const muted = '#627D98';
    const teal = '#0D9488';
    const border = '#CBD5E1';

    const provenanceLabel =
      params.location.sourceType === 'user_uploaded'
        ? 'User-Uploaded CSV Dataset'
        : 'Simulated Demo Dataset (Non-Official)';

    // Header
    doc.fillColor(teal).fontSize(10).font('Helvetica-Bold').text('JALDRISHTI AI · WATER INTELLIGENCE BRIEF');
    doc.moveDown(0.3);
    doc.fillColor(navy).fontSize(20).font('Helvetica-Bold').text(params.location.name);
    doc
      .fillColor(slate)
      .fontSize(10)
      .font('Helvetica')
      .text(
        `${params.location.state} · ${params.location.basin} · Aquifer: ${params.location.aquiferType}`,
      );
    doc
      .fillColor(muted)
      .fontSize(9)
      .text(
        `Generated: ${new Date().toISOString().slice(0, 10)} · Data Source: ${provenanceLabel} · Confidence: ${params.stress.confidence.completenessPct}% (${params.stress.confidence.level})`,
      );

    doc.moveDown(0.8);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(border).lineWidth(1).stroke();
    doc.moveDown(0.8);

    // 1. Water Stress Summary
    doc.fillColor(navy).fontSize(13).font('Helvetica-Bold').text('1. Water Stress Index Summary');
    doc.moveDown(0.35);
    doc
      .fillColor(slate)
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Overall Score: ${params.stress.overallScore} / 100 (${params.stress.riskCategory} Risk)`,
      );
    doc.text(
      `Current Groundwater Depth: ${params.stress.currentDepthM !== null ? `${params.stress.currentDepthM.toFixed(2)} m bgl` : 'Missing'} · Depletion Rate: ${params.stress.depletionRateMPerYear >= 0 ? '+' : ''}${params.stress.depletionRateMPerYear.toFixed(2)} m/year`,
    );
    doc.text(
      `Annualized Rainfall: ${params.stress.annualRainfallMm.toFixed(1)} mm/yr (${params.stress.rainfallAnomalyPct >= 0 ? '+' : ''}${params.stress.rainfallAnomalyPct.toFixed(1)}% vs ${params.location.expectedAnnualRainfallMm} mm normal)`,
    );
    doc.moveDown(0.3);
    doc.fillColor(navy).fontSize(9.5).text(params.stress.explanation);

    doc.moveDown(0.7);
    doc.fillColor(navy).fontSize(11).font('Helvetica-Bold').text('Factor-Wise Contribution Breakdown');
    doc.moveDown(0.25);

    for (const f of params.stress.factors) {
      doc
        .fillColor(slate)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`• ${f.label}: ${f.weightedContribution} pts `, { continued: true })
        .font('Helvetica')
        .fillColor(muted)
        .text(`(Sub-score ${f.normalizedScore}/100 × ${f.weightPct}% weight · Observed: ${f.rawMetric})`);
    }

    // 2. Groundwater & Rainfall Trends
    doc.moveDown(0.8);
    doc.fillColor(navy).fontSize(13).font('Helvetica-Bold').text('2. Historical Groundwater & Rainfall Observations');
    doc.moveDown(0.3);
    const recentReadings = params.readings.slice(-6);
    doc
      .fillColor(slate)
      .fontSize(9.5)
      .font('Helvetica')
      .text(
        `Total records analyzed: ${params.readings.length} months (${params.stress.confidence.validReadings} complete, ${params.stress.confidence.missingCount} missing). Most recent 6 months:`,
      );
    doc.moveDown(0.25);
    for (const r of recentReadings) {
      const depthTxt = r.groundwaterDepthM !== null ? `${r.groundwaterDepthM.toFixed(2)} m bgl` : 'MISSING';
      const rainTxt = r.rainfallMm !== null ? `${r.rainfallMm.toFixed(1)} mm` : 'MISSING';
      doc
        .fillColor(muted)
        .fontSize(9)
        .text(`  ${r.dateLabel}  |  Depth: ${depthTxt}  |  Rainfall: ${rainTxt}`);
    }

    // 3. Scenario Projections
    doc.moveDown(0.8);
    doc
      .fillColor(navy)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(`3. ${params.scenario.parameters.horizonMonths}-Month Scenario Projections (Exploratory Estimates)`);
    doc.moveDown(0.3);
    for (const o of params.scenario.outcomes) {
      doc
        .fillColor(slate)
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text(`• ${o.name}: `, { continued: true })
        .font('Helvetica')
        .text(
          `Projected Depth ${o.projectedEndDepthM.toFixed(2)} m bgl (${o.netDepthChangeM >= 0 ? '+' : ''}${o.netDepthChangeM.toFixed(2)} m) · Est. Stress ${o.estimatedStressScore}/100 · ${o.riskChange}`,
        );
    }
    doc.moveDown(0.25);
    doc.fillColor(muted).fontSize(8.5).text(params.scenario.disclaimer);

    // 4. Conservation Recommendations
    if (doc.y > 640) doc.addPage();
    doc.moveDown(0.8);
    doc.fillColor(navy).fontSize(13).font('Helvetica-Bold').text('4. Priority Conservation Recommendations');
    doc.moveDown(0.3);
    for (const rec of params.recommendations) {
      if (doc.y > 720) doc.addPage();
      doc
        .fillColor(teal)
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text(`${rec.category} [${rec.priority} Priority]`);
      doc.fillColor(navy).fontSize(9).font('Helvetica').text(`Action: ${rec.suggestedAction}`);
      doc.fillColor(muted).fontSize(8.5).text(`Reason: ${rec.reason} | Expected Benefit: ${rec.expectedBenefit}`);
      doc.moveDown(0.35);
    }

    // 5. Methodology & Data Integrity
    if (doc.y > 660) doc.addPage();
    doc.moveDown(0.6);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(border).lineWidth(1).stroke();
    doc.moveDown(0.6);
    doc.fillColor(navy).fontSize(12).font('Helvetica-Bold').text('5. Methodology & Data Integrity Disclosure');
    doc.moveDown(0.25);
    doc.fillColor(slate).fontSize(8.8).font('Helvetica').text(`• Scoring: ${params.stress.methodologyNote}`);
    doc.text(`• Provenance: ${params.location.sourceNote}`);
    doc.text(`• Missing Data Handling: ${params.stress.confidence.note}`);
    doc.text(
      '• Scenario Limitations: Projections use linear trend extrapolation and simplified sensitivity coefficients; they are decision-support estimates rather than calibrated 3D hydrogeological models.',
    );

    doc.end();
  });
}

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import type { CsvUploadResponse, DatasetRecord, LocationSummary } from '../types/water';
import { api, formatSourceLabel } from '../lib/api';

interface ReportsDataViewProps {
  locations: LocationSummary[];
  selectedLocationId: number;
  onDatasetImported: (newLocationId?: number) => void;
}

export function ReportsDataView({
  locations,
  selectedLocationId,
  onDatasetImported,
}: ReportsDataViewProps) {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [uploadResult, setUploadResult] = useState<CsvUploadResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<number>(12);

  const activeSummary =
    locations.find((l) => l.location.id === selectedLocationId) ?? locations[0] ?? null;

  const loadDatasets = async () => {
    try {
      const res = await api.getDatasets();
      setDatasets(res.datasets);
    } catch {
      // ignore initial empty history error
    }
  };

  useEffect(() => {
    void loadDatasets();
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const text = await file.text();
      const res = await api.uploadCsv(file.name, text);
      setUploadResult(res);
      await loadDatasets();
      onDatasetImported(res.importedLocationIds[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate CSV file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="pb-6 border-b border-[#E2E8F0]">
        <div className="text-xs font-medium text-[#0F766E]">
          Reports &amp; Data Management · CSV Validation &amp; PDF Briefing
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
          Upload Hydrological Datasets &amp; Export Reports
        </h1>
        <p className="mt-1.5 text-sm text-[#334E68] max-w-3xl">
          Upload custom groundwater and rainfall CSV records with automatic schema validation and missing-value detection, or export comprehensive PDF water intelligence reports.
        </p>
      </header>

      {/* Top Grid: PDF Report Generator + CSV Uploader */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* PDF Report Download */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="text-xs font-semibold text-[#0F766E]">Executive Briefing</div>
            <h2 className="mt-1 text-lg font-bold text-[#0B1F3A]">
              Water Intelligence PDF Report
            </h2>
            <p className="mt-1 text-xs text-[#334E68] leading-relaxed">
              Generates a formatted multi-section PDF covering Water Stress Index factors, historical groundwater/rainfall trends, scenario projections, conservation plan, and data integrity disclosures.
            </p>

            {activeSummary && (
              <div className="mt-4 p-4 bg-[#FAF9F5] border border-[#E2E8F0] rounded-lg space-y-1.5 text-xs">
                <div className="font-semibold text-[#0B1F3A]">{activeSummary.location.name}</div>
                <div className="text-[#627D98]">
                  {formatSourceLabel(activeSummary.location.sourceType)} · Confidence{' '}
                  {activeSummary.stress.confidence.completenessPct}%
                </div>
                <div className="font-mono tabular-nums text-[#0B1F3A]">
                  Stress: {activeSummary.stress.overallScore}/100 ({activeSummary.stress.riskCategory})
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-xs font-medium text-[#0B1F3A] mb-1.5">
                Include Scenario Horizon
              </div>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#F2EFE9] rounded-lg">
                {[6, 12, 24, 36].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorizon(h)}
                    className={`py-1.5 text-xs font-mono font-medium rounded-md ${
                      horizon === h ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-[#334E68]'
                    }`}
                  >
                    {h}M
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={api.getPdfReportUrl(selectedLocationId, horizon)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#16325B] rounded-lg transition-colors whitespace-nowrap"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF Report</span>
            </a>
            <a
              href={api.getCsvExportUrl(selectedLocationId)}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-[#0B1F3A] bg-white border border-[#CBD5E1] hover:bg-[#FAF9F5] rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        {/* CSV Upload & Validation */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[#0F766E]">Custom Data Import</div>
              <h2 className="mt-1 text-lg font-bold text-[#0B1F3A]">
                Upload Groundwater &amp; Rainfall CSV
              </h2>
            </div>
            <a
              href={api.getCsvTemplateUrl()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0D9488] hover:text-[#0F766E] px-3 py-1.5 border border-[#0D9488]/30 rounded-lg whitespace-nowrap self-start sm:self-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Sample CSV</span>
            </a>
          </div>

          <p className="text-xs text-[#334E68] leading-relaxed">
            Required columns:{' '}
            <span className="font-mono text-[#0B1F3A]">
              location_name, year, month, groundwater_depth_m, rainfall_mm
            </span>
            . Optional: <span className="font-mono text-[#627D98]">state, basin, aquifer_type, latitude, longitude</span>. Blank cells are flagged as missing gaps rather than silently filled.
          </p>

          <label className="block border-2 border-dashed border-[#CBD5E1] hover:border-[#0D9488] rounded-xl p-8 text-center cursor-pointer bg-[#FAF9F5] transition-colors">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Upload className="w-7 h-7 text-[#0D9488] mx-auto" />
            <div className="mt-2 text-sm font-semibold text-[#0B1F3A]">
              {uploading ? 'Validating & Importing CSV...' : 'Choose a CSV file to upload'}
            </div>
            <div className="mt-1 text-xs text-[#627D98]">
              Valid rows are persisted to SQLite and tagged as User-Uploaded Data across all views.
            </div>
          </label>

          {error && (
            <div className="p-3.5 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-lg text-xs text-[#DC2626]">
              {error}
            </div>
          )}

          {uploadResult && (
            <div className="p-4 bg-[#0D9488]/8 border border-[#0D9488]/25 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F766E]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{uploadResult.message}</span>
              </div>
              <div className="grid grid-cols-4 gap-3 pt-2 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-[#627D98] block">Total Rows</span>
                  <span className="font-bold text-[#0B1F3A]">{uploadResult.dataset.rowCount}</span>
                </div>
                <div>
                  <span className="text-[#627D98] block">Complete</span>
                  <span className="font-bold text-[#0D9488]">{uploadResult.dataset.validRows}</span>
                </div>
                <div>
                  <span className="text-[#627D98] block">Missing Gaps</span>
                  <span className="font-bold text-[#D97706]">{uploadResult.dataset.missingRows}</span>
                </div>
                <div>
                  <span className="text-[#627D98] block">Invalid</span>
                  <span className="font-bold text-[#DC2626]">{uploadResult.dataset.invalidRows}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Dataset Preview Table (if just uploaded) */}
      {uploadResult && uploadResult.previewRows.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0]">
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              Validation Preview — {uploadResult.dataset.filename}
            </h2>
            <p className="text-xs text-[#627D98] mt-0.5">
              Showing first {uploadResult.previewRows.length} rows with row-level integrity status
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#FAF9F5] text-[11px] font-semibold text-[#627D98]">
                  <th className="py-2.5 px-6">Row</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Period</th>
                  <th className="py-2.5 px-4 text-right">Depth (m bgl)</th>
                  <th className="py-2.5 px-4 text-right">Rainfall (mm)</th>
                  <th className="py-2.5 px-6">Validation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {uploadResult.previewRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="py-2.5 px-6 font-mono tabular-nums text-[#627D98]">
                      #{row.rowNumber}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-[#0B1F3A]">{row.locationName}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#334E68]">
                      {row.year}-{String(row.month).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {row.groundwaterDepthM !== null ? row.groundwaterDepthM.toFixed(2) : 'MISSING'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                      {row.rainfallMm !== null ? row.rainfallMm.toFixed(1) : 'MISSING'}
                    </td>
                    <td className="py-2.5 px-6">
                      <span
                        className={`font-semibold ${
                          row.status === 'valid'
                            ? 'text-[#0D9488]'
                            : row.status === 'missing_values'
                              ? 'text-[#D97706]'
                              : 'text-[#DC2626]'
                        }`}
                      >
                        {row.status === 'valid'
                          ? 'Valid'
                          : row.status === 'missing_values'
                            ? 'Missing Values Flagged'
                            : `Invalid (${row.issue ?? 'Check format'})`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Imported Dataset Audit History */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-[#0B1F3A]">Imported Dataset Registry</h2>
          <p className="text-xs text-[#627D98] mt-0.5">
            User-uploaded CSV datasets persisted in SQLite alongside built-in simulated demo stations
          </p>
        </div>

        {datasets.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#627D98]">
            No user CSV datasets have been uploaded yet. Upload a CSV above or download the sample template to test custom ingestion.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#FAF9F5] text-[11px] font-semibold text-[#627D98]">
                  <th className="py-3 px-6">Filename</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Locations</th>
                  <th className="py-3 px-4 text-right">Valid</th>
                  <th className="py-3 px-4 text-right">Missing Gaps</th>
                  <th className="py-3 px-6 text-right">Rejected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td className="py-3 px-6 font-medium text-[#0B1F3A]">{d.filename}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#627D98]">
                      {d.uploadedAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.locationCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0D9488]">
                      {d.validRows}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#D97706]">
                      {d.missingRows}
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums text-[#DC2626]">
                      {d.invalidRows}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

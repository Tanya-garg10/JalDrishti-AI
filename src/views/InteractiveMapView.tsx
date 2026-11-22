import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ArrowRight, MapPin } from 'lucide-react';
import type { ConservationRecommendation, LocationSummary } from '../types/water';
import { api, formatSourceLabel, riskHexColor, riskTextColor } from '../lib/api';
import type { NavPageId } from '../components/LayoutShell';

interface InteractiveMapViewProps {
  locations: LocationSummary[];
  selectedLocationId: number | null;
  onSelectLocation: (id: number) => void;
  onNavigate: (page: NavPageId) => void;
}

export function InteractiveMapView({
  locations,
  selectedLocationId,
  onSelectLocation,
  onNavigate,
}: InteractiveMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [recs, setRecs] = useState<ConservationRecommendation[]>([]);

  const activeSummary =
    locations.find((l) => l.location.id === selectedLocationId) ?? locations[0] ?? null;

  useEffect(() => {
    if (!activeSummary) return;
    api
      .getConservation(activeSummary.location.id)
      .then((res) => setRecs(res.recommendations.slice(0, 3)))
      .catch(() => setRecs([]));
  }, [activeSummary?.location.id]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.5, 78.9],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersLayerRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Render / update station markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    locations.forEach((item) => {
      const { location, stress } = item;
      const isSelected = location.id === activeSummary?.location.id;
      const fillColor = riskHexColor(stress.riskCategory);

      const marker = L.circleMarker([location.latitude, location.longitude], {
        radius: isSelected ? 12 : 9,
        color: isSelected ? '#0B1F3A' : '#FFFFFF',
        weight: isSelected ? 3 : 2,
        fillColor,
        fillOpacity: 0.9,
      });

      const sourceBadge = formatSourceLabel(location.sourceType);
      marker.bindPopup(`
        <div style="min-width:190px;font-family:DM Sans,sans-serif;color:#0B1F3A;">
          <div style="font-size:11px;color:#0F766E;font-weight:600;">${sourceBadge}</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px;">${location.name}</div>
          <div style="font-size:12px;color:#334E68;">${location.state} · ${location.aquiferType}</div>
          <div style="margin-top:8px;font-size:12px;">
            <strong>Stress Index:</strong> ${stress.overallScore}/100 (${stress.riskCategory})<br/>
            <strong>Depth:</strong> ${stress.currentDepthM !== null ? `${stress.currentDepthM.toFixed(2)} m bgl` : 'Missing'}<br/>
            <strong>Trend:</strong> ${stress.depletionRateMPerYear >= 0 ? '+' : ''}${stress.depletionRateMPerYear.toFixed(2)} m/yr
          </div>
        </div>
      `);

      marker.on('click', () => {
        onSelectLocation(location.id);
      });

      marker.addTo(layer);
    });
  }, [locations, activeSummary?.location.id]);

  // Pan gently when selected location changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeSummary) return;
    map.panTo([activeSummary.location.latitude, activeSummary.location.longitude], {
      animate: true,
    });
  }, [activeSummary?.location.id]);

  return (
    <div className="space-y-6">
      <header className="pb-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-[#0F766E]">
            Geospatial Monitoring Network · Leaflet + OpenStreetMap
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
            Interactive Water Risk Map
          </h1>
          <p className="mt-1 text-sm text-[#334E68]">
            Click any monitoring station marker to inspect stress scores, depth measurements, and recommended interventions. Built-in nodes are clearly labeled as simulated demo data.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#334E68] shrink-0">
          {(['Critical', 'High', 'Moderate', 'Low'] as const).map((level) => (
            <span key={level} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: riskHexColor(level) }}
              />
              <span>{level}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Map Canvas */}
        <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden min-h-[460px] lg:min-h-[560px]">
          <div ref={mapContainerRef} className="w-full h-[460px] lg:h-[560px]" />
        </div>

        {/* Side Location Inspector */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
          {activeSummary ? (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-[#0F766E]">
                  {formatSourceLabel(activeSummary.location.sourceType)}
                </div>
                <h2 className="mt-1 text-xl font-bold text-[#0B1F3A] flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0D9488] shrink-0" />
                  <span>{activeSummary.location.name}</span>
                </h2>
                <div className="text-xs text-[#627D98] mt-1">
                  {activeSummary.location.state} · {activeSummary.location.basin}
                </div>
                <div className="text-xs text-[#627D98] mt-0.5">
                  Aquifer: {activeSummary.location.aquiferType}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 py-4 border-y border-[#E2E8F0]">
                <div>
                  <div className="text-xs text-[#627D98]">Water Stress Score</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                    {activeSummary.stress.overallScore}
                    <span className="text-xs font-normal text-[#627D98]">/100</span>
                  </div>
                  <div className={`text-xs font-semibold ${riskTextColor(activeSummary.stress.riskCategory)}`}>
                    {activeSummary.stress.riskCategory} Risk
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#627D98]">Groundwater Depth</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                    {activeSummary.stress.currentDepthM?.toFixed(2) ?? 'N/A'}
                    <span className="text-xs font-normal text-[#627D98] ml-1">m bgl</span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#334E68]">
                    {activeSummary.stress.depletionRateMPerYear >= 0 ? '+' : ''}
                    {activeSummary.stress.depletionRateMPerYear.toFixed(2)} m/yr
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#0B1F3A] mb-2.5">
                  Priority Conservation Actions
                </div>
                <ul className="space-y-2.5">
                  {recs.map((r) => (
                    <li key={r.id} className="text-xs text-[#334E68] leading-relaxed">
                      <span className="font-semibold text-[#0B1F3A]">{r.category}:</span>{' '}
                      {r.suggestedAction}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-[11px] text-[#627D98] pt-2 border-t border-[#E2E8F0]">
                {activeSummary.location.sourceNote}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#627D98]">Select a marker on the map to inspect details.</div>
          )}

          {activeSummary && (
            <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onNavigate('predictive')}
                className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] inline-flex items-center gap-1"
              >
                <span>Simulate Future</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('copilot')}
                className="text-xs font-medium text-[#0B1F3A] hover:text-[#0D9488]"
              >
                Ask AI Copilot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

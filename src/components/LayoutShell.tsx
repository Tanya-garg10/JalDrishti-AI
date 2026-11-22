import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Compass,
  Droplets,
  FileDown,
  FileSpreadsheet,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquareText,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { LocationSummary } from '../types/water';
import { formatSourceLabel } from '../lib/api';

export type NavPageId =
  | 'overview'
  | 'risk'
  | 'analytics'
  | 'predictive'
  | 'conservation'
  | 'map'
  | 'copilot'
  | 'reports'
  | 'methodology';

export interface NavItem {
  id: NavPageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'risk', label: 'Water Risk Monitor', icon: Activity },
  { id: 'analytics', label: 'Groundwater Analytics', icon: BarChart3 },
  { id: 'predictive', label: 'Predictive Engine', icon: SlidersHorizontal },
  { id: 'conservation', label: 'Conservation Planner', icon: Droplets },
  { id: 'map', label: 'Interactive Map', icon: MapPin },
  { id: 'copilot', label: 'AI Copilot', icon: MessageSquareText },
  { id: 'reports', label: 'Reports & Data', icon: FileSpreadsheet },
  { id: 'methodology', label: 'Methodology', icon: BookOpen },
];

interface LayoutShellProps {
  activePage: NavPageId;
  onNavigate: (page: NavPageId) => void;
  locations: LocationSummary[];
  selectedLocationId: number | null;
  onSelectLocation: (id: number) => void;
  pdfUrl: string;
  children: React.ReactNode;
}

export function LayoutShell({
  activePage,
  onNavigate,
  locations,
  selectedLocationId,
  onSelectLocation,
  pdfUrl,
  children,
}: LayoutShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeNav = NAV_ITEMS.find((item) => item.id === activePage) ?? NAV_ITEMS[0];
  const selectedSummary =
    locations.find((s) => s.location.id === selectedLocationId) ?? locations[0] ?? null;

  const handleNavClick = (id: NavPageId) => {
    onNavigate(id);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#0B1F3A] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-[#E2E8F0] z-30">
        <div className="px-6 py-5 border-b border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => handleNavClick('overview')}
            className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] rounded-md"
          >
            <svg
              viewBox="0 0 32 32"
              className="w-8 h-8 shrink-0"
              aria-hidden="true"
            >
              <rect width="32" height="32" rx="8" fill="#0B1F3A" />
              <path
                d="M16 6C16 6 9.5 13.4 9.5 18.2C9.5 21.95 12.41 25 16 25C19.59 25 22.5 21.95 22.5 18.2C22.5 13.4 16 6 16 6Z"
                fill="#0D9488"
              />
              <path
                d="M12.2 19.3C13.5 18.2 14.9 18.2 16 19.1C17.1 20 18.5 20 19.8 19.1"
                stroke="#FAF9F5"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-[#0B1F3A] whitespace-nowrap">
                JalDrishti AI
              </div>
              <div className="text-[11px] text-[#627D98] leading-tight">
                Water Intelligence
              </div>
            </div>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePage;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] ${
                  isActive
                    ? 'bg-[#0D9488]/10 text-[#0F766E]'
                    : 'text-[#334E68] hover:bg-[#F2EFE9] hover:text-[#0B1F3A]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#0D9488]' : 'text-[#627D98]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2E8F0] bg-[#FAF9F5]/60">
          <div className="flex items-center gap-2 text-xs font-medium text-[#0B1F3A]">
            <Compass className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
            <span>Open Innovation 2026</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#627D98]">
            See the Risk. Predict the Shortage. Protect Every Drop.
          </p>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0B1F3A]/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-[#E2E8F0] flex flex-col z-10">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <span className="font-display text-base font-bold text-[#0B1F3A]">
                JalDrishti AI
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 text-[#334E68] hover:text-[#0B1F3A] rounded-md"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activePage;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#0D9488]/10 text-[#0F766E]'
                        : 'text-[#334E68] hover:bg-[#F2EFE9]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-[#FAF9F5]/95 backdrop-blur-sm border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 -ml-2 text-[#334E68] hover:text-[#0B1F3A] rounded-lg border border-[#E2E8F0] bg-white"
                aria-label="Open navigation menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="text-xs text-[#627D98] flex items-center gap-2 truncate">
                  <span>JalDrishti AI</span>
                  <span aria-hidden="true">/</span>
                  <span className="text-[#0B1F3A] font-medium truncate">{activeNav.label}</span>
                </div>
                {selectedSummary && (
                  <div className="text-[11px] text-[#627D98] truncate mt-0.5">
                    <span>{selectedSummary.location.basin}</span>
                    <span aria-hidden="true" className="mx-1.5">·</span>
                    <span>{formatSourceLabel(selectedSummary.location.sourceType)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {locations.length > 0 && (
                <label className="flex items-center gap-2">
                  <span className="sr-only">Select Monitored Location</span>
                  <select
                    value={selectedLocationId ?? locations[0]?.location.id ?? ''}
                    onChange={(e) => onSelectLocation(Number(e.target.value))}
                    className="h-9 px-3 text-xs sm:text-sm font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] max-w-[220px] truncate"
                  >
                    {locations.map((item) => (
                      <option key={item.location.id} value={item.location.id}>
                        {item.location.name} ({item.location.state})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <a
                href={pdfUrl}
                className="inline-flex items-center gap-2 h-9 px-4 text-xs sm:text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#16325B] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
              >
                <FileDown className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Download PDF Report</span>
                <span className="sm:hidden">PDF</span>
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        <footer className="border-t border-[#E2E8F0] px-4 sm:px-8 py-4 bg-white/60">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[#627D98]">
            <span>
              JalDrishti AI · PromptWars x Techverse Solutions 2026 (Open Innovation)
            </span>
            <span>
              Data integrity notice: Built-in stations use simulated regional demonstration profiles unless replaced or extended via CSV upload.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

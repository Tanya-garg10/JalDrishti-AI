import React, { useState } from 'react';
import { AlertCircle, Send, User } from 'lucide-react';
import type { CopilotMessage, LocationSummary } from '../types/water';
import { api, formatSourceLabel } from '../lib/api';

interface CopilotViewProps {
  locations: LocationSummary[];
  selectedLocationId: number;
}

const SUGGESTED_QUESTIONS = [
  'Why is this location experiencing water stress?',
  'Explain the groundwater trend.',
  'What happens if rainfall decreases by 20%?',
  'Which conservation measures should be prioritized?',
  'Compare this location with the comparison station.',
  'Explain the Water Stress Index in simple Hindi.',
  "Summarize this location's water situation.",
];

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  mode?: 'gemini' | 'fallback';
  modelUsed?: string;
  errorNotice?: string;
}

function FormattedCopilotText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-[#0B1F3A]">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          return (
            <h4 key={i} className="font-display text-sm font-bold text-[#0B1F3A] pt-1">
              {trimmed.replace(/^#{2,3}\s+/, '')}
            </h4>
          );
        }
        // Simple inline bold parsing safely via React nodes (never dangerouslySetInnerHTML)
        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className={trimmed.startsWith('- ') || /^\d+\./.test(trimmed) ? 'pl-2' : ''}>
            {parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={pIdx} className="font-semibold text-[#0B1F3A]">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <React.Fragment key={pIdx}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function CopilotView({ locations, selectedLocationId }: CopilotViewProps) {
  const activeSummary =
    locations.find((l) => l.location.id === selectedLocationId) ?? locations[0] ?? null;

  const defaultCompare =
    locations.find((l) => l.location.id !== selectedLocationId)?.location.id ?? selectedLocationId;

  const [compareLocationId, setCompareLocationId] = useState<number>(defaultCompare);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatEntry = { role: 'user', content: trimmed };
    const nextHistory: CopilotMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await api.askCopilot({
        question: trimmed,
        locationId: selectedLocationId,
        compareLocationId,
        history: nextHistory.slice(0, -1),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply,
          mode: res.mode,
          modelUsed: res.modelUsed,
          errorNotice: res.errorNotice,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Copilot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="pb-6 border-b border-[#E2E8F0] flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-[#0F766E]">
            JalDrishti AI Copilot · Grounded Decision Intelligence
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
            Context-Aware Water Intelligence Assistant
          </h1>
          <p className="mt-1 text-sm text-[#334E68] max-w-2xl">
            Ask analytical questions grounded strictly in SQLite observations for{' '}
            <span className="font-semibold text-[#0B1F3A]">
              {activeSummary?.location.name ?? 'selected station'}
            </span>
            . Includes deterministic fallback if Gemini API is unavailable.
          </p>
        </div>

        {locations.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-[#334E68] shrink-0">
            <span>Compare against:</span>
            <select
              value={compareLocationId}
              onChange={(e) => setCompareLocationId(Number(e.target.value))}
              className="h-9 px-3 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0B1F3A]"
            >
              {locations
                .filter((l) => l.location.id !== selectedLocationId)
                .map((l) => (
                  <option key={l.location.id} value={l.location.id}>
                    {l.location.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Suggested Questions & Active Data Context */}
        <aside className="lg:col-span-4 space-y-5">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0B1F3A]">Suggested Questions</h2>
            <p className="text-xs text-[#627D98] mt-0.5 mb-3">
              Click any prompt to query live station context
            </p>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading}
                  onClick={() => void sendQuestion(q)}
                  className="w-full text-left px-3 py-2 text-xs text-[#0B1F3A] bg-[#FAF9F5] hover:bg-[#0D9488]/10 hover:text-[#0F766E] border border-[#E2E8F0] rounded-lg transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {activeSummary && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 text-xs space-y-2">
              <div className="font-semibold text-[#0B1F3A]">Grounded Station Context</div>
              <div className="text-[#334E68]">
                Station: <span className="font-medium text-[#0B1F3A]">{activeSummary.location.name}</span>
              </div>
              <div className="text-[#334E68]">
                Source: {formatSourceLabel(activeSummary.location.sourceType)}
              </div>
              <div className="text-[#334E68] font-mono tabular-nums">
                Stress: {activeSummary.stress.overallScore}/100 ({activeSummary.stress.riskCategory})
              </div>
              <div className="text-[#334E68] font-mono tabular-nums">
                Depth: {activeSummary.stress.currentDepthM?.toFixed(2) ?? 'N/A'} m bgl ({activeSummary.stress.depletionRateMPerYear.toFixed(2)} m/yr)
              </div>
              <div className="text-[#334E68] font-mono tabular-nums">
                Completeness: {activeSummary.stress.confidence.completenessPct}%
              </div>
            </div>
          )}
        </aside>

        {/* Conversation Panel */}
        <section className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl flex flex-col min-h-[540px]">
          <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[540px]">
            {messages.length === 0 && (
              <div className="py-12 text-center max-w-md mx-auto space-y-2">
                <div className="text-base font-semibold text-[#0B1F3A]">
                  Ready to analyze {activeSummary?.location.name}
                </div>
                <p className="text-xs text-[#627D98] leading-relaxed">
                  Select a suggested question on the left or ask your own question below. Responses cite verified station measurements and never fabricate missing readings.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-[82%] bg-[#0B1F3A] text-white px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
                    <span>{msg.content}</span>
                    <User className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
                  </div>
                ) : (
                  <div className="max-w-[92%] bg-[#FAF9F5] border border-[#E2E8F0] px-5 py-4 rounded-xl space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2E8F0] text-[11px] text-[#627D98]">
                      <span className="font-semibold text-[#0F766E]">
                        JalDrishti AI · {msg.mode === 'gemini' ? 'Gemini Powered' : 'Context-Grounded Fallback'}
                      </span>
                      <span className="font-mono">{msg.modelUsed}</span>
                    </div>
                    <FormattedCopilotText text={msg.content} />
                    {msg.errorNotice && (
                      <div className="pt-2 border-t border-[#E2E8F0] text-[11px] text-[#D97706] flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{msg.errorNotice}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="bg-[#FAF9F5] border border-[#E2E8F0] px-5 py-4 rounded-xl max-w-[75%] space-y-2 animate-pulse">
                <div className="h-3 w-40 bg-[#E2E8F0] rounded" />
                <div className="h-3 w-full bg-[#E2E8F0] rounded" />
                <div className="h-3 w-3/4 bg-[#E2E8F0] rounded" />
              </div>
            )}

            {error && (
              <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-lg text-xs text-[#DC2626]">
                {error}
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendQuestion(input);
            }}
            className="p-4 border-t border-[#E2E8F0] flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${activeSummary?.location.name ?? 'this location'} (English or Hindi)...`}
              className="flex-1 h-10 px-3.5 text-sm bg-[#FAF9F5] border border-[#CBD5E1] rounded-lg text-[#0B1F3A] placeholder:text-[#627D98] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-white bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

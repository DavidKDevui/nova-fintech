"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { useAssistant } from "@/providers/assistant-provider";

const TOOL_LABELS: Record<string, string> = {
  get_monthly_breakdown: "Analyse mensuelle",
  search_transactions: "Recherche de transactions",
  simulate_cotisations: "Simulation cotisations",
  get_fiscal_calendar: "Calendrier fiscal",
  get_care_summary: "Résumé facturation",
  project_treasury: "Projection trésorerie",
  get_latest_transaction: "Dernière transaction",
  get_category_totals: "Totaux par catégorie",
  get_recurring_transactions: "Transactions récurrentes",
  compare_periods: "Comparaison de périodes",
  get_rejected_invoices: "Factures rejetées",
  get_account_history: "Historique du compte",
  get_uncategorized_summary: "Transactions non catégorisées",
  get_patient_stats: "Statistiques patients",
  get_expense_anomalies: "Détection d'anomalies",
  get_account_details: "Détails du compte",
  get_health_score: "Score de santé financière",
  get_recommendations: "Recommandations personnalisées",
};

export function FloatingChat({ suggestions = [] }: { suggestions?: string[] }) {
  const { messages, input, setInput, loading, sendMessage, resetConversation } = useAssistant();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard pour createPortal côté client
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Floating button (only when closed) */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 hover:scale-105 active:scale-95 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.35" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="9" cy="10" r="1.2" fill="currentColor" />
            <circle cx="15" cy="10" r="1.2" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-3rem)] rounded-2xl bg-white shadow-2xl border border-ardoise-200/70 flex flex-col animate-fade-up-fast">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ardoise-200/70">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-100 text-brand-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  <circle cx="9" cy="10" r="1" fill="currentColor" opacity="0.7" />
                  <circle cx="15" cy="10" r="1" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-ardoise-900 leading-tight">Nova</p>
                <p className="text-[10px] text-ardoise-400 leading-tight">Assistant financier</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={resetConversation}
                  aria-label="Nouvelle conversation"
                  className="p-1.5 text-ardoise-400 hover:text-ardoise-700 hover:bg-ardoise-100 rounded-md transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" /></svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="p-1.5 text-ardoise-400 hover:text-ardoise-700 hover:bg-ardoise-100 rounded-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-ardoise-900">Bonjour, je suis Nova</p>
                  <p className="text-xs text-ardoise-400 mt-1">Comment puis-je vous aider ?</p>
                </div>
                {suggestions.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 w-full">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        className="text-left text-xs text-ardoise-600 bg-ardoise-50 hover:bg-ardoise-100 border border-ardoise-200/70 rounded-lg px-3 py-2 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] text-ardoise-400">
                          {msg.tools.map((t) => TOOL_LABELS[t] || t).join(", ")}
                        </span>
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                        msg.role === "user"
                          ? "bg-brand-600 text-white rounded-br-md"
                          : "bg-ardoise-100 text-ardoise-900 rounded-bl-md"
                      }`}
                    >
                      {msg.content ? (
                        msg.role === "assistant" ? (
                          <div className="prose prose-sm prose-gray max-w-none text-xs
                            [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs
                            [&_p]:my-1 [&_p]:leading-relaxed
                            [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5
                            [&_strong]:font-semibold [&_strong]:text-ardoise-900
                            [&_code]:bg-ardoise-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[10px]
                          ">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )
                      ) : (
                        <span className="inline-flex gap-1">
                          <span className="w-1.5 h-1.5 bg-ardoise-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 bg-ardoise-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 bg-ardoise-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-ardoise-200/70 p-3 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-lg border border-ardoise-200/70 bg-white px-3 py-2 text-xs text-ardoise-900 placeholder:text-ardoise-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent disabled:opacity-50"
              style={{ minHeight: "36px", maxHeight: "100px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "36px";
                target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              aria-label="Envoyer"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600 text-white transition-all hover:bg-brand-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

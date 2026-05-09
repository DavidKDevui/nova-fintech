"use client";

import { useEffect, useRef } from "react";
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
};

const SUGGESTIONS = [
  "Combien puis-je me verser ce mois-ci ?",
  "Suis-je à jour dans mes cotisations ?",
  "Puis-je partir en vacances 3 semaines en août ?",
  "Comment optimiser mes charges cette année ?",
];

export function AssistantClient() {
  const { messages, input, setInput, loading, sendMessage, resetConversation } = useAssistant();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleReset = () => {
    resetConversation();
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Assistant financier</h1>
          <p className="text-xs text-gray-400">Posez vos questions sur votre activité</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Nouvelle conversation
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto rounded-[15px] bg-white border border-gray-200/70 p-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 text-brand-600 mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  <circle cx="9" cy="10" r="1" fill="currentColor" opacity="0.7" />
                  <circle cx="15" cy="10" r="1" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">Bonjour, je suis Nova</p>
              <p className="text-xs text-gray-400 mt-1">Votre assistant financier. Comment puis-je vous aider ?</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="text-left text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200/70 rounded-lg px-4 py-3 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {msg.tools && msg.tools.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                    <span className="text-[10px] text-gray-400">
                      {msg.tools.map((t) => TOOL_LABELS[t] || t).join(", ")}
                    </span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-900 rounded-bl-md"
                  }`}
                >
                  {msg.content ? (
                    msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-gray max-w-none
                        [&_p]:my-1.5 [&_p]:leading-relaxed
                        [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1
                        [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-4 [&_h1]:mb-2
                        [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-2
                        [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_h3]:mb-1.5
                        [&_strong]:font-semibold [&_strong]:text-gray-900
                        [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
                        [&_hr]:my-3 [&_hr]:border-gray-200
                      ">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )
                  ) : (
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question..."
            rows={1}
            disabled={loading}
            className="w-full resize-none rounded-[15px] border border-gray-200/70 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent disabled:opacity-50"
            style={{ minHeight: "48px", maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "48px";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="flex items-center justify-center w-12 h-12 rounded-[15px] bg-brand-600 text-white transition-all hover:bg-brand-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}

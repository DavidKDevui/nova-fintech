"use client";

import { useState } from "react";
import { toast } from "sonner";
import { respondToSuggestion } from "@/actions/practice-links";
import { useData } from "@/providers/data-provider";

export function PracticeSuggestionBanner() {
  const { suggestions, setSuggestions, suggestionsLoading, refresh, refreshFacturation } = useData();
  const [responding, setResponding] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRespond(suggestionId: string, accept: boolean) {
    setResponding(suggestionId);
    const result = await respondToSuggestion(suggestionId, accept);

    if (result.error) {
      toast.error(result.error);
      setResponding(null);
      return;
    }

    const suggestion = suggestions.find((s) => s.suggestionId === suggestionId);
    if (accept) {
      toast.success(`Vous êtes maintenant lié au cabinet ${suggestion?.practiceName}`);
    }

    setSuggestions((prev) => prev.filter((s) => s.suggestionId !== suggestionId));
    setResponding(null);

    if (accept) {
      setRefreshing(true);
      await Promise.all([refresh(), refreshFacturation()]);
      setRefreshing(false);
    } else {
      refresh();
    }
  }

  if (suggestionsLoading || (suggestions.length === 0 && !refreshing)) return null;

  if (refreshing) {
    return (
      <div className="flex items-center justify-center gap-3 mb-6 bg-brand-50 rounded-lg px-6 py-4">
        <svg className="animate-spin h-5 w-5 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm font-medium text-brand-700">Mise à jour de vos données...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      {suggestions.map((suggestion) => (
        <div key={suggestion.suggestionId} className="bg-brand-50 border-none px-4 py-3 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="8" width="18" height="13" rx="2" fill="#FB923C" />
                  <path d="M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2H3z" fill="#EC6C12" />
                  <path d="M12 3L4 8h16L12 3z" fill="#FDBA74" />
                  <rect x="9" y="14" width="6" height="7" rx="1" fill="#FFF7ED" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-900">
                  Cabinet {suggestion.practiceName}
                </p>
                <p className="text-xs text-brand-700">
                  Confirmez pour accéder à vos données.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 ml-9 sm:ml-0">
              <button
                onClick={() => handleRespond(suggestion.suggestionId, false)}
                disabled={responding === suggestion.suggestionId}
                className="border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-700 rounded-md transition-all hover:bg-brand-100 active:scale-[0.98] disabled:opacity-50"
              >
                Non
              </button>
              <button
                onClick={() => handleRespond(suggestion.suggestionId, true)}
                disabled={responding === suggestion.suggestionId}
                className="bg-brand-600 px-2.5 py-1 text-xs font-medium text-white rounded-md transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50"
              >
                {responding === suggestion.suggestionId ? "..." : "Oui"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

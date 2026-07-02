"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchDestinations, type NavDestination } from "@/lib/nav-search-index";

// Recherche rapide de navigation (« command palette ») placée en bas de la
// sidebar. On tape un mot (ex. « cotisation sociale ») et on saute directement
// sur la page ou l'onglet correspondant. Raccourci : ⌘/Ctrl + K pour cibler le champ.

export function NavSearch({
  destinations,
  onNavigate,
}: {
  destinations: NavDestination[];
  /** Appelé après une navigation (ex. fermer le drawer mobile). */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchDestinations(query, destinations), [query, destinations]);
  const showDropdown = open && query.trim().length > 0;
  // Sélection bornée au nombre de résultats (évite un index périmé sans effet).
  const activeIndex = results.length ? Math.min(highlight, results.length - 1) : 0;

  // Fermeture au clic en dehors.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Raccourci clavier ⌘/Ctrl + K.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Maintient l'élément sélectionné visible lors de la navigation clavier.
  useEffect(() => {
    if (!showDropdown) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, showDropdown]);

  const go = useCallback(
    (d: NavDestination) => {
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
      onNavigate?.();
      router.push(d.href);
    },
    [router, onNavigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const d = results[activeIndex];
      if (d) go(d);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {showDropdown && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-ardoise-200 bg-white py-1 shadow-lg animate-fade-up-fast z-50">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-ardoise-400">
              Aucun résultat pour «&nbsp;{query.trim()}&nbsp;»
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto">
              {results.map((d, i) => (
                <li key={d.href} role="option" aria-selected={i === activeIndex}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => go(d)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      i === activeIndex ? "bg-violet-100" : "hover:bg-ardoise-50"
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-ardoise-800">{d.label}</span>
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ardoise-400">
                      {d.group}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardoise-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Rechercher…"
          aria-label="Rechercher une page ou un onglet"
          className="w-full rounded-lg border border-ardoise-200 bg-white py-2 pl-9 pr-12 text-sm text-ardoise-900 placeholder:text-ardoise-400 transition-all hover:border-ardoise-300 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {query.length === 0 && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-ardoise-200 bg-ardoise-50 px-1.5 py-0.5 text-[10px] font-medium text-ardoise-400">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
}

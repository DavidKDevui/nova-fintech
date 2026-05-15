"use client";

/**
 * Boutons CSV + PDF cohérents sur toutes les sections exportables.
 * Si onCsv ou onPdf est omis, le bouton correspondant n'est pas affiché.
 */
export function ExportButtons({
  onCsv,
  onPdf,
  disabled,
}: {
  onCsv?: () => void;
  onPdf?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {onCsv && (
        <button
          type="button"
          onClick={onCsv}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Exporter en CSV"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      )}
      {onPdf && (
        <button
          type="button"
          onClick={onPdf}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Exporter en PDF"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          PDF
        </button>
      )}
    </div>
  );
}

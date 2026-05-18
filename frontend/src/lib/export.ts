/**
 * Shared export utilities for CSV and PDF generation.
 */

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type PdfOptions = {
  /** Sous-titre affiché sous le titre principal (ex : "Année 2025"). */
  subtitle?: string;
  /** Image PNG (data URL) d'un chart à inclure au-dessus du tableau (ex : extraite via getChartImage). */
  chartImage?: string;
  /** Lignes d'en-tête (KPIs / résumé) affichées au-dessus du tableau, format clé/valeur. */
  summary?: Array<{ label: string; value: string }>;
  /** Note en bas de page (ex : précision sur les valeurs estimées). */
  footnote?: string;
};

/**
 * Capture un conteneur (chart Recharts ou autre) en PNG (data URL) via html2canvas-pro.
 * Plus fiable qu'une sérialisation SVG : préserve fidèlement le rendu visuel (couleurs, polices, etc.).
 * À appeler juste avant l'export pour capturer le rendu courant.
 */
export async function getChartImage(
  container: HTMLElement | null,
  options?: { scale?: number; background?: string },
): Promise<string | null> {
  if (!container) return null;
  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(container, {
    backgroundColor: options?.background ?? "#ffffff",
    scale: options?.scale ?? 2,
    useCORS: true,
  });
  return canvas.toDataURL("image/png");
}

export function downloadPDF(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  options: PdfOptions = {},
) {
  const { subtitle, chartImage, summary, footnote } = options;

  const summaryHtml = summary && summary.length > 0
    ? `<div class="summary">${summary
        .map((s) => `<div class="summary-item"><span class="summary-label">${s.label}</span><span class="summary-value">${s.value}</span></div>`)
        .join("")}</div>`
    : "";

  const chartHtml = chartImage
    ? `<div class="chart"><img src="${chartImage}" alt="" /></div>`
    : "";

  const tableHtml = headers.length > 0 ? `
    <table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  ` : "";

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #1a1a1f; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #9ca3af; margin-bottom: 20px; }
        .meta { font-size: 11px; color: #9ca3af; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; }
        .summary-item { display: flex; flex-direction: column; gap: 4px; }
        .summary-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        .summary-value { font-size: 14px; color: #111827; font-weight: 700; }
        .chart { margin-bottom: 24px; text-align: center; }
        .chart img { max-width: 100%; height: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
        tr:last-child td { border-bottom: none; }
        .footnote { margin-top: 16px; font-size: 10px; color: #9ca3af; font-style: italic; }
        @media print {
          body { padding: 16px; }
          .chart { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}
      <p class="meta">Exporté le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
      ${summaryHtml}
      ${chartHtml}
      ${tableHtml}
      ${footnote ? `<p class="footnote">${footnote}</p>` : ""}
    </body>
    </html>
  `;

  // Suffix le nom de fichier avec la date pour éviter l'écrasement.
  const _datedFilename = `${filename}_${new Date().toISOString().slice(0, 10)}`;
  void _datedFilename; // pour info, utilisé si on bascule vers une vraie génération PDF

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  document.body.appendChild(iframe);
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 1000);
  };
}

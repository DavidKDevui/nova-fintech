"use client";

import { useState, useRef, type DragEvent } from "react";
import { toast } from "sonner";
import { importBordereauAction, importNoemieAction, createPracticeFromBordereau } from "@/actions/bordereaux";
import type { ParsedCarePassage } from "@/lib/parsers/parse-rattrapages";
import type { ParsedNoemiePayment } from "@/lib/parsers/parse-noemie";

interface Practice {
  id: string;
  name: string;
  finess: string | null;
}

export function BordereauUpload({
  practices,
}: {
  practices: Practice[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [documentType, setDocumentType] = useState<"rattrapage" | "noemie" | null>(null);
  const [rows, setRows] = useState<ParsedCarePassage[]>([]);
  const [noemieRows, setNoemieRows] = useState<ParsedNoemiePayment[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedPractice, setSelectedPractice] = useState("");
  const [detectedCabinet, setDetectedCabinet] = useState("");
  const [detectedFiness, setDetectedFiness] = useState("");
  const [filterPractitioner, setFilterPractitioner] = useState("");
  const [showNewPractice, setShowNewPractice] = useState(false);
  const [newPracticeName, setNewPracticeName] = useState("");
  const [newPracticeFiness, setNewPracticeFiness] = useState("");
  const [creatingPractice, setCreatingPractice] = useState(false);
  const [practiceList, setPracticeList] = useState(practices);
  const [fileHash, setFileHash] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (f.type !== "application/pdf" && !f.name.endsWith(".pdf")) {
      toast.error("Format non supporte. Utilisez un fichier PDF.");
      return;
    }
    setFile(f);
    setRows([]);
    setNoemieRows([]);
    setDocumentType(null);
    setDetectedCabinet("");
    setDetectedFiness("");
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  async function handleParse() {
    if (!file) {
      toast.error("Ajoutez un fichier");
      return;
    }

    setParsing(true);

    let result;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/parse-statement", { method: "POST", body: formData });
      result = await response.json();
    } catch {
      toast.error("Erreur lors de l'analyse. Le fichier est peut-etre trop volumineux.");
      setParsing(false);
      return;
    }

    if (result.error) {
      toast.error(result.error);
      setParsing(false);
      return;
    }

    setFileHash(result.fileHash || "");

    if ("documentType" in result && result.documentType === "noemie" && "payments" in result) {
      setDocumentType("noemie");
      setNoemieRows(result.payments);
      setRows([]);
      setDetectedFiness("finess" in result ? (result.finess as string) || "" : "");

      // Auto-select practice by FINESS
      if ("finess" in result && result.finess) {
        const match = practiceList.find(
          (p) => p.finess === result.finess
        );
        if (match) {
          setSelectedPractice(match.id);
          setShowNewPractice(false);
        }
      }

      toast.success(`${result.payments.length} paiements detectes (Retours Noemie)`);
    } else if ("passages" in result && result.passages) {
      setDocumentType("rattrapage");
      setRows(result.passages);
      setNoemieRows([]);
      setDetectedCabinet("cabinetName" in result ? (result.cabinetName as string) || "" : "");

      // Auto-select practice if cabinet name matches
      if ("cabinetName" in result && result.cabinetName) {
        const match = practiceList.find(
          (p) => p.name.toLowerCase() === (result.cabinetName as string).toLowerCase()
        );
        if (match) {
          setSelectedPractice(match.id);
          setShowNewPractice(false);
        } else {
          setNewPracticeName(result.cabinetName as string);
          setShowNewPractice(true);
        }
      }

      toast.success(`${result.passages.length} passages detectes (Rattrapages)`);
    }

    setParsing(false);
  }

  async function handleImport() {
    if (!selectedPractice || selectedPractice === "__new__") {
      toast.error("Veuillez sélectionner un cabinet");
      return;
    }

    setImporting(true);

    let result;
    if (documentType === "noemie") {
      result = await importNoemieAction(selectedPractice, noemieRows, file?.name || "noemie.pdf", fileHash);
    } else {
      result = await importBordereauAction(selectedPractice, filteredRows, file?.name || "bordereau.pdf", fileHash);
    }

    if (result.error) {
      toast.error(result.error);
      setImporting(false);
      return;
    }

    const label = documentType === "noemie" ? "paiements" : "passages";
    let message = `${result.count} ${label} importes avec succes`;
    if (result.duplicateCount && result.duplicateCount > 0) {
      message += ` (${result.duplicateCount} doublons ignores)`;
    }
    toast.success(message);
    setRows([]);
    setNoemieRows([]);
    setDocumentType(null);
    setFile(null);
    setDetectedCabinet("");
    setDetectedFiness("");
    setSelectedPractice("");
    if (inputRef.current) inputRef.current.value = "";
    setImporting(false);
  }

  const filteredRows = rows.filter((row) => {
    if (filterPractitioner && row.practitioner !== filterPractitioner) return false;
    return true;
  });

  // Get unique practitioners from parsed rows
  const parsedPractitioners = [...new Set(rows.map((r) => r.practitioner))].sort();
  const hasData = rows.length > 0 || noemieRows.length > 0;

  return (
    <div className="space-y-6">
      {/* Zone d'upload */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Fichier</label>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-10 cursor-pointer transition-all ${
            dragging
              ? "border-blue-500 bg-blue-50/50"
              : file
                ? "border-green-300 bg-green-50/30"
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {file ? (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><polyline points="16 13 12 17 8 13"/><line x1="12" y1="17" x2="12" y2="9"/></svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(file.size / 1024).toFixed(1)} Ko
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setRows([]);
                  setDetectedCabinet("");
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Retirer le fichier
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-blue-600">Cliquez pour choisir</span> ou glissez-deposez
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF uniquement</p>
              </div>
            </>
          )}
        </div>

        {/* Bouton analyser */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={!file || parsing}
            className="flex items-center gap-2 bg-blue-600 px-5 py-2.5 text-sm font-medium text-white rounded-md transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            {parsing ? "Analyse en cours..." : "Analyser le fichier"}
          </button>
        </div>
      </div>

      {/* Cabinet detecté + sélection */}
      {hasData && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Cabinet</h2>

          {detectedCabinet && (
            <p className="text-xs text-gray-500 mb-2">
              Cabinet detecte dans le PDF : <span className="font-medium text-gray-900">{detectedCabinet}</span>
            </p>
          )}
          {detectedFiness && (
            <p className="text-xs text-gray-500 mb-2">
              FINESS detecte : <span className="font-medium text-gray-900">{detectedFiness}</span>
            </p>
          )}

          <select
            value={selectedPractice}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__new__") {
                setSelectedPractice("__new__");
                setShowNewPractice(true);
              } else {
                setSelectedPractice(val);
                setShowNewPractice(false);
              }
            }}
            className="w-full border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Selectionner un cabinet...</option>
            {practiceList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.finess ? `(${p.finess})` : ""}
              </option>
            ))}
            <option value="__new__">+ Nouveau cabinet</option>
          </select>

          {showNewPractice && (
            <div className="mt-3 border border-gray-200/50 rounded-md p-4 bg-gray-50/30 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nom du cabinet</label>
                <input
                  type="text"
                  value={newPracticeName}
                  onChange={(e) => setNewPracticeName(e.target.value)}
                  placeholder="Ex: Balzano Celia"
                  className="w-full border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Numero FINESS</label>
                <input
                  type="text"
                  value={newPracticeFiness}
                  onChange={(e) => setNewPracticeFiness(e.target.value)}
                  placeholder="Ex: 136427150"
                  maxLength={9}
                  className="w-full border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={creatingPractice || !newPracticeName.trim() || !newPracticeFiness.trim()}
                onClick={async () => {
                  setCreatingPractice(true);
                  const result = await createPracticeFromBordereau(newPracticeName, newPracticeFiness);
                  if (result.error) {
                    toast.error(result.error);
                    setCreatingPractice(false);
                    return;
                  }
                  if (result.practice) {
                    setPracticeList((prev) => [...prev, { ...result.practice!, finess: result.practice!.finess }]);
                    setSelectedPractice(result.practice.id);
                    setShowNewPractice(false);
                    setNewPracticeName("");
                    setNewPracticeFiness("");
                    toast.success(`Cabinet "${result.practice.name}" créé`);
                  }
                  setCreatingPractice(false);
                }}
                className="flex items-center gap-2 bg-blue-600 px-4 py-2 text-sm font-medium text-white rounded-md transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingPractice ? "Création..." : "Créer le cabinet"}
              </button>
            </div>
          )}

          {!selectedPractice && !showNewPractice && rows.length > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Vous devez sélectionner ou créer un cabinet avant d&apos;importer.
            </p>
          )}
        </div>
      )}

      {/* Aperçu des données */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-sm font-medium text-gray-700">
            {documentType === "noemie" ? "Aperçu des paiements" : "Aperçu des passages"}
            {documentType === "noemie" && noemieRows.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">({noemieRows.length} lignes)</span>
            )}
            {documentType === "rattrapage" && filteredRows.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">({filteredRows.length} lignes)</span>
            )}
            {documentType && (
              <span className={`ml-2 inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${documentType === "noemie" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"}`}>
                {documentType === "noemie" ? "Retours Noemie" : "Rattrapages"}
              </span>
            )}
          </h2>
          {hasData && (
            <button
              onClick={handleImport}
              disabled={importing || !selectedPractice || selectedPractice === "__new__"}
              className="flex items-center gap-2 bg-green-600 px-4 py-2 text-sm font-medium text-white rounded-md transition-all hover:bg-green-700 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {importing ? "Import en cours..." : "Importer"}
            </button>
          )}
        </div>

        {/* Filtres rattrapages */}
        {documentType === "rattrapage" && hasData && (
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select
              value={filterPractitioner}
              onChange={(e) => setFilterPractitioner(e.target.value)}
              className="border border-gray-200/50 bg-white/50 px-3 py-2 text-sm rounded-md backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Tous les praticiens ({parsedPractitioners.length})</option>
              {parsedPractitioners.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            <p className="mt-3 text-sm">Aucune donnée à afficher</p>
            <p className="text-xs mt-1">Importez un bordereau pour voir l&apos;apercu ici</p>
          </div>
        ) : documentType === "noemie" ? (
          <>
            {/* Noémie summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-gray-50/50 rounded-md p-3">
                <p className="text-xs text-gray-500">Facture</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(noemieRows.reduce((s, r) => s + parseFloat(r.amountBilled), 0))}
                </p>
              </div>
              <div className="bg-green-50/50 rounded-md p-3">
                <p className="text-xs text-green-600">Paye</p>
                <p className="text-sm font-bold text-green-700">
                  {formatCurrency(noemieRows.filter((r) => r.status === "paid").reduce((s, r) => s + parseFloat(r.amountPaid), 0))}
                </p>
              </div>
              <div className="bg-red-50/50 rounded-md p-3">
                <p className="text-xs text-red-600">Rejete</p>
                <p className="text-sm font-bold text-red-700">
                  {formatCurrency(noemieRows.filter((r) => r.status === "rejected").reduce((s, r) => s + parseFloat(r.amountBilled), 0))}
                </p>
                <p className="text-xs text-gray-400">{noemieRows.filter((r) => r.status === "rejected").length} rejet{noemieRows.filter((r) => r.status === "rejected").length > 1 ? "s" : ""}</p>
              </div>
              <div className="bg-gray-50/50 rounded-md p-3">
                <p className="text-xs text-gray-500">Ecart</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(noemieRows.reduce((s, r) => s + parseFloat(r.amountBilled) - parseFloat(r.amountPaid), 0))}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200/50 text-left text-gray-500">
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">N° facture</th>
                    <th className="px-3 py-3 font-medium">Patient</th>
                    <th className="px-3 py-3 font-medium">Date paiement</th>
                    <th className="px-3 py-3 font-medium">Statut</th>
                    <th className="px-3 py-3 font-medium text-right">Facture</th>
                    <th className="px-3 py-3 font-medium text-right">Paye</th>
                  </tr>
                </thead>
                <tbody>
                  {noemieRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100/50 last:border-0 hover:bg-white/40">
                      <td className="px-3 py-3 text-gray-500">{row.invoiceType}</td>
                      <td className="px-3 py-3 font-medium">{row.invoiceNumber}</td>
                      <td className="px-3 py-3 text-gray-900">{row.clientName || "—"}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDateFr(row.paymentDate)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${row.status === "paid" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {row.status === "paid" ? "Paye" : "Rejete"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-right">{formatCurrency(parseFloat(row.amountBilled))}</td>
                      <td className="px-3 py-3 font-medium text-right">{formatCurrency(parseFloat(row.amountPaid))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Rattrapages summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <div className="bg-gray-50/50 rounded-md p-3">
                <p className="text-xs text-gray-500">Honoraires</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(filteredRows.reduce((s, r) => s + parseFloat(r.honoraires), 0))}
                </p>
              </div>
              <div className="bg-gray-50/50 rounded-md p-3">
                <p className="text-xs text-gray-500">Majoration</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(filteredRows.reduce((s, r) => s + parseFloat(r.majoration), 0))}
                </p>
              </div>
              <div className="bg-gray-50/50 rounded-md p-3">
                <p className="text-xs text-gray-500">Ferie/Dim/Nuit</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(filteredRows.reduce((s, r) => s + parseFloat(r.ferieDimNuit), 0))}
                </p>
              </div>
              <div className="bg-gray-50/50 rounded-md p-3">
                <p className="text-xs text-gray-500">IFD</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(filteredRows.reduce((s, r) => s + parseFloat(r.ifd), 0))}
                </p>
              </div>
              <div className="bg-blue-50/50 rounded-md p-3">
                <p className="text-xs text-blue-600">Total</p>
                <p className="text-sm font-bold text-blue-700">
                  {formatCurrency(filteredRows.reduce((s, r) => s + parseFloat(r.total), 0))}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200/50 text-left text-gray-500">
                    <th className="px-3 py-3 font-medium">Patient</th>
                    <th className="px-3 py-3 font-medium">N° facture</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Moment</th>
                    <th className="px-3 py-3 font-medium">Praticien</th>
                    <th className="px-3 py-3 font-medium">Cotation</th>
                    <th className="px-3 py-3 font-medium text-right">Honoraires</th>
                    <th className="px-3 py-3 font-medium text-right">Majoration</th>
                    <th className="px-3 py-3 font-medium text-right">Ferie/Dim/Nuit</th>
                    <th className="px-3 py-3 font-medium text-right">IFD</th>
                    <th className="px-3 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100/50 last:border-0 hover:bg-white/40">
                      <td className="px-3 py-3 text-gray-900">{row.clientName || "—"}</td>
                      <td className="px-3 py-3 font-medium">{row.invoiceNumber}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDateFr(row.careDate)}</td>
                      <td className="px-3 py-3 text-gray-500">{row.careMoment}</td>
                      <td className="px-3 py-3 text-gray-500">{row.practitioner}</td>
                      <td className="px-3 py-3 text-gray-500">{row.cotation}</td>
                      <td className="px-3 py-3 text-gray-500 text-right">{formatCurrency(parseFloat(row.honoraires))}</td>
                      <td className="px-3 py-3 text-gray-500 text-right">{formatCurrency(parseFloat(row.majoration))}</td>
                      <td className="px-3 py-3 text-gray-500 text-right">{formatCurrency(parseFloat(row.ferieDimNuit))}</td>
                      <td className="px-3 py-3 text-gray-500 text-right">{formatCurrency(parseFloat(row.ifd))}</td>
                      <td className="px-3 py-3 font-medium text-right">{formatCurrency(parseFloat(row.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDateFr(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

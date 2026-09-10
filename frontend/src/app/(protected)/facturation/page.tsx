import { getFacturationData } from "@/actions/facturation";
import { FacturationClient } from "./client";

// Préchargement serveur, EN PROCESS : la liste complète des passages n'est
// plus transportée par le DataProvider (layout) à chaque chargement de l'app,
// elle n'est lue que sur cette page. Le bouton « Actualiser » de la barre de
// navigation fait un router.refresh() → nouveau rendu → données fraîches.
export default async function FacturationPage() {
  const result = await getFacturationData();
  const summary = "summary" in result ? (result.summary ?? null) : null;
  const passages = "passages" in result ? (result.passages ?? []) : [];
  return <FacturationClient passages={passages} summary={summary} />;
}

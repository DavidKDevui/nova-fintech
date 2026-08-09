// Le parcours Bridge revient toujours sur /callback/bridge — une seule URL, la seule
// whitelistée côté Bridge. Ce drapeau, posé avant l'ouverture de l'onglet, permet au
// callback de savoir s'il s'exécute dans l'onglet secondaire de l'onboarding (auquel
// cas il invite à refermer) ou dans l'onglet principal (retour vers /transactions).

const KEY = "actidec:bank-connect-from-onboarding";

// Un abandon en cours de parcours laisserait le drapeau en place : on le borne dans
// le temps pour qu'une connexion bancaire ultérieure ne soit pas prise pour un
// retour d'onboarding.
const MAX_AGE_MS = 30 * 60 * 1000;

export function markBankConnectFromOnboarding() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Stockage indisponible (navigation privée stricte) : le callback retombera sur
    // son comportement par défaut, sans casser la connexion.
  }
}

export function clearBankConnectFromOnboarding() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // idem
  }
}

// Consomme le drapeau : une lecture, puis suppression dans tous les cas.
export function consumeBankConnectFromOnboarding() {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);

    if (!raw) return false;

    return Date.now() - Number(raw) < MAX_AGE_MS;
  } catch {
    return false;
  }
}

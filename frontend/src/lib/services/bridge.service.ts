import { BRIDGE_CLIENT_ID, BRIDGE_CLIENT_SECRET, BRIDGE_API_URL } from "../env";

const BRIDGE_VERSION = "2025-01-15";

function baseHeaders() {
  return {
    "Client-Id": BRIDGE_CLIENT_ID,
    "Client-Secret": BRIDGE_CLIENT_SECRET,
    "Bridge-Version": BRIDGE_VERSION,
    "Content-Type": "application/json",
  };
}

function authHeaders(accessToken: string) {
  return {
    ...baseHeaders(),
    Authorization: `Bearer ${accessToken}`,
  };
}

const BRIDGE_TIMEOUT_MS = 30_000;
const MAX_PAGINATION_PAGES = 100;

async function bridgeFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);

  try {
    const url = path.startsWith("http") ? path : `${BRIDGE_API_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...baseHeaders(),
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Bridge API error ${res.status}: ${body}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── Users ──

export async function createUser(externalUserId: string) {
  const res = await fetch(`${BRIDGE_API_URL}/aggregation/users`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ external_user_id: externalUserId }),
  });

  // User already exists — find and return it
  if (res.status === 409) {
    return findUserByExternalId(externalUserId);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bridge API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<{ uuid: string; external_user_id: string }>;
}

async function findUserByExternalId(externalUserId: string) {
  const data = await bridgeFetch<{ resources: Array<{ uuid: string; external_user_id: string }> }>(
    "/aggregation/users",
  );
  const user = data.resources.find((u) => u.external_user_id === externalUserId);
  if (!user) throw new Error("Utilisateur Bridge introuvable");
  return user;
}

// ── Auth ──

export async function getAccessToken(bridgeUserUuid: string) {
  return bridgeFetch<{ access_token: string; expires_at: string }>(
    "/aggregation/authorization/token",
    {
      method: "POST",
      body: JSON.stringify({ user_uuid: bridgeUserUuid }),
    },
  );
}

// ── Connect ──

export async function createConnectSession(accessToken: string, userEmail: string, redirectUrl: string) {
  return bridgeFetch<{ id: string; url: string }>(
    "/aggregation/connect-sessions",
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        user_email: userEmail,
        country_code: "FR",
        account_types: "payment",
        callback_url: redirectUrl,
      }),
    },
  );
}

// ── Accounts ──

export async function listAccounts(accessToken: string, itemId?: number) {
  const params = new URLSearchParams();
  if (itemId) params.set("item_id", String(itemId));
  const query = params.toString() ? `?${params}` : "";

  return bridgeFetch<{ resources: Array<{
    id: number;
    item_id: number;
    name: string;
    balance: number;
    currency_code: string;
    iban: string | null;
    type: string;
    status: string;
  }> }>(
    `/aggregation/accounts${query}`,
    { headers: authHeaders(accessToken) },
  );
}

// ── Transactions ──

type BridgeTransaction = {
  id: number;
  account_id: number;
  amount: number;
  currency_code: string;
  date: string;
  description: string;
  clean_description: string;
  operation_type: string;
  category_id: number | null;
  updated_at: string;
};

type BridgeTransactionResponse = {
  resources: BridgeTransaction[];
  pagination: { next_uri: string | null };
};

export async function listTransactions(accessToken: string, since?: string) {
  const allTransactions: BridgeTransaction[] = [];
  const params = new URLSearchParams({ limit: "500" });
  if (since) params.set("since", since);

  let path: string | null = `/aggregation/transactions?${params}`;
  let pages = 0;

  while (path && pages < MAX_PAGINATION_PAGES) {
    const page: BridgeTransactionResponse = await bridgeFetch<BridgeTransactionResponse>(path, {
      headers: authHeaders(accessToken),
    });

    allTransactions.push(...page.resources);
    path = page.pagination.next_uri;
    pages++;
  }

  return { resources: allTransactions };
}

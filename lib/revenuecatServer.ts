import { enforceServerOnly } from "@/lib/serverOnlyGuard";

enforceServerOnly();

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v2";

type RevenueCatListResponse<T> = {
  items?: T[];
  next_page?: string | null;
};

type RevenueCatSubscriptionResponse = {
  id?: string;
  store?: string;
  status?: string;
  gives_access?: boolean;
  auto_renewal_status?: string;
  management_url?: string | null;
};

type RevenueCatApiErrorPayload = {
  message?: string;
};

export type RevenueCatSubscription = {
  id: string;
  store: string | null;
  status: string | null;
  givesAccess: boolean;
  autoRenewalStatus: string | null;
  managementUrl: string | null;
};

export class RevenueCatApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "RevenueCatApiError";
    this.statusCode = statusCode;
  }
}

function getRevenueCatConfig() {
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  const secretKey = process.env.REVENUECAT_SECRET_KEY?.trim();

  if (!projectId || !secretKey) {
    throw new Error("Missing REVENUECAT_PROJECT_ID or REVENUECAT_SECRET_KEY");
  }

  return { projectId, secretKey };
}

async function revenueCatFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { secretKey } = getRevenueCatConfig();
  const response = await fetch(`${REVENUECAT_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${secretKey}`,
      ...(init?.headers ?? {})
    }
  });

  const raw = await response.text();
  let payload: T | RevenueCatApiErrorPayload | null = null;

  if (raw) {
    try {
      payload = JSON.parse(raw) as T | RevenueCatApiErrorPayload;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (payload as RevenueCatApiErrorPayload | null)?.message ??
      `RevenueCat request failed with status ${response.status}.`;
    throw new RevenueCatApiError(message, response.status);
  }

  return payload as T;
}

export async function listRevenueCatSubscriptions(
  customerId: string
): Promise<RevenueCatSubscription[]> {
  const { projectId } = getRevenueCatConfig();
  let path = `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(
    customerId
  )}/subscriptions`;
  const subscriptions: RevenueCatSubscription[] = [];

  while (path) {
    const response = await revenueCatFetch<RevenueCatListResponse<RevenueCatSubscriptionResponse>>(
      path
    );

    for (const item of response.items ?? []) {
      if (!item.id) {
        continue;
      }

      subscriptions.push({
        id: item.id,
        store: item.store ?? null,
        status: item.status ?? null,
        givesAccess: item.gives_access === true,
        autoRenewalStatus: item.auto_renewal_status ?? null,
        managementUrl: item.management_url ?? null
      });
    }

    const nextPage = response.next_page;
    if (!nextPage) {
      path = "";
      continue;
    }

    const parsed = new URL(nextPage, REVENUECAT_API_BASE);
    path = `${parsed.pathname}${parsed.search}`;
  }

  return subscriptions;
}

export async function cancelRevenueCatWebBillingSubscription(subscriptionId: string) {
  const { projectId } = getRevenueCatConfig();
  await revenueCatFetch(
    `/projects/${encodeURIComponent(projectId)}/subscriptions/${encodeURIComponent(
      subscriptionId
    )}/actions/cancel`,
    {
      method: "POST"
    }
  );
}

export async function deleteRevenueCatCustomer(customerId: string) {
  const { projectId } = getRevenueCatConfig();
  await revenueCatFetch(
    `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(customerId)}`,
    {
      method: "DELETE"
    }
  );
}

import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import type { OrgPlan } from "@/lib/types";

enforceServerOnly();

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v2";

// Project-scoped entitlement IDs from RevenueCat dashboard (project
// proj39ead10c). Verified live via list-entitlements MCP on 2026-05-08.
// Stable per-project; if entitlements are recreated under different IDs
// these constants must be updated in lock-step with the dashboard.
const RC_ENTITLEMENT_ID_BUSINESS = "entl4353fa7d61";
const RC_ENTITLEMENT_ID_TEAM = "entlcac5098bbd";

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

type RevenueCatActiveEntitlementResponse = {
  object?: string;
  entitlement_id?: string;
  expires_at?: number | null;
};

type RevenueCatCustomerPurchaseResponse = {
  id?: string;
  object?: string;
  store?: string | null;
  store_purchase_identifier?: string | null;
  original_store_purchase_identifier?: string | null;
  store_product_identifier?: string | null;
  product_id?: string | null;
  status?: string | null;
  refunded_at?: number | null;
  purchased_at?: number | null;
  is_sandbox?: boolean | null;
};

export type RevenueCatCustomerPurchase = {
  id: string;
  storeTransactionIdentifier: string | null;
  originalStoreTransactionIdentifier: string | null;
  storeProductIdentifier: string | null;
  productId: string | null;
  status: string | null;
  refundedAt: number | null;
  purchasedAt: number | null;
  isSandbox: boolean | null;
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

/**
 * Returns the highest active subscription plan for the customer per
 * RevenueCat's `active_entitlements` ledger. The customerId here is the
 * org_id (matches the mobile app's `Purchases.configure({ appUserID: orgId })`
 * and the RC webhook's `resolveOrgId` of `event.app_user_id`).
 *
 * Server-side IAP verification: never trust mobile-supplied plan claims.
 * Always hit RC and use what RC says is active.
 *
 * Returns null if RC has no business/team entitlement currently active.
 * Throws RevenueCatApiError on transport / auth / 4xx; throws Error if
 * REVENUECAT_PROJECT_ID / REVENUECAT_SECRET_KEY are missing.
 */
export async function getRevenueCatActivePlanForCustomer(
  customerId: string
): Promise<OrgPlan | null> {
  const { projectId } = getRevenueCatConfig();
  let path = `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(
    customerId
  )}/active_entitlements`;

  let hasBusiness = false;
  let hasTeam = false;

  while (path) {
    const response = await revenueCatFetch<
      RevenueCatListResponse<RevenueCatActiveEntitlementResponse>
    >(path);

    for (const item of response.items ?? []) {
      if (item.entitlement_id === RC_ENTITLEMENT_ID_BUSINESS) hasBusiness = true;
      else if (item.entitlement_id === RC_ENTITLEMENT_ID_TEAM) hasTeam = true;
    }

    const nextPage = response.next_page;
    if (!nextPage) {
      path = "";
      continue;
    }
    const parsed = new URL(nextPage, REVENUECAT_API_BASE);
    path = `${parsed.pathname}${parsed.search}`;
  }

  if (hasBusiness) return "BUSINESS";
  if (hasTeam) return "TEAM";
  return null;
}

/**
 * Lists the customer's purchases from RevenueCat (consumable / credit-pack
 * purchases live here under the `purchases` collection — separate from
 * recurring subscriptions). Used by /api/iap/sync to verify a mobile-
 * supplied Apple `transactionIdentifier` against RC's authoritative
 * ledger before granting credits server-side.
 */
export async function listRevenueCatCustomerPurchases(
  customerId: string
): Promise<RevenueCatCustomerPurchase[]> {
  const { projectId } = getRevenueCatConfig();
  let path = `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(
    customerId
  )}/purchases`;

  const purchases: RevenueCatCustomerPurchase[] = [];

  while (path) {
    const response = await revenueCatFetch<
      RevenueCatListResponse<RevenueCatCustomerPurchaseResponse>
    >(path);

    for (const item of response.items ?? []) {
      if (!item.id) continue;
      purchases.push({
        id: item.id,
        storeTransactionIdentifier: item.store_purchase_identifier ?? null,
        originalStoreTransactionIdentifier:
          item.original_store_purchase_identifier ?? null,
        storeProductIdentifier: item.store_product_identifier ?? null,
        productId: item.product_id ?? null,
        status: item.status ?? null,
        refundedAt: item.refunded_at ?? null,
        purchasedAt: item.purchased_at ?? null,
        isSandbox: item.is_sandbox ?? null
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

  return purchases;
}

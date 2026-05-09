/**
 * Wrapper enforcing an explicit `org_id` filter on admin-client queries.
 *
 * The Supabase admin client uses the service-role key, which BYPASSES
 * row-level security. RLS is the primary tenant-isolation guarantee for
 * the rest of the codebase — when admin-client code reads from a
 * tenant-scoped table without an `.eq('org_id', orgId)` filter, it can
 * accidentally return rows belonging to other organizations.
 *
 * This helper makes the filter mandatory and visible at the call site.
 *
 * Convention (Audit 8 M5):
 *   ANY admin-client SELECT/UPDATE/DELETE against a tenant-scoped table
 *   (leads, customers, quotes, lead_unlocks, lead_photos, contractor_profile,
 *   notifications, audit_log, etc.) MUST go through `requireOrgFilter` OR
 *   include an explicit `.eq('org_id', orgId)` chain. Reviewers should
 *   reject admin-client tenant-table access without one.
 *
 * Usage:
 *
 *   const admin = createAdminClient();
 *   const { data } = await requireOrgFilter(
 *     admin.from("leads").select("id, status"),
 *     orgId
 *   ).single();
 */

// Supabase's PostgrestFilterBuilder generic chain is heavily nested — narrowing
// the generic here produces TS2589 ("Type instantiation excessively deep").
// Using `any` for the query parameter and `cast-through-unknown` on the result
// preserves the caller's chain-end inference (.single() etc.) while breaking
// the recursive type evaluation.
export function requireOrgFilter<Q>(query: Q, orgId: string): Q {
  if (!orgId || typeof orgId !== "string") {
    throw new Error("requireOrgFilter: orgId must be a non-empty string");
  }
  return (query as any).eq("org_id", orgId) as Q;
}

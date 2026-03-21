import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: Request) {
  const auth = await requireOwnerForApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim() ?? "";

  if (!slug || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ available: false });
  }

  const admin = createAdminClient();
  const [{ data: matchingOrg }, { data: matchingProfile }] = await Promise.all([
    admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .neq("id", auth.orgId)
      .maybeSingle(),
    admin
      .from("contractor_profile")
      .select("org_id")
      .eq("public_slug", slug)
      .neq("org_id", auth.orgId)
      .maybeSingle()
  ]);

  return NextResponse.json({
    available: !matchingOrg && !matchingProfile
  });
}

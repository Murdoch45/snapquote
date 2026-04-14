import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ONE_MINUTE = 60 * 1000;

export async function GET(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  // Cap slug-availability checks to prevent enumeration of taken slugs.
  // Any one org can check up to 30 slugs per minute (typing a slug character
  // by character with debounced requests well under that ceiling).
  if (!rateLimit(`check-slug:${auth.orgId}`, 30, ONE_MINUTE)) {
    return NextResponse.json(
      { available: false, error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

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

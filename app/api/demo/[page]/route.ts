import { NextResponse } from "next/server";
import { getDemoPageData } from "@/lib/demo/server";
import type { DemoPageId } from "@/lib/demo/shared";

export const dynamic = "force-dynamic";

const demoPages = new Set<DemoPageId>([
  "dashboard",
  "leads",
  "quotes",
  "customers",
  "analytics",
  "my-link",
  "plan",
  "team",
  "settings"
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page } = await params;

  if (!demoPages.has(page as DemoPageId)) {
    return NextResponse.json({ error: "Unknown demo page." }, { status: 404 });
  }

  try {
    const payload = await getDemoPageData(page as DemoPageId);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load demo data."
      },
      { status: 500 }
    );
  }
}

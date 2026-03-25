/**
 * Demo seed runner
 * 1. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.
 * 2. Optionally add DEMO_ORG_ID=<uuid> to keep the same demo org id across environments.
 * 3. Run: npm run seed:demo
 * 4. If DEMO_ORG_ID was blank, copy the printed org id into .env.local after the first run.
 */

import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_BUSINESS_NAME,
  DEMO_LOCATION_LABEL,
  DEMO_ORG_SLUG,
  DEMO_OWNER_NAME,
  DEMO_PLAN,
  DEMO_PUBLIC_SLUG,
  DEMO_USER_EMAIL
} from "../lib/demo/shared";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const BUSINESS_ADDRESS = "4120 N 7th Ave, Phoenix, AZ 85013";
const BUSINESS_PHONE = "+16025550900";
const RESET_DATE = new Date(Date.now() + 1000 * 60 * 60 * 24 * 24).toISOString();
const DEMO_SERVICES = [
  "Pressure Washing",
  "Lawn Care / Maintenance",
  "Landscaping / Installation",
  "Fence Installation / Repair",
  "Junk Removal"
] as const;

type QuoteSeed = {
  status: "SENT" | "VIEWED" | "ACCEPTED";
  amount: number;
  low: number;
  high: number;
  sentHoursAgo: number;
  viewedHoursAfterSent?: number;
  acceptedHoursAfterSent?: number;
};

type LeadSeed = {
  key: string;
  customerName: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  service: (typeof DEMO_SERVICES)[number];
  description: string;
  summary: string;
  answers: Record<string, string | string[]>;
  status: "NEW" | "QUOTED" | "ACCEPTED" | "ARCHIVED";
  unlocked: boolean;
  photoCount: number;
  travelMiles: number;
  estimateLow: number;
  estimateHigh: number;
  suggestedPrice: number;
  submittedHoursAgo: number;
  quote?: QuoteSeed;
};

const leadSeeds: LeadSeed[] = [
  {
    key: "arcadia-pressure",
    customerName: "Nina Alvarez",
    phone: "+16025550101",
    email: "nina.alvarez@example.com",
    address: "4021 E Monterosa St, Phoenix, AZ 85018",
    city: "Phoenix",
    service: "Pressure Washing",
    description: "Driveway and front walk have dark tire marks and oil staining.",
    summary: "Oil staining is concentrated near the driveway apron and front entry walk. Flat access keeps labor straightforward, but treatment time is needed for the darker spots.",
    answers: {
      pressure_washing_target: ["Driveway", "Patio or porch"],
      pressure_washing_size: "Medium area (~500-1,500 sq ft)",
      pressure_washing_condition: "Oil, rust, or deep stains",
      pressure_washing_access: "Easy access"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 4,
    travelMiles: 6.4,
    estimateLow: 285,
    estimateHigh: 395,
    suggestedPrice: 340,
    submittedHoursAgo: 20,
    quote: { status: "VIEWED", amount: 349, low: 285, high: 395, sentHoursAgo: 16, viewedHoursAfterSent: 2 }
  },
  {
    key: "mesa-lawn",
    customerName: "Derek Chen",
    phone: "+14805550102",
    email: "derek.chen@example.com",
    address: "2360 N Val Vista Dr, Mesa, AZ 85213",
    city: "Mesa",
    service: "Lawn Care / Maintenance",
    description: "Front and backyard are overgrown and need mowing plus edging before the weekend.",
    summary: "The property needs a one-time reset with mowing, edging, and cleanup across both yards. Growth is uneven but access is open, which keeps the visit efficient.",
    answers: {
      lawn_work_type: "Mowing and edging",
      lawn_area_size: "Medium yard (~2,000-5,000 sq ft)",
      lawn_condition: "Very overgrown",
      lawn_property_type: "Front and backyard"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 3,
    travelMiles: 12.1,
    estimateLow: 125,
    estimateHigh: 195,
    suggestedPrice: 160,
    submittedHoursAgo: 32,
    quote: { status: "SENT", amount: 165, low: 125, high: 195, sentHoursAgo: 24 }
  },
  {
    key: "tempe-fence",
    customerName: "Nina Alvarez",
    phone: "+16025550101",
    email: "nina.alvarez@example.com",
    address: "911 S College Ave, Tempe, AZ 85281",
    city: "Tempe",
    service: "Fence Installation / Repair",
    description: "Wood gate is sagging and one side panel needs repair after wind damage.",
    summary: "The gate hardware needs adjustment and one damaged section likely needs replacement. Material matching is straightforward, but the repair still needs a return-ready finish.",
    answers: {
      fence_work_type: "Fence repair",
      fence_material: "Wood",
      fence_scope: "One side (~25-75 linear ft)",
      fence_site: "Flat and clear",
      fence_repair_condition: "Moderate"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 2,
    travelMiles: 10.7,
    estimateLow: 420,
    estimateHigh: 680,
    suggestedPrice: 545,
    submittedHoursAgo: 50,
    quote: { status: "ACCEPTED", amount: 560, low: 420, high: 680, sentHoursAgo: 42, acceptedHoursAfterSent: 8 }
  },
  {
    key: "scottsdale-landscape",
    customerName: "Paula Gomez",
    phone: "+14805550103",
    email: "paula.gomez@example.com",
    address: "7845 E McDonald Dr, Scottsdale, AZ 85250",
    city: "Scottsdale",
    service: "Landscaping / Installation",
    description: "Front bed refresh with new rock, a few shrubs, and cleanup around the drip lines.",
    summary: "The front beds need a cosmetic refresh with fresh rock, shrub placement, and cleanup around existing irrigation. The layout is compact, but hauling old debris adds labor.",
    answers: {
      landscape_work_type: ["Rock or mulch installation", "New plants or garden beds"],
      landscape_area_size: "One side of yard (~500-1,500 sq ft)",
      landscape_job_type: "Refresh existing landscaping",
      landscape_materials: ["Mostly mulch or rock", "Mostly plants"],
      landscape_access: "Somewhat difficult"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 5,
    travelMiles: 11.3,
    estimateLow: 890,
    estimateHigh: 1380,
    suggestedPrice: 1125,
    submittedHoursAgo: 74,
    quote: { status: "VIEWED", amount: 1140, low: 890, high: 1380, sentHoursAgo: 64, viewedHoursAfterSent: 6 }
  },
  {
    key: "glendale-junk",
    customerName: "Jamal Brooks",
    phone: "+16235550104",
    email: "jamal.brooks@example.com",
    address: "6123 W Gardenia Ave, Glendale, AZ 85301",
    city: "Glendale",
    service: "Junk Removal",
    description: "Garage cleanup with old shelving, bags, and a broken grill.",
    summary: "Most items are boxed or stacked in the garage with a few heavier pieces mixed in. Loading is easy from the driveway, so the main variable is disposal volume.",
    answers: {
      junk_type: ["Household junk", "Furniture"],
      junk_amount: "Medium load (about half a trailer or small truck)",
      junk_location: "Garage or driveway",
      junk_heavy_items: "Yes, a few"
    },
    status: "NEW",
    unlocked: false,
    photoCount: 4,
    travelMiles: 14.4,
    estimateLow: 210,
    estimateHigh: 355,
    suggestedPrice: 290,
    submittedHoursAgo: 6
  },
  {
    key: "chandler-pressure",
    customerName: "Erin Castillo",
    phone: "+14805550105",
    email: "erin.castillo@example.com",
    address: "2970 W Pecos Rd, Chandler, AZ 85224",
    city: "Chandler",
    service: "Pressure Washing",
    description: "Pool deck and patio have algae buildup and need a brighter finish before guests arrive.",
    summary: "The pool deck has visible buildup around the edges and along the traffic path to the patio. Open access helps, but the slick areas need a careful treatment pass.",
    answers: {
      pressure_washing_target: ["Patio or porch"],
      pressure_washing_size: "Large area (~1,500-3,000 sq ft)",
      pressure_washing_condition: "Heavy staining or moss",
      pressure_washing_access: "Easy access"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 6,
    travelMiles: 18.3,
    estimateLow: 355,
    estimateHigh: 520,
    suggestedPrice: 445,
    submittedHoursAgo: 60,
    quote: { status: "ACCEPTED", amount: 465, low: 355, high: 520, sentHoursAgo: 54, acceptedHoursAfterSent: 10 }
  },
  {
    key: "gilbert-lawn",
    customerName: "Victor Singh",
    phone: "+14805550106",
    email: "victor.singh@example.com",
    address: "1625 E Williams Field Rd, Gilbert, AZ 85295",
    city: "Gilbert",
    service: "Lawn Care / Maintenance",
    description: "Recurring mow and edge quote needed for a large corner lot.",
    summary: "The corner lot is well maintained but wide open, so the recurring service is mostly a time-and-distance play. There is no major cleanup, which keeps the weekly visit predictable.",
    answers: {
      lawn_work_type: "Full lawn maintenance",
      lawn_area_size: "Large yard (~5,000-10,000 sq ft)",
      lawn_condition: "Well-maintained",
      lawn_property_type: "Front and backyard"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 3,
    travelMiles: 21.7,
    estimateLow: 145,
    estimateHigh: 225,
    suggestedPrice: 185,
    submittedHoursAgo: 90,
    quote: { status: "SENT", amount: 189, low: 145, high: 225, sentHoursAgo: 80 }
  },
  {
    key: "peoria-landscape",
    customerName: "Maria Ortega",
    phone: "+16235550107",
    email: "maria.ortega@example.com",
    address: "7310 W Deer Valley Rd, Peoria, AZ 85382",
    city: "Peoria",
    service: "Landscaping / Installation",
    description: "Backyard refresh with mulch, trimming, and a small planting bed around the patio.",
    summary: "The patio edge needs cleanup, mulch refresh, and a modest new bed to soften the yard. Access is decent, but material hauling to the backyard adds time.",
    answers: {
      landscape_work_type: ["Rock or mulch installation"],
      landscape_area_size: "One side of yard (~500-1,500 sq ft)",
      landscape_job_type: "Refresh existing landscaping",
      landscape_materials: ["Mostly mulch or rock"],
      landscape_access: "Somewhat difficult"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 4,
    travelMiles: 19.6,
    estimateLow: 760,
    estimateHigh: 1190,
    suggestedPrice: 945,
    submittedHoursAgo: 110,
    quote: { status: "VIEWED", amount: 975, low: 760, high: 1190, sentHoursAgo: 100, viewedHoursAfterSent: 7 }
  },
  {
    key: "surprise-pressure",
    customerName: "Luis Ramirez",
    phone: "+16235550108",
    email: "luis.ramirez@example.com",
    address: "15640 N Reems Rd, Surprise, AZ 85374",
    city: "Surprise",
    service: "Pressure Washing",
    description: "Sidewalk and driveway need cleanup after a recent dust storm.",
    summary: "Dust and runoff staining are spread across the driveway and front walk. The area is easy to access, so this job is mostly a straightforward surface clean.",
    answers: {
      pressure_washing_target: ["Driveway"],
      pressure_washing_size: "Medium area (~500-1,500 sq ft)",
      pressure_washing_condition: "Moderate buildup",
      pressure_washing_access: "Easy access"
    },
    status: "NEW",
    unlocked: false,
    photoCount: 2,
    travelMiles: 24.8,
    estimateLow: 225,
    estimateHigh: 320,
    suggestedPrice: 275,
    submittedHoursAgo: 28
  },
  {
    key: "tempe-junk",
    customerName: "Paula Gomez",
    phone: "+14805550103",
    email: "paula.gomez@example.com",
    address: "1800 E Apache Blvd, Tempe, AZ 85281",
    city: "Tempe",
    service: "Junk Removal",
    description: "Patio furniture, boxes, and yard debris need to be hauled off after a move.",
    summary: "The load mixes patio pieces, bagged debris, and stacked moving boxes. Most items are already outside, which keeps loading simple even with the larger volume.",
    answers: {
      junk_type: ["Household junk", "Yard debris"],
      junk_amount: "Large load (about a full trailer or truck load+)",
      junk_location: "Backyard or hard-to-reach area",
      junk_heavy_items: "Yes, a few"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 5,
    travelMiles: 10.1,
    estimateLow: 310,
    estimateHigh: 520,
    suggestedPrice: 425,
    submittedHoursAgo: 44,
    quote: { status: "ACCEPTED", amount: 439, low: 310, high: 520, sentHoursAgo: 36, acceptedHoursAfterSent: 5 }
  },
  {
    key: "mesa-fence",
    customerName: "Rachel Kim",
    phone: "+14805550109",
    email: "rachel.kim@example.com",
    address: "6110 E Brown Rd, Mesa, AZ 85205",
    city: "Mesa",
    service: "Fence Installation / Repair",
    description: "Two fence sections are leaning and the side gate no longer latches.",
    summary: "The repair is limited to two damaged sections plus gate alignment, so it stays well below a full replacement. Matching the existing material is straightforward from the photos.",
    answers: {
      fence_work_type: "Fence repair",
      fence_material: "Wood",
      fence_scope: "One side (~25-75 linear ft)",
      fence_site: "Some slope",
      fence_repair_condition: "Moderate"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 3,
    travelMiles: 16.5,
    estimateLow: 515,
    estimateHigh: 780,
    suggestedPrice: 640,
    submittedHoursAgo: 72,
    quote: { status: "SENT", amount: 655, low: 515, high: 780, sentHoursAgo: 66 }
  },
  {
    key: "phoenix-pressure-repeat",
    customerName: "Derek Chen",
    phone: "+14805550102",
    email: "derek.chen@example.com",
    address: "5115 N 16th St, Phoenix, AZ 85016",
    city: "Phoenix",
    service: "Pressure Washing",
    description: "Stucco courtyard and entry pad need a quick cleanup after landscaping work.",
    summary: "The cleanup is limited to the entry pad and courtyard walls where dirt splashed during recent yard work. Light staining keeps the quote modest and the crew time short.",
    answers: {
      pressure_washing_target: ["House exterior", "Patio or porch"],
      pressure_washing_size: "Small area (up to ~500 sq ft)",
      pressure_washing_condition: "Moderate buildup",
      pressure_washing_access: "Some obstacles"
    },
    status: "QUOTED",
    unlocked: true,
    photoCount: 2,
    travelMiles: 4.8,
    estimateLow: 195,
    estimateHigh: 290,
    suggestedPrice: 240,
    submittedHoursAgo: 14,
    quote: { status: "VIEWED", amount: 249, low: 195, high: 290, sentHoursAgo: 10, viewedHoursAfterSent: 1 }
  },
  {
    key: "goodyear-landscape",
    customerName: "Omar Salazar",
    phone: "+16235550110",
    email: "omar.salazar@example.com",
    address: "14625 W Indian School Rd, Goodyear, AZ 85395",
    city: "Goodyear",
    service: "Landscaping / Installation",
    description: "New rock border and cleanup around the mailbox and front path.",
    summary: "This is a small curb-appeal project with rock, edging, and light cleanup. The scope is compact, but material delivery still drives part of the cost.",
    answers: {
      landscape_work_type: ["Rock or mulch installation"],
      landscape_area_size: "Small section (up to ~500 sq ft)",
      landscape_job_type: "Refresh existing landscaping",
      landscape_materials: ["Mostly mulch or rock"],
      landscape_access: "Easy"
    },
    status: "NEW",
    unlocked: false,
    photoCount: 3,
    travelMiles: 21.4,
    estimateLow: 420,
    estimateHigh: 690,
    suggestedPrice: 560,
    submittedHoursAgo: 18
  },
  {
    key: "scottsdale-junk",
    customerName: "Tessa Monroe",
    phone: "+14805550111",
    email: "tessa.monroe@example.com",
    address: "9251 E Shea Blvd, Scottsdale, AZ 85260",
    city: "Scottsdale",
    service: "Junk Removal",
    description: "Office cleanout includes old chairs, monitors, and boxed supplies.",
    summary: "Most of the load is light commercial junk stacked near the suite entrance. The quote mainly depends on final truck volume and electronics disposal.",
    answers: {
      junk_type: ["Household junk", "Construction debris"],
      junk_amount: "Medium load (about half a trailer or small truck)",
      junk_location: "Inside the home",
      junk_heavy_items: "Yes, a few"
    },
    status: "ARCHIVED",
    unlocked: false,
    photoCount: 6,
    travelMiles: 15.9,
    estimateLow: 330,
    estimateHigh: 540,
    suggestedPrice: 430,
    submittedHoursAgo: 130
  },
  {
    key: "chandler-fence",
    customerName: "Victor Singh",
    phone: "+14805550106",
    email: "victor.singh@example.com",
    address: "4180 S Arizona Ave, Chandler, AZ 85248",
    city: "Chandler",
    service: "Fence Installation / Repair",
    description: "Rear corner fence section needs replacement where the posts shifted.",
    summary: "The corner section likely needs new posts and one replacement panel. The site is clean, but digging and resetting the corner keeps this above a simple repair.",
    answers: {
      fence_work_type: "Fence repair",
      fence_material: "Wood",
      fence_scope: "Small section (up to ~25 linear ft)",
      fence_site: "Flat and clear",
      fence_repair_condition: "Major"
    },
    status: "NEW",
    unlocked: false,
    photoCount: 4,
    travelMiles: 19.8,
    estimateLow: 610,
    estimateHigh: 920,
    suggestedPrice: 760,
    submittedHoursAgo: 9
  },
  {
    key: "phoenix-junk-backyard",
    customerName: "Rachel Kim",
    phone: "+14805550109",
    email: "rachel.kim@example.com",
    address: "3015 N 36th St, Phoenix, AZ 85018",
    city: "Phoenix",
    service: "Junk Removal",
    description: "Backyard shed cleanout with paint cans, broken shelving, and yard waste.",
    summary: "The shed cleanout mixes bulky debris with smaller disposal items. Access is decent through the side gate, but sorting the load adds a little extra labor.",
    answers: {
      junk_type: ["Household junk", "Yard debris"],
      junk_amount: "Small load (about a pickup load)",
      junk_location: "Backyard or hard-to-reach area",
      junk_heavy_items: "Yes, a few"
    },
    status: "QUOTED",
    unlocked: false,
    photoCount: 2,
    travelMiles: 6.1,
    estimateLow: 190,
    estimateHigh: 310,
    suggestedPrice: 250,
    submittedHoursAgo: 26
  }
];

function getServiceCategory(service: LeadSeed["service"]): string {
  if (service === "Pressure Washing") return "cleaning";
  if (service === "Lawn Care / Maintenance" || service === "Landscaping / Installation") return "softscape";
  if (service === "Fence Installation / Repair") return "fencing";
  return "demolition";
}

function buildPhotoDataUri(label: string, accent: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <rect width="800" height="600" fill="#f8fafc"/>
      <rect x="60" y="60" width="680" height="480" rx="36" fill="${accent}" opacity="0.18"/>
      <rect x="120" y="120" width="560" height="360" rx="28" fill="white"/>
      <text x="400" y="290" text-anchor="middle" fill="#0f172a" font-family="Arial, sans-serif" font-size="42" font-weight="700">${label}</text>
      <text x="400" y="338" text-anchor="middle" fill="#475569" font-family="Arial, sans-serif" font-size="24">SnapQuote demo photo</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isoHoursAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

async function findUserByEmail(email: string) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(`Unable to list auth users: ${error.message}`);
    }

    const user = data.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureDemoUser() {
  const existing = await findUserByEmail(DEMO_USER_EMAIL);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        full_name: DEMO_OWNER_NAME,
        is_demo: true
      }
    });
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_USER_EMAIL,
    password: `${crypto.randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: {
      full_name: DEMO_OWNER_NAME,
      is_demo: true
    }
  });

  if (error || !data.user) {
    throw new Error(`Unable to create demo user: ${error?.message ?? "Unknown error"}`);
  }

  return data.user;
}

async function resolveDemoOrgId() {
  const configuredOrgId = process.env.DEMO_ORG_ID?.trim();

  if (configuredOrgId) {
    const { data: existing } = await supabase
      .from("organizations")
      .select("id,name,slug")
      .eq("id", configuredOrgId)
      .maybeSingle();

    if (existing && existing.slug && existing.slug !== DEMO_ORG_SLUG && existing.name !== DEMO_BUSINESS_NAME) {
      throw new Error("DEMO_ORG_ID points to an organization that does not look like the SnapQuote demo org.");
    }

    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
      .from("organizations")
      .insert({
        id: configuredOrgId,
        name: DEMO_BUSINESS_NAME,
        slug: DEMO_ORG_SLUG,
        plan: DEMO_PLAN,
        monthly_credits: 86,
        bonus_credits: 12,
        credits_reset_at: RESET_DATE
      })
      .select("id")
      .single();

    if (error || !created?.id) {
      throw new Error(`Unable to create demo organization: ${error?.message ?? "Unknown error"}`);
    }

    return created.id as string;
  }

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", DEMO_ORG_SLUG)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({
      name: DEMO_BUSINESS_NAME,
      slug: DEMO_ORG_SLUG,
      plan: DEMO_PLAN,
      monthly_credits: 86,
      bonus_credits: 12,
      credits_reset_at: RESET_DATE
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(`Unable to create demo organization: ${error?.message ?? "Unknown error"}`);
  }

  return created.id as string;
}

async function resetDemoData(orgId: string) {
  await supabase.from("org_usage_monthly").delete().eq("org_id", orgId);
  await supabase.from("pending_invites").delete().eq("org_id", orgId);
  await supabase.from("customers").delete().eq("org_id", orgId);
  await supabase.from("leads").delete().eq("org_id", orgId);
}

async function main() {
  const demoUser = await ensureDemoUser();
  const orgId = await resolveDemoOrgId();

  await supabase
    .from("organizations")
    .update({
      name: DEMO_BUSINESS_NAME,
      slug: DEMO_ORG_SLUG,
      plan: DEMO_PLAN,
      monthly_credits: 86,
      bonus_credits: 12,
      credits_reset_at: RESET_DATE
    })
    .eq("id", orgId);

  await supabase.from("organization_members").upsert(
    {
      org_id: orgId,
      user_id: demoUser.id,
      role: "OWNER"
    },
    { onConflict: "org_id,user_id" }
  );

  await supabase.from("contractor_profile").upsert(
    {
      org_id: orgId,
      business_name: DEMO_BUSINESS_NAME,
      public_slug: DEMO_PUBLIC_SLUG,
      phone: BUSINESS_PHONE,
      email: DEMO_USER_EMAIL,
      business_address_full: BUSINESS_ADDRESS,
      business_lat: 33.496818,
      business_lng: -112.082642,
      services: [...DEMO_SERVICES],
      social_caption: `Need an estimate? ${DEMO_BUSINESS_NAME} makes it easy - just fill out a quick form and we'll get back to you as soon as possible. https://snapquote.app/${DEMO_PUBLIC_SLUG}`,
      notification_lead_sms: true,
      notification_lead_email: true,
      notification_accept_sms: true,
      notification_accept_email: false
    },
    { onConflict: "org_id" }
  );

  await resetDemoData(orgId);

  const unlockedLeadIds: string[] = [];
  const unlockedCustomerKeys = new Set<string>();

  for (const [index, seed] of leadSeeds.entries()) {
    const submittedAt = isoHoursAgo(seed.submittedHoursAgo);
    const serviceEstimate = {
      service: seed.service,
      lowEstimate: seed.estimateLow,
      highEstimate: seed.estimateHigh,
      scopeSummary: seed.summary
    };

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        org_id: orgId,
        contractor_slug_snapshot: DEMO_PUBLIC_SLUG,
        customer_name: seed.customerName,
        customer_phone: seed.phone,
        customer_email: seed.email,
        address_full: seed.address,
        services: [seed.service],
        description: seed.description,
        status: seed.status,
        submitted_at: submittedAt,
        job_city: seed.city,
        job_state: "AZ",
        pricing_region: "phoenix-metro",
        service_category: getServiceCategory(seed.service),
        travel_distance_miles: seed.travelMiles,
        ai_status: "ready",
        ai_job_summary: seed.summary,
        ai_estimate_low: seed.estimateLow,
        ai_estimate_high: seed.estimateHigh,
        ai_suggested_price: seed.suggestedPrice,
        ai_generated_at: new Date(new Date(submittedAt).getTime() + 2 * 60 * 1000).toISOString(),
        ai_service_estimates: [serviceEstimate],
        service_question_answers: [
          {
            service: seed.service,
            answers: seed.answers
          }
        ]
      })
      .select("id")
      .single();

    if (leadError || !lead?.id) {
      throw new Error(`Unable to create demo lead ${seed.key}: ${leadError?.message ?? "Unknown error"}`);
    }

    for (let photoIndex = 0; photoIndex < seed.photoCount; photoIndex += 1) {
      const accent = ["#2563EB", "#0EA5E9", "#16A34A", "#EA580C"][photoIndex % 4];
      await supabase.from("lead_photos").insert({
        lead_id: lead.id,
        org_id: orgId,
        storage_path: `${orgId}/demo/${seed.key}-${photoIndex + 1}.svg`,
        public_url: buildPhotoDataUri(`${seed.service} ${photoIndex + 1}`, accent)
      });
    }

    if (seed.unlocked) {
      unlockedLeadIds.push(lead.id);
      const customerKey = (seed.email ?? seed.phone).toLowerCase();

      await supabase.from("lead_unlocks").insert({
        org_id: orgId,
        lead_id: lead.id
      });

      if (!unlockedCustomerKeys.has(customerKey)) {
        unlockedCustomerKeys.add(customerKey);
        await supabase.from("customers").insert({
          org_id: orgId,
          name: seed.customerName,
          phone: seed.phone,
          email: seed.email,
          created_at: submittedAt
        });
      }
    }

    if (seed.quote) {
      const sentAt = isoHoursAgo(seed.quote.sentHoursAgo);
      await supabase.from("quotes").insert({
        org_id: orgId,
        lead_id: lead.id,
        public_id: `demo-rivera-${String(index + 1).padStart(2, "0")}`,
        price: seed.quote.amount,
        estimated_price_low: seed.quote.low,
        estimated_price_high: seed.quote.high,
        message: `Thanks for reaching out to ${DEMO_BUSINESS_NAME}. Based on the photos and details, the current estimate is ${seed.quote.amount}.`,
        status: seed.quote.status,
        sent_at: sentAt,
        viewed_at:
          seed.quote.viewedHoursAfterSent != null
            ? new Date(new Date(sentAt).getTime() + seed.quote.viewedHoursAfterSent * 60 * 60 * 1000).toISOString()
            : null,
        accepted_at:
          seed.quote.acceptedHoursAfterSent != null
            ? new Date(new Date(sentAt).getTime() + seed.quote.acceptedHoursAfterSent * 60 * 60 * 1000).toISOString()
            : null
      });
    }
  }

  const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  await supabase.from("org_usage_monthly").upsert(
    {
      org_id: orgId,
      month: currentMonth,
      quotes_sent_count: leadSeeds.filter((lead) => lead.quote).length,
      grace_used: false
    },
    { onConflict: "org_id,month" }
  );

  console.log("Demo seed complete:", {
    orgId,
    business: DEMO_BUSINESS_NAME,
    owner: DEMO_OWNER_NAME,
    email: DEMO_USER_EMAIL,
    location: DEMO_LOCATION_LABEL,
    unlockedLeads: unlockedLeadIds.length,
    totalLeads: leadSeeds.length,
    totalQuotes: leadSeeds.filter((lead) => lead.quote).length,
    nextStep: `Set DEMO_ORG_ID=${orgId} in .env.local`
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PublicBrandLink() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <Link
      href={user ? "/app" : "/"}
      className="rounded-xl transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <BrandLogo size="md" />
    </Link>
  );
}

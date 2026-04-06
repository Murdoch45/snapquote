"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PlanRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    void handleRedirect();

    async function handleRedirect() {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        const supabase = createClient();
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
      }

      const search = window.location.search;
      router.replace(`/app/plan${search}`);
    }
  }, [router]);

  return null;
}

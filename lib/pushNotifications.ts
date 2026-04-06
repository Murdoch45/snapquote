import { createAdminClient } from "@/lib/supabase/admin";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("contractor_profile")
    .select("expo_push_token")
    .eq("org_id", orgId)
    .single();

  const token = profile?.expo_push_token as string | null;

  if (!token) {
    return false;
  }

  return sendExpoPush(token, payload);
}

export async function sendExpoPush(
  token: string,
  payload: PushPayload
): Promise<boolean> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
        priority: "high"
      })
    });

    if (!response.ok) {
      console.error("Expo push failed:", response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Expo push error:", error);
    return false;
  }
}

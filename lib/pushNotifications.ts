import { createAdminClient } from "@/lib/supabase/admin";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Errors that mean the token is permanently invalid and should be removed.
// MessageRateExceeded and MessageTooBig are not terminal — don't delete on those.
const TERMINAL_PUSH_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
  "MismatchSenderId"
]);

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Sends a push notification to every registered device for an org. Removes
 * tokens that come back with a terminal error so dead devices stop wasting
 * Expo quota and stop masking real notification problems.
 */
export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload
): Promise<{ sent: number; cleanedUp: number }> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("org_id", orgId);

  if (error || !rows || rows.length === 0) {
    return { sent: 0, cleanedUp: 0 };
  }

  const tokens = rows
    .map((row) => (row.expo_push_token as string | null) ?? "")
    .filter(Boolean);

  if (tokens.length === 0) return { sent: 0, cleanedUp: 0 };

  const tickets = await sendBatch(tokens, payload);
  const deadTokens: string[] = [];
  let sent = 0;

  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      sent += 1;
    } else if (ticket.details?.error && TERMINAL_PUSH_ERRORS.has(ticket.details.error)) {
      const deadToken = tokens[index];
      if (deadToken) deadTokens.push(deadToken);
    }
  });

  if (deadTokens.length > 0) {
    const { error: deleteError } = await admin
      .from("push_tokens")
      .delete()
      .in("expo_push_token", deadTokens);
    if (deleteError) {
      console.error("Failed to clean up dead push tokens:", deleteError);
    }
  }

  return { sent, cleanedUp: deadTokens.length };
}

async function sendBatch(
  tokens: string[],
  payload: PushPayload
): Promise<ExpoTicket[]> {
  try {
    const messages = tokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: "default",
      priority: "high"
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(messages)
    });

    if (!response.ok) {
      console.error("Expo push HTTP error:", response.status);
      return tokens.map(() => ({ status: "error" as const }));
    }

    const json = (await response.json()) as { data?: ExpoTicket[] };
    return json.data ?? tokens.map(() => ({ status: "error" as const }));
  } catch (error) {
    console.error("Expo push request failed:", error);
    return tokens.map(() => ({ status: "error" as const }));
  }
}

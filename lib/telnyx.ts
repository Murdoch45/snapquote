import "server-only";

type SendQuoteSmsInput = {
  to: string;
  body: string;
};

const TELNYX_API_URL = "https://api.telnyx.com/v2/messages";
const TELNYX_FROM_NUMBER = "+17169938159";

function getTelnyxApiKey(): string {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TELNYX_API_KEY");
  }
  return apiKey;
}

export async function sendQuoteSms({ to, body }: SendQuoteSmsInput): Promise<string> {
  const apiKey = getTelnyxApiKey();

  const response = await fetch(TELNYX_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: TELNYX_FROM_NUMBER,
      to,
      text: body
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = JSON.stringify(errBody);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      `Telnyx send failed (${response.status} ${response.statusText}): ${detail}`
    );
  }

  const json = (await response.json()) as { data?: { id?: string } };
  return json.data?.id ?? "";
}

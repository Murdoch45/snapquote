// Phone-number normalization for outbound SMS.
//
// Telnyx (and every other A2P SMS provider) requires E.164 format —
// `+1XXXXXXXXXX` for US numbers, leading `+` and country code mandatory.
// Without it Telnyx returns 40310 "Invalid 'to' address" and the message
// never goes out. The lead-submit form historically accepted any free-
// form phone string ("4057619006", "(405) 761-9006", "405-761-9006",
// "+1 405 761 9006", etc.) and stored it verbatim in `leads.customer_phone`,
// so most rows were not E.164 — every contractor send-estimate-by-SMS
// against those leads silently failed with the email path still
// succeeding. Centralizing normalization here so every SMS-outbound site
// goes through one function.

/**
 * Normalize a free-form US phone string into E.164 (`+1XXXXXXXXXX`).
 * Returns null when the input cannot confidently be interpreted as a US
 * 10-digit number. Already-E.164 inputs (any country) are returned with
 * non-digit characters stripped except the leading `+`.
 *
 * Examples:
 *   "4057619006"       → "+14057619006"
 *   "(405) 761-9006"   → "+14057619006"
 *   "405-761-9006"     → "+14057619006"
 *   "+1 405 761 9006"  → "+14057619006"
 *   "1 405 761 9006"   → "+14057619006"
 *   "+447911123456"    → "+447911123456"   (already E.164, kept)
 *   "12345"            → null              (too short)
 *   ""                 → null
 *   null/undefined     → null
 */
export function toE164UsPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Already E.164-shaped (input started with +). Trust the country code,
  // just strip formatting characters. Length must be a plausible E.164
  // payload (7..15 digits per ITU-T E.164).
  if (trimmed.startsWith("+")) {
    if (digits.length < 7 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // 11 digits starting with 1 → US/Canada with country code, no plus.
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // 10 digits → US/Canada without country code. Default to +1.
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return null;
}

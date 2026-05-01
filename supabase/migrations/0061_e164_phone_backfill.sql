-- Normalize existing customer phone numbers to E.164.
--
-- Background: lib/validations.ts's leadSubmitSchema accepted any free-form
-- phone shape (regex `^[+\d().\-\s]{7,20}$`) and stored it verbatim. Every
-- contractor send-estimate-by-SMS against those leads silently failed
-- because Telnyx requires E.164 (`+1XXXXXXXXXX`). The companion code
-- change (`lib/phone.ts:toE164UsPhone`, applied at the validation transform
-- and at every SMS send site) ensures all NEW writes land in E.164. This
-- migration backfills the historical rows so the contractor's existing
-- leads can also receive SMS.
--
-- Pre-flight check (via Supabase MCP):
--   leads.customer_phone        — 3420 with phone, 3280 already E.164, 140 needing normalization
--   customers.phone             — 3399 with phone, 3271 already E.164, 128 needing normalization
--   contractor_profile.phone    — 5 with phone, 1 already E.164, 4 needing normalization
-- Every non-E.164 row is either 10 digits or 10 digits with formatting
-- (parens/hyphens/spaces) — all map cleanly to `+1XXXXXXXXXX`. No row
-- requires manual disambiguation.

-- leads.customer_phone
update leads
set customer_phone =
  case
    when length(regexp_replace(customer_phone, '\D', '', 'g')) = 10
      then '+1' || regexp_replace(customer_phone, '\D', '', 'g')
    when length(regexp_replace(customer_phone, '\D', '', 'g')) = 11
      and regexp_replace(customer_phone, '\D', '', 'g') like '1%'
      then '+' || regexp_replace(customer_phone, '\D', '', 'g')
    else customer_phone
  end
where customer_phone is not null
  and customer_phone <> ''
  and not (customer_phone ~ '^\+1\d{10}$');

-- customers.phone (separate table; same shape)
update customers
set phone =
  case
    when length(regexp_replace(phone, '\D', '', 'g')) = 10
      then '+1' || regexp_replace(phone, '\D', '', 'g')
    when length(regexp_replace(phone, '\D', '', 'g')) = 11
      and regexp_replace(phone, '\D', '', 'g') like '1%'
      then '+' || regexp_replace(phone, '\D', '', 'g')
    else phone
  end
where phone is not null
  and phone <> ''
  and not (phone ~ '^\+1\d{10}$');

-- contractor_profile.phone — used by notifyContractor to send new-lead and
-- estimate-accepted SMS to the contractor. Same normalization rule.
update contractor_profile
set phone =
  case
    when length(regexp_replace(phone, '\D', '', 'g')) = 10
      then '+1' || regexp_replace(phone, '\D', '', 'g')
    when length(regexp_replace(phone, '\D', '', 'g')) = 11
      and regexp_replace(phone, '\D', '', 'g') like '1%'
      then '+' || regexp_replace(phone, '\D', '', 'g')
    else phone
  end
where phone is not null
  and phone <> ''
  and not (phone ~ '^\+1\d{10}$');

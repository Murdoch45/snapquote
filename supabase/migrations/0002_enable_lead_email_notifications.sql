alter table contractor_profile
alter column notification_lead_email set default true;

update contractor_profile
set notification_lead_email = true
where notification_lead_email = false
  and nullif(trim(coalesce(email, '')), '') is not null;

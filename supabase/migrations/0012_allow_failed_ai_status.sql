alter table leads
drop constraint if exists leads_ai_status_check;

alter table leads
add constraint leads_ai_status_check check (ai_status in ('processing', 'ready', 'failed'));

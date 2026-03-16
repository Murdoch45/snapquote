alter table leads
add column if not exists ai_status text;

update leads
set ai_status = 'ready'
where ai_status is null;

alter table leads
alter column ai_status set default 'processing';

alter table leads
alter column ai_status set not null;

alter table leads
drop constraint if exists leads_ai_status_check;

alter table leads
add constraint leads_ai_status_check check (ai_status in ('processing', 'ready'));

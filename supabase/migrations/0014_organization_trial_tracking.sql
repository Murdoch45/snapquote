alter table organizations
add column if not exists has_used_trial boolean not null default false;

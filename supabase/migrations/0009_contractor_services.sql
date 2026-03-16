alter table contractor_profile
add column if not exists services text[] not null default '{}';

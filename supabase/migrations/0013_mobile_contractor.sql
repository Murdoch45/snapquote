alter table contractor_profile
add column if not exists mobile_contractor boolean not null default false;

update contractor_profile
set mobile_contractor = coalesce(mobile_contractor, false);

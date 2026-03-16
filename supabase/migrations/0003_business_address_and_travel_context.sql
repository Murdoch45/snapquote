alter table contractor_profile
add column if not exists business_address_full text,
add column if not exists business_address_place_id text,
add column if not exists business_lat double precision,
add column if not exists business_lng double precision,
add column if not exists travel_pricing_disabled boolean not null default false;

alter table leads
add column if not exists travel_distance_miles numeric;

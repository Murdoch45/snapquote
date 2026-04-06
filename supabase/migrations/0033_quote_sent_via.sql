-- Track which delivery channels were used when sending an estimate
alter table quotes add column sent_via text[] not null default '{}'::text[];

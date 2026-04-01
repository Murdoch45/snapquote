SELECT cron.schedule(
  'auto-archive-stale-leads',
  '0 2 * * *',
  $$
    UPDATE leads
    SET status = 'ARCHIVED'
    WHERE status = 'NEW'
    AND created_at < NOW() - INTERVAL '30 days';
  $$
);

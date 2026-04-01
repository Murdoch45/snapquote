SELECT cron.schedule(
  'auto-expire-stale-quotes',
  '0 3 * * *',
  $$
    UPDATE quotes
    SET status = 'EXPIRED'
    WHERE status IN ('SENT', 'VIEWED')
    AND sent_at < NOW() - INTERVAL '7 days';
  $$
);

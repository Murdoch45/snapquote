ALTER TABLE quote_events ADD CONSTRAINT quote_events_quote_id_event_type_unique UNIQUE (quote_id, event_type);

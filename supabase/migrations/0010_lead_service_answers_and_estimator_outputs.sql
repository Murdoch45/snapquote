alter table leads
add column if not exists service_question_answers jsonb,
add column if not exists ai_service_estimates jsonb,
add column if not exists ai_pricing_drivers jsonb,
add column if not exists ai_estimator_notes jsonb;

notify pgrst, 'reload schema';

alter table leads
add column if not exists job_city text,
add column if not exists job_state text,
add column if not exists job_zip text,
add column if not exists pricing_region text,
add column if not exists house_sqft numeric,
add column if not exists estimated_backyard_sqft numeric,
add column if not exists service_category text,
add column if not exists job_type text,
add column if not exists terrain_classification text,
add column if not exists access_difficulty text,
add column if not exists material_tier text,
add column if not exists fence_linear_ft numeric,
add column if not exists ai_confidence text,
add column if not exists ai_cost_breakdown jsonb,
add column if not exists yard_layout jsonb,
add column if not exists demo_items jsonb;

alter table leads
drop constraint if exists leads_ai_confidence_check;

alter table leads
add constraint leads_ai_confidence_check
check (ai_confidence is null or ai_confidence in ('low', 'medium', 'high'));

alter table leads
drop constraint if exists leads_service_category_check;

alter table leads
add constraint leads_service_category_check
check (
  service_category is null
  or service_category in (
    'hardscape',
    'softscape',
    'fencing',
    'cleaning',
    'demolition',
    'grading',
    'pool',
    'deck',
    'irrigation',
    'other'
  )
);

alter table leads
drop constraint if exists leads_terrain_classification_check;

alter table leads
add constraint leads_terrain_classification_check
check (
  terrain_classification is null
  or terrain_classification in ('flat', 'mild_slope', 'moderate_slope', 'steep_slope')
);

alter table leads
drop constraint if exists leads_access_difficulty_check;

alter table leads
add constraint leads_access_difficulty_check
check (
  access_difficulty is null
  or access_difficulty in (
    'easy_access',
    'limited_side_yard_access',
    'backyard_only',
    'difficult_no_equipment_access'
  )
);

alter table leads
drop constraint if exists leads_material_tier_check;

alter table leads
add constraint leads_material_tier_check
check (
  material_tier is null
  or material_tier in ('basic', 'standard', 'premium')
);

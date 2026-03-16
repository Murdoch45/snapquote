alter table leads
drop constraint if exists leads_material_tier_check;

update leads
set material_tier = 'unknown'
where material_tier is not null
  and material_tier not in (
    'unknown',
    'concrete',
    'asphalt',
    'pavers',
    'brick',
    'stone'
  );

alter table leads
add constraint leads_material_tier_check
check (
  material_tier in (
    'unknown',
    'concrete',
    'asphalt',
    'pavers',
    'brick',
    'stone'
  )
);

alter table leads
drop constraint if exists leads_terrain_classification_check;

alter table leads
add constraint leads_terrain_classification_check
check (
  terrain_classification is null
  or terrain_classification in (
    'flat',
    'mild_slope',
    'moderate_slope',
    'steep_slope',
    'steep_hillside'
  )
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
    'difficult_no_equipment_access',
    'tight_access',
    'gated_estate'
  )
);

notify pgrst, 'reload schema';

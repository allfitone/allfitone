-- How Hevy names the movements of Allfit's catalogue (ADR-044).
--
-- A history imported from Hevy arrives with Hevy's exercise names, always in English,
-- with the equipment in parentheses. This table answers the names it can for everybody,
-- so a person reviews only what is left. It started from the 106 names of a real
-- 3.5-year export and grows by curation.
--
-- **Only exact equivalents.** A name is mapped when it is the same movement with the same
-- equipment, or a grip variant the catalogue does not separate (a neutral or close-grip
-- pulldown is still «Jalón al pecho»). A machine the catalogue does not have (hip
-- adduction, rear delt fly) stays unmapped: a wrong movement would put its sets into
-- somebody else's records, and an unmapped name only asks the person once.
--
-- Movements are matched by their curated Spanish name, and the script fails if any of
-- them is missing, so a rename in the catalogue cannot silently drop a mapping.
-- Rerunnable, like the rest of curation: runs as `postgres` after 001 and 003.

\set ON_ERROR_STOP on

begin;

create temporary table hevy_name (external_name text, movement_name text) on commit drop;
insert into hevy_name (external_name, movement_name) values
  ('Ab Wheel', 'Rueda abdominal'),
  ('Bench Press (Barbell)', 'Press de banca con barra'),
  ('Bench Press (Cable)', 'Press de pecho en polea'),
  ('Bench Press (Dumbbell)', 'Press de banca con mancuernas'),
  ('Bench Press (Machine)', 'Press de pecho en máquina'),
  ('Bench Press (Smith Machine)', 'Press de banca en multipower'),
  ('Bent Over Row (Barbell)', 'Remo con barra'),
  ('Bicep Curl (Cable)', 'Curl de bíceps en polea'),
  ('Bicep Curl (Dumbbell)', 'Curl de bíceps de pie con mancuernas'),
  ('Bulgarian Split Squat (Dumbbell)', 'Sentadilla búlgara'),
  ('Cable Fly Crossovers', 'Aperturas de pie en polea'),
  ('Cable Twist (Up to down)', 'Giro de pie en polea'),
  ('Calf Extension (Machine)', 'Prensa de gemelos'),
  ('Chest Dip', 'Fondos en paralelas'),
  ('Chest Fly (Machine)', 'Contractor de pecho'),
  ('Chest Press (Machine)', 'Press de pecho en máquina'),
  ('Chin Up', 'Dominada de bíceps'),
  ('Deadlift (Barbell)', 'Peso muerto convencional'),
  ('Decline Bench Press (Machine)', 'Press declinado en máquina'),
  ('Dumbbell Row', 'Remo con mancuerna'),
  ('EZ Bar Biceps Curl', 'Curl con barra Z'),
  ('Front Raise (Dumbbell)', 'Elevación frontal con mancuernas'),
  ('Full Squat', 'Sentadilla con barra'),
  ('Hack Squat (Machine)', 'Sentadilla hack en máquina'),
  ('Hip Thrust (Barbell)', 'Hip thrust'),
  ('Incline Bench Press (Dumbbell)', 'Press inclinado con mancuernas'),
  ('Incline Bench Press (Smith Machine)', 'Press inclinado en multipower'),
  ('Incline Chest Press (Machine)', 'Press inclinado en máquina'),
  ('Iso-Lateral Low Row', 'Remo sentado en máquina'),
  ('Iso-Lateral Row (Machine)', 'Remo sentado en máquina'),
  ('Lat Pulldown (Cable)', 'Jalón al pecho'),
  ('Lat Pulldown - Close Grip (Cable)', 'Jalón al pecho'),
  ('Lateral Raise (Dumbbell)', 'Elevaciones laterales'),
  ('Leg Extension (Machine)', 'Extensión de cuádriceps'),
  ('Leg Press (Machine)', 'Prensa de piernas'),
  ('Leg Press Horizontal (Machine)', 'Prensa tumbada'),
  ('Leg Raise', 'Elevación de piernas y cadera tumbado'),
  ('Lying Leg Curl (Machine)', 'Curl femoral'),
  ('Neutral Bench Press (Dumbbell)', 'Press de banca con mancuernas'),
  ('Neutral Lat Pulldown (Cable)', 'Jalón al pecho'),
  ('Neutral Shoulder Press (Dumbbell)', 'Press de hombro con mancuernas'),
  ('Preacher Curl (Dumbbell)', 'Curl predicador sentado con mancuerna'),
  ('Preacher Curl (Machine)', 'Curl predicador en máquina'),
  ('Pull Up', 'Dominadas'),
  ('Pull Up (Weighted)', 'Dominada con lastre'),
  ('Seated Cable Row - Bar Grip', 'Remo en polea baja'),
  ('Seated Cable Row - V Grip (Cable)', 'Remo en polea baja'),
  ('Seated Calf Raise', 'Elevación de gemelos sentado en máquina'),
  ('Seated Incline Curl (Dumbbell)', 'Curl inclinado con mancuernas'),
  ('Seated Leg Curl (Machine)', 'Curl femoral'),
  ('Seated Overhead Press (Barbell)', 'Press militar con barra'),
  ('Seated Shoulder Press (Machine)', 'Press de hombro en máquina'),
  ('Shoulder Press (Dumbbell)', 'Press de hombro con mancuernas'),
  ('Shrug (Barbell)', 'Encogimiento de hombros con barra'),
  ('Single Arm Lateral Raise (Cable)', 'Elevación lateral en polea'),
  ('Single Arm Triceps Pushdown (Cable)', 'Extensión de tríceps en polea'),
  ('Sissy Squat', 'Sentadilla sissy'),
  ('Skullcrusher (Barbell)', 'Extensión de tríceps tumbado con barra'),
  ('Spider Curl (Barbell)', 'Curl araña con barra Z'),
  ('Squat (Barbell)', 'Sentadilla con barra'),
  ('Squat (Smith Machine)', 'Sentadilla en multipower'),
  ('Standing Calf Raise (Machine)', 'Elevación de gemelos de pie en máquina'),
  ('Straight Arm Lat Pulldown (Cable)', 'Pullover en polea alta'),
  ('T Bar Row', 'Remo en máquina T-bar'),
  ('Triceps Dip', 'Fondos en paralelas'),
  ('Triceps Pressdown', 'Extensión de tríceps en polea'),
  ('Triceps Pushdown', 'Extensión de tríceps en polea'),
  ('Triceps Rope Pushdown', 'Extensión de tríceps en polea'),
  ('Unilateral Preacher Curl (Dumbbell)', 'Curl predicador sentado con mancuerna'),
  ('Unilateral Seated Cable Row', 'Remo en polea baja'),
  ('Unilateral Triceps Pushdown', 'Extensión de tríceps en polea'),
  ('Upright Row (Barbell)', 'Remo al mentón con barra'),
  ('Upright Row (Cable)', 'Remo al mentón en polea');

do $$
declare
  missing text;
begin
  select string_agg(row.movement_name, ', ') into missing
  from hevy_name as row
  where not exists (
    select 1 from catalog.movements as movement
    where movement.content_scope = 'global' and movement.status = 'published'
      and movement.name = row.movement_name);
  if missing is not null then
    raise exception 'Hevy names point at movements the catalogue does not have: %', missing;
  end if;
end
$$;

insert into catalog.external_movement_names (source, external_name, movement_id)
select 'hevy_csv', execution.external_name_key(row.external_name), movement.id
from hevy_name as row
join catalog.movements as movement
  on movement.name = row.movement_name and movement.content_scope = 'global'
 and movement.status = 'published'
on conflict (source, external_name) do update set movement_id = excluded.movement_id;

commit;

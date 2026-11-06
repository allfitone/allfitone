-- T-PRV-SCOPE-PRESENTATION-02 — `body_progress` dice lo que entrega (HU-BO-024, decisión 1).
--
-- Las reglas V1 de `body_progress` excluyen `body_photos`: no existe ninguna forma de
-- elegir qué fotos ve el gimnasio, así que incluirlas entregaría todas. El texto que la
-- persona lee prometía «las fotos que tú selecciones». Una persona que acepta creyendo
-- que comparte fotos acepta algo distinto de lo que pasa, aunque lo que pasa sea menos.
--
-- Lo que ya se envió no cambia: cada invitación congela el texto en su
-- `presented_snapshot`, y esta prueba no lo toca.

begin;

select plan(6);

insert into identity.people (id, given_name, family_name, status)
values ('019b2800-0000-7000-8000-000000000001', 'Camila', 'Coach', 'active');

set local role allfit_owner;

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019b2800-0000-7000-8000-000000000001', true);

select is(
  (select description from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'Medidas, composición corporal y tendencias. No incluye tus fotos, ni datos de salud.',
  'la descripción dice que las fotos no van'
);

select ok(
  (select description not ilike '%fotos que%' from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'y ya no promete fotos elegidas que nadie puede elegir'
);

-- La línea que lee quien invita carga el mismo límite: es la que decide qué se pide.
select is(
  (select summary from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'Medidas y composición corporal, sin fotos y sin datos de salud.',
  'el resumen de una línea tampoco promete fotos'
);

select is(
  (select display_name from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'Progreso corporal',
  'el nombre no cambia'
);

-- `list_offerable_scopes` lee la misma fila: lo que el gimnasio congela al invitar
-- desde hoy es el texto nuevo.
select is(
  (select count(*)::int from privacy.scope_presentations
   where description ilike '%fotos que tú selecciones%'
      or summary ilike '%fotos que elija%'),
  0,
  'ningún texto del catálogo promete fotos elegidas'
);

-- Las otras seis no se tocan.
select is(
  (select description from privacy.list_information_categories()
   where scope_code = 'nutrition_media'),
  'Las fotos que adjuntes a una comida. Requiere además que nos permitas ver lo que comes; por sí sola no muestra nada.',
  'las demás categorías dicen lo mismo que antes'
);

select * from finish();
rollback;

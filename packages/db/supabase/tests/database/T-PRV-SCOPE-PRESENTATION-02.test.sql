-- T-PRV-SCOPE-PRESENTATION-02 — `body_progress` says what it delivers (HU-BO-024 decision 1,
-- HU-SP-025 criterion 4).
--
-- Until she could choose, the V1 rules excluded `body_photos` and the words said no photo
-- went. Now she shows a gym one photo at a time (OP-IDN-061), the V1 rules include the
-- photos she shows and nothing else, and the words say exactly that: the photos she
-- chooses, never the rest of her gallery. A person who accepts must agree to what
-- happens, no more and no less.
--
-- What was already sent does not change: each invitation freezes its words in its
-- `presented_snapshot`, and this test does not touch it.

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
  'Medidas, composición corporal, tendencias y solo las fotos que tú elijas mostrarnos. No incluye el resto de tu galería, ni datos de salud.',
  'the description promises the photos she chooses to show'
);

select ok(
  (select description ilike '%No incluye el resto de tu galería%' from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'and says the rest of her gallery stays hers'
);

-- The line whoever invites reads carries the same limit: it is what decides what is asked.
select is(
  (select summary from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'Medidas y solo las fotos que elija mostrarte, sin datos de salud.',
  'the one-line summary carries the same limit'
);

select is(
  (select display_name from privacy.list_information_categories()
   where scope_code = 'body_progress'),
  'Progreso corporal',
  'the name does not change'
);

-- `list_offerable_scopes` reads the same row: what a gym freezes when it invites from now
-- on is the new text, and no line still promises photos chosen any other way.
select is(
  (select count(*)::int from privacy.scope_presentations
   where description ilike '%fotos que tú selecciones%'
      or description ilike '%No incluye tus fotos%'),
  0,
  'no text in the catalogue speaks of photos as before'
);

-- The others keep their words.
select is(
  (select description from privacy.list_information_categories()
   where scope_code = 'nutrition_media'),
  'Las fotos que adjuntes a una comida. Requiere además que nos permitas ver lo que comes; por sí sola no muestra nada.',
  'the other categories say what they said'
);

select * from finish();
rollback;

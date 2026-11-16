-- T-NUT-MEDIA-SWEEP-01 — HU-BO-033: a photo whose meal or measurement is gone leaves the
-- store even when nobody was there to remove it.
--
-- The API removes a photo right after the commit that disposes of it, and seals the
-- disposal. When the worker deletes a meal — a deletion a legal hold kept until it ended —
-- or when the store refused the API's removal, the disposal stayed queued and the photo
-- stayed in the store for good. The worker now sweeps both queues: it claims what has
-- waited long enough for the API to have had its turn, counts the attempt, waits longer
-- after each refusal, and seals what it removed. Nobody but the worker claims or seals.

begin;

select plan(12);

insert into identity.people (id, given_name, family_name, status)
values ('019ce000-0000-7000-8000-000000000006', 'Sara', 'Barrido', 'active');

insert into nutrition.media_disposals (id, person_id, media_ref, requested_at, sealed_at)
values
  ('019ce000-0000-7000-8000-000000000101', '019ce000-0000-7000-8000-000000000006',
    'nutrition/019ce000/due.jpg', clock_timestamp() - interval '10 minutes', null),
  ('019ce000-0000-7000-8000-000000000102', '019ce000-0000-7000-8000-000000000006',
    'nutrition/019ce000/fresh.jpg', clock_timestamp() - interval '1 minute', null),
  ('019ce000-0000-7000-8000-000000000103', '019ce000-0000-7000-8000-000000000006',
    'nutrition/019ce000/done.jpg', clock_timestamp() - interval '1 hour',
    clock_timestamp() - interval '59 minutes');

insert into identity.body_photo_disposals (id, person_id, media_ref, requested_at)
values ('019ce000-0000-7000-8000-000000000201', '019ce000-0000-7000-8000-000000000006',
  'body/019ce000-0000-7000-8000-000000000006/due.jpg', clock_timestamp() - interval '10 minutes');

-- Not a person, not even the one whose photos they are.
set local role allfit_api;
select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019ce000-0000-7000-8000-000000000006', true);

select throws_ok(
  $$ select * from nutrition.claim_media_disposals(10) $$,
  '42501', null,
  'a person does not sweep the photo queue'
);

select throws_ok(
  $$ select identity.seal_swept_body_photo_disposal('019ce000-0000-7000-8000-000000000201') $$,
  '42501', null,
  'nor seals one'
);

-- The worker.
select set_config('app.actor_kind', 'worker', true),
       set_config('app.actor_person_id', '', true);

select throws_ok(
  $$ select * from nutrition.claim_media_disposals(0) $$,
  '22023', null,
  'a sweep claims at least one photo'
);

create temporary table meal_claim on commit drop as
select * from nutrition.claim_media_disposals(10)
where id::text like '019ce000%';

select is(
  (select array_agg(media_ref order by media_ref) from meal_claim),
  array['nutrition/019ce000/due.jpg'],
  'the worker claims what waited long enough, not what the API may still be removing, nor what is sealed'
);

select is(
  (select purge_attempts from meal_claim),
  1,
  'and counts the attempt, so a photo the store keeps refusing is visible'
);

select is(
  (select count(*)::integer from nutrition.claim_media_disposals(10)
   where id = '019ce000-0000-7000-8000-000000000101'),
  0,
  'a photo just claimed waits its turn, so a refusal is not retried every minute'
);

-- Its turn comes.
reset role;
update nutrition.media_disposals
set next_attempt_at = clock_timestamp() - interval '1 second'
where id = '019ce000-0000-7000-8000-000000000101';
set local role allfit_api;

select is(
  (select purge_attempts from nutrition.claim_media_disposals(10)
   where id = '019ce000-0000-7000-8000-000000000101'),
  2,
  'then it is claimed again, one attempt more'
);

select ok(
  nutrition.seal_swept_media_disposal('019ce000-0000-7000-8000-000000000101'),
  'the worker seals what it removed'
);

reset role;
update nutrition.media_disposals
set next_attempt_at = clock_timestamp() - interval '1 second'
where id = '019ce000-0000-7000-8000-000000000101';
set local role allfit_api;

select is(
  (select count(*)::integer from nutrition.claim_media_disposals(10)
   where id = '019ce000-0000-7000-8000-000000000101'),
  0,
  'and a sealed disposal is never claimed again'
);

select ok(
  not coalesce(nutrition.seal_swept_media_disposal('019ce000-0000-7000-8000-000000000101'), false),
  'sealing twice does not move the moment it left the store'
);

select is(
  (select array_agg(media_ref) from identity.claim_body_photo_disposals(10)
   where id::text like '019ce000%'),
  array['body/019ce000-0000-7000-8000-000000000006/due.jpg'],
  'the body photo queue is swept the same way'
);

select ok(
  identity.seal_swept_body_photo_disposal('019ce000-0000-7000-8000-000000000201'),
  'and sealed by the worker'
);

reset role;

select * from finish();

rollback;

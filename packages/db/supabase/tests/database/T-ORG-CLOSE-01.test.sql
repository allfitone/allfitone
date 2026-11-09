-- T-ORG-CLOSE-01 — `HU-BO-017` is deferred, and this is what V1 asks of it.
--
-- The traceability matrix records the decision: **no platform closure distinct from the
-- closure governed by the owner**, to be reconsidered with legal policy. Its V1 scope is
-- `deferred`, its objects are "Sin objetos V1", and the obligation is to *prove the
-- absence* of DDL, permissions and routes rather than to build any of them.
--
-- An absence is only worth asserting if it would notice the thing appearing, so this
-- names what exists instead of guessing at names that do not. Any new relationship
-- command the runtime can reach fails the first assertion, whatever it is called, and
-- whoever adds one has to come here and say why it is not the closure that was deferred.
--
-- The route half lives beside the contract, in the API's own gate: nothing under
-- `/backoffice/v1` reaches a relationship, and no operation claims
-- `NEW-ORG-PLATFORM-CLOSE`.

begin;

select plan(5);

-- ---------------------------------------------------------------------------
-- No permission: what the runtime may run in `relationships`, exhaustively
-- ---------------------------------------------------------------------------

-- Naming all of them, rather than asserting that no name matches `terminate%`, is the
-- point: a closure called anything at all breaks this, and whoever adds a function to
-- `relationships` has to say out loud that theirs is not one. It has already worked
-- six times — `read_relationship_state` and `reassign_relationship_holder` arrived with
-- `AFO-54`/`AFO-57`, `read_relationship_history` with `AFO-55`,
-- `propose_substitution` with `AFO-58`, `list_my_relationships` with `OP-REL-012`,
-- `relationship_assignment_is_visible` with `STUDIO-94`, and the three termination
-- request commands with `STUDIO-26`; each landed here before it landed anywhere else.
--
-- Those three end nothing either. A coach asks, withdraws, or is refused; the
-- relationship only ends through `terminate_relationship` or `end_my_relationship`,
-- by the gym or the person, never by Allfit.
--
-- The last one is not an operation. It is the assignment read policy's predicate,
-- lifted into a function so the policy reads as one line, and the runtime holds
-- EXECUTE because a policy is evaluated as whoever is reading.
--
-- `list_my_relationships` is a read the **person** performs over her own rows, and it is
-- what makes everything about one of her gyms reachable from Space at all. It ends
-- nothing, it writes nothing, and the closure that stays deferred is Allfit ending a
-- relationship over the gym's head.
--
-- Only the function the API calls appears. `history_cursor` and
-- `history_cursor_parts` came with the same migration and are deliberately absent:
-- encoding a cursor is not an operation anybody outside the function needs.
--
-- Collated explicitly: `proname` is a `name`, and comparing those without saying how
-- to sort them is what PostgreSQL refuses.
select is(
  (select string_agg(runnable.name, ', ' order by runnable.name)
   from (
     select routine.proname::text collate "C" as name
     from pg_proc as routine
     join pg_namespace as space on space.oid = routine.pronamespace
     where space.nspname = 'relationships'
       and routine.prokind = 'f'
       and has_function_privilege('allfit_api', routine.oid, 'EXECUTE')
   ) as runnable),
  'actor_is_assigned, assign_relationship_holder, decide_substitution, '
    || 'end_my_relationship, end_substitution, '
    || 'list_my_relationships, list_organization_clients, list_organization_clients, '
    || 'list_relationship_substitutions, propose_substitution, read_client_card, '
    || 'read_relationship_history, read_relationship_state, read_studio_today, '
    || 'reassign_relationship_holder, reject_termination_request, '
    || 'relationship_assignment_is_visible, request_relationship_termination, '
    || 'terminate_relationship, withdraw_termination_request',
  'the runtime reaches twenty relationship functions (the directory under two '
    || 'signatures), and only the gym and the person end a relationship through them'
);

-- ---------------------------------------------------------------------------
-- No DDL: nothing models a closure the platform decides
-- ---------------------------------------------------------------------------

-- A coach asking her own gym to end a relationship is a legitimate piece, and since
-- `STUDIO-26` it has a table: `relationship_termination_requests`, deliberation
-- inside the organization. Allfit ending it over the gym's head is the one that was
-- ruled out, and that still has none.
select is(
  (select count(*)::integer
   from information_schema.tables
   where table_schema = 'relationships'
     and table_name in ('platform_closures', 'platform_termination_requests')),
  0,
  'no table records a closure or a termination decided by the platform'
);

select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'organizations'
     and table_name = 'organizations'
     and column_name in ('closed_by_platform_at', 'platform_closure_reason')),
  0,
  'and an organization carries no mark of having been closed by Allfit'
);

-- `cancelled` is the state a gym nobody claimed reaches through `HU-BO-015`, which is
-- a different thing from ending the relationships of one that operates.
--
-- `suspended` arrived with `HU-BO-016` and does not weaken what this asserts. The
-- state this file rules out is a *terminal* one that lets Allfit end a gym over its
-- head; suspension is the opposite of terminal, reverses with `OP-ORG-025`, and ends
-- no relationship — `T-ORG-SUSPEND-01` is where that is proved. Both assertions above
-- still hold: no closure table, and no column marking a gym closed by Allfit.
select is(
  (select string_agg(label.enumlabel::text collate "C", ', ' order by label.enumsortorder)
   from pg_enum as label
   join pg_type as kind on kind.oid = label.enumtypid
   where kind.typname = 'organization_status'),
  'unclaimed, active, suspended, closed, cancelled',
  'the lifecycle gained a reversible state and still none for a platform closure'
);

-- ---------------------------------------------------------------------------
-- And the runtime writes no relationship directly either
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('allfit_api', 'relationships.service_relationships', 'UPDATE, DELETE')
  and not has_table_privilege(
    'allfit_api', 'relationships.relationship_professional_assignments', 'UPDATE, DELETE'
  ),
  'so a closure cannot be done by hand through the tables either'
);

select * from finish();
rollback;

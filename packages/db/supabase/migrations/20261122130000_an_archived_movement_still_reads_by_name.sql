-- HU-BO-022 criterion 3: archiving a global movement retires it from search and breaks
-- nothing that already used it.
--
-- `movements_all_actor_access` let a person or a gym read a global movement only while it
-- was `published`. Archiving one from the Backoffice therefore emptied its name wherever
-- it had been used: the sessions a person trained with it, in Space and in her coach's
-- Studio, and the steps of a gym's published templates. The row survived, as
-- `T-CAT-GLOBAL-01` proves; reading it did not.
--
-- **A global movement is readable once it has ever been offered.** `published`,
-- `deprecated` and `archived` are all things the platform once offered; a `draft` never
-- was, and stays out of reach. The global catalogue is nobody's personal data, so this
-- writes no access event, as `20261113090000` says of the catalogue.
--
-- **Read only, beside the policy that also writes.** `movements_all_actor_access` is a
-- `for all` policy; widening it would let a function acting for a person see an archived
-- global movement to update it, and its check would accept it back as published. So it
-- stays as it is, and a separate `select` policy opens the reading alone.
--
-- **Search still offers only what is published.** `read_movements`, `read_movement`,
-- `search_organization_movements` and `session_content_errors` filter the status
-- themselves rather than leaning on a policy, so an archived movement still never reaches
-- new content.

set lock_timeout = '5s';
set statement_timeout = '60s';

create policy movements_select_offered_global
  on catalog.movements
  for select
  to allfit_owner
  using (
    content_scope = 'global'
    and status in ('published', 'deprecated', 'archived')
    and access_control.person() is not null
  );

-- HU-BO-030: the unpaged read of the access log goes.
--
-- `20261104100400` replaced `privacy.list_access_events` with the paged
-- `privacy.page_access_events` and left the old one standing, because the API deployed
-- before that migration still called it. Every API since calls only the paged read, so
-- the old one was a second door to the log that nothing used and nobody kept in step
-- with the rules of the first. Its tests now run against the paged read.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function privacy.list_access_events(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer
);

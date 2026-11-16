-- OP-REL-010 — the directory keeps one signature (follow-up to STUDIO-75).
--
-- `20261118090000_a_member_finds_a_client_by_name.sql` added the name search as an
-- eighth argument and kept the seven-argument signature as an invoker wrapper,
-- because the API ships before the database and had to keep listing the directory
-- in between. That gap is closed: the API deployed with this migration binds a
-- null search itself, and Deploy Database AWS runs only after that API is live.
--
-- Dropped without `cascade`: nothing in the schema calls the wrapper, and if
-- something did, the migration should fail rather than take it along.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function relationships.list_organization_clients(uuid, uuid, text, integer, text, text, uuid);

-- Backoffice ceremonies connect with the database's administrative login and
-- narrow themselves to allfit_migrator before calling the ceremony functions.
-- Supabase calls that login postgres and was granted in 20260812122000; RDS names
-- it after its master user, so the grant follows whichever login applies this.

do $ceremony_role$
begin
  execute format('grant allfit_migrator to %I', current_user);
end
$ceremony_role$;

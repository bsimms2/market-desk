-- Keep is_allowed() out of the exposed API (it was callable at /rest/v1/rpc/is_allowed).
-- Policies reference the function by OID, so moving it keeps them working.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_allowed() set schema private;
alter function private.is_allowed() set search_path = public;
revoke all on function private.is_allowed() from public, anon;
grant execute on function private.is_allowed() to authenticated;

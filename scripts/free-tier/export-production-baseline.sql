-- Read-only, schema-only BASELINE export of the Axentra PRODUCTION database
-- (lynkvfduzqdyvlzgriyh), for restoring into a DISPOSABLE local Supabase stack
-- in CI (.github/workflows/free-tier-db.yml). Pure SELECT over catalogues.
--
-- Why: production holds objects no migration creates (the permission
-- subsystem, photo-link triggers, ...; docs/staging/STAGING-RECOVERY-REPORT.md),
-- so replaying supabase/migrations from empty can never reproduce production.
-- CI restores this baseline instead, then replays only the repository
-- migrations that production has NOT recorded.
--
-- Scope (app-owned only; the local Supabase stack supplies auth/storage/realtime):
--   * full DDL for schemas public + axentra_private: types, sequences, tables,
--     functions, views, defaults, constraints, indexes, triggers, RLS, policies,
--     grants, realtime publication membership
--   * Axentra triggers on platform tables (trigger function in an app schema)
--   * all policies on storage.* (Supabase ships none; they are Axentra's)
--   * NOLOGIN placeholders for custom roles referenced by grants
--   * migration ledger (versions + names only, never statements)
--   * global configuration rows: storage.buckets, permissions_catalog,
--     role_permission_templates (no customer or org data)
-- NEVER exported: table rows other than the three configuration tables,
-- auth users, storage objects, vault secrets, role passwords.
--
-- Run (Supabase MCP execute_sql or SQL editor) against PRODUCTION, save the
-- raw result, then:  python3 -I scripts/staging/logical-backup/extract-mcp-result.py \
--   --ref=lynkvfduzqdyvlzgriyh <saved-result> ddl <out.sql> <out.meta.json>
-- spill_pad forces the MCP client to save the large result to a file.
set search_path to pg_catalog;
with
app(n) as (values ('public'),('axentra_private')),
plat(n) as (values ('auth'),('storage')),
nsp as (select oid, nspname from pg_namespace where nspname in (select n from app)),
pnsp as (select oid, nspname from pg_namespace where nspname in (select n from plat)),
rels as (
  select c.*, n.nspname from pg_class c join nsp n on n.oid=c.relnamespace
  where not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
),
prels as (select c.*, n.nspname from pg_class c join pnsp n on n.oid=c.relnamespace where c.relkind in ('r','p')),
procs as (
  select p.*, n.nspname,
         format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) ident
  from pg_proc p join nsp n on n.oid=p.pronamespace
  where p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
),
builtin_roles(r) as (values ('postgres'),('anon'),('authenticated'),('service_role'),('authenticator'),
  ('supabase_admin'),('supabase_auth_admin'),('supabase_storage_admin'),('supabase_functions_admin'),
  ('supabase_realtime_admin'),('supabase_replication_admin'),('supabase_read_only_user'),('dashboard_user'),
  ('pgbouncer'),('pgsodium_keyholder'),('pgsodium_keyiduser'),('pgsodium_keymaker'),('supabase_etl_admin'),
  ('supabase_privileged_role'),('cli_login_postgres')),
granted(r) as (
  select (aclexplode(relacl)).grantee from rels where relacl is not null
  union select (aclexplode(proacl)).grantee from procs where proacl is not null
  union select (aclexplode(nspacl)).grantee from pg_namespace where nspname in (select n from app) and nspacl is not null
  union select unnest(polroles) from pg_policy where polrelid in (select oid from rels union select oid from prels)
),
stmts(sec, k, s) as (
  -- 00 custom roles: NOLOGIN placeholders only (no attributes, never passwords)
  select 0, r.rolname, format($f$DO $r$ BEGIN CREATE ROLE %I NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $r$;$f$, r.rolname)
  from pg_roles r where r.oid in (select r from granted where r<>0) and r.rolname !~ '^pg_'
    and r.rolname not in (select r from builtin_roles)
  -- 02 schemas + 03 extensions (as installed in production)
  union all select 2, n, format('CREATE SCHEMA IF NOT EXISTS %I;', n) from app
  union all select 2, 'extensions', 'CREATE SCHEMA IF NOT EXISTS extensions;'
  union all
  select 3, e.extname, format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', e.extname, n.nspname)
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  where e.extname in ('uuid-ossp','pgcrypto','btree_gist','pg_trgm','citext','btree_gin','unaccent','fuzzystrmatch')
  -- 04 types
  union all
  select 4, t.typname, format('CREATE TYPE %I.%I AS ENUM (%s);', n.nspname, t.typname,
     (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid))
  from pg_type t join nsp n on n.oid=t.typnamespace where t.typtype='e'
    and not exists (select 1 from pg_depend d where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e')
  union all
  select 4, 'z'||t.typname, format('CREATE DOMAIN %I.%I AS %s%s%s;', n.nspname, t.typname, format_type(t.typbasetype, t.typtypmod),
     case when t.typnotnull then ' NOT NULL' else '' end,
     coalesce((select string_agg(' CONSTRAINT '||quote_ident(c.conname)||' '||pg_get_constraintdef(c.oid), '') from pg_constraint c where c.contypid=t.oid),''))
  from pg_type t join nsp n on n.oid=t.typnamespace where t.typtype='d'
  union all
  select 4, 'zz'||c.relname, format('CREATE TYPE %I.%I AS (%s);', c.nspname, c.relname,
     (select string_agg(format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))
  from rels c where c.relkind='c'
  -- 05 sequences (non-identity)
  union all
  select 5, c.relname, format('CREATE SEQUENCE %I.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s;',
     c.nspname, c.relname, format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcache,
     case when s.seqcycle then ' CYCLE' else '' end)
  from rels c join pg_sequence s on s.seqrelid=c.oid
  where c.relkind='S' and not exists (select 1 from pg_depend d where d.objid=c.oid and d.deptype='i')
  -- 06 tables
  union all
  select 6, c.nspname||'.'||c.relname, format('CREATE TABLE %I.%I (%s)%s;', c.nspname, c.relname,
     coalesce((select string_agg(format('%I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
        case when a.attcollation<>0 and a.attcollation<>(select typcollation from pg_type where oid=a.atttypid)
             then ' COLLATE '||(select format('%I.%I', cn.nspname, co.collname) from pg_collation co join pg_namespace cn on cn.oid=co.collnamespace where co.oid=a.attcollation) else '' end,
        case when a.attgenerated='s' then ' GENERATED ALWAYS AS ('||pg_get_expr(d.adbin, d.adrelid)||') STORED'
             when a.attidentity='a' then ' GENERATED ALWAYS AS IDENTITY'
             when a.attidentity='d' then ' GENERATED BY DEFAULT AS IDENTITY' else '' end,
        case when a.attnotnull then ' NOT NULL' else '' end), ', ' order by a.attnum)
       from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped), ''),
     case when c.reloptions is not null then ' WITH ('||array_to_string(c.reloptions, ', ')||')' else '' end)
  from rels c where c.relkind in ('r','p')
  -- 07 functions (bodies not validated at create time; restore sets check_function_bodies=off)
  union all
  select 7, p.ident, pg_get_functiondef(p.oid)||';' from procs p
  -- 08 views
  union all
  select 8, lpad(c.oid::text, 12, '0'), format('CREATE %sVIEW %I.%I%s AS %s%s', case when c.relkind='m' then 'MATERIALIZED ' else '' end,
     c.nspname, c.relname,
     case when c.reloptions is not null then ' WITH ('||array_to_string(c.reloptions, ', ')||')' else '' end,
     rtrim(pg_get_viewdef(c.oid, true), ';'), case when c.relkind='m' then ' WITH NO DATA;' else ';' end)
  from rels c where c.relkind in ('v','m')
  -- 09 column defaults, sequence ownership
  union all
  select 9, c.relname||a.attname, format('ALTER TABLE ONLY %I.%I ALTER COLUMN %I SET DEFAULT %s;', c.nspname, c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid))
  from rels c join pg_attribute a on a.attrelid=c.oid join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where c.relkind in ('r','p','v') and a.attgenerated='' and a.attnum>0 and not a.attisdropped
  union all
  select 9, 'zseq'||s.relname, format('ALTER SEQUENCE %I.%I OWNED BY %I.%I.%I;', s.nspname, s.relname, t.nspname, t.relname, a.attname)
  from rels s join pg_depend d on d.objid=s.oid and d.classid='pg_class'::regclass and d.refclassid='pg_class'::regclass and d.deptype='a'
  join rels t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
  where s.relkind='S'
  -- 10/11 constraints (FK last; NOT VALID preserved)
  union all
  select case when con.contype='f' then 11 else 10 end, c.nspname||c.relname||con.conname,
     format('ALTER TABLE ONLY %I.%I ADD CONSTRAINT %I %s;', c.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid))
  from pg_constraint con join rels c on c.oid=con.conrelid where con.contype in ('p','u','c','x','f') and con.conislocal
  -- 12 indexes not backing constraints
  union all
  select 12, i.relname, pg_get_indexdef(i.oid)||';'
  from rels i join pg_index x on x.indexrelid=i.oid
  where i.relkind in ('i','I') and not exists (select 1 from pg_constraint con where con.conindid=i.oid and con.contype in ('p','u','x'))
  -- 13 triggers: app tables, plus platform tables whose trigger function is app-owned
  union all
  select 13, c.relname||t.tgname, pg_get_triggerdef(t.oid)||';'||
     case t.tgenabled when 'D' then format(' ALTER TABLE %I.%I DISABLE TRIGGER %I;', c.nspname, c.relname, t.tgname)
                      when 'R' then format(' ALTER TABLE %I.%I ENABLE REPLICA TRIGGER %I;', c.nspname, c.relname, t.tgname)
                      when 'A' then format(' ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER %I;', c.nspname, c.relname, t.tgname) else '' end
  from pg_trigger t join rels c on c.oid=t.tgrelid where not t.tgisinternal
  union all
  select 13, 'p'||c.nspname||c.relname||t.tgname,
     format('DROP TRIGGER IF EXISTS %I ON %I.%I; ', t.tgname, c.nspname, c.relname)||pg_get_triggerdef(t.oid)||';'
  from pg_trigger t join prels c on c.oid=t.tgrelid join pg_proc f on f.oid=t.tgfoid
  where not t.tgisinternal and f.pronamespace in (select oid from nsp)
  -- 14 RLS flags (app tables)
  union all
  select 14, c.nspname||c.relname, format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', c.nspname, c.relname) from rels c where c.relrowsecurity
  union all
  select 14, 'f'||c.nspname||c.relname, format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', c.nspname, c.relname) from rels c where c.relforcerowsecurity
  -- 15 policies: app tables + storage.* (dropped first so the local defaults never shadow production)
  union all
  select 15, c.nspname||c.relname||p.polname,
     case when c.nspname in (select n from plat) then format('DROP POLICY IF EXISTS %I ON %I.%I; ', p.polname, c.nspname, c.relname) else '' end||
     format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;', p.polname, c.nspname, c.relname,
     case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
     case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
     (select string_agg(case when r=0 then 'PUBLIC' else quote_ident(r::regrole::text) end, ', ') from unnest(p.polroles) r),
     coalesce(' USING ('||pg_get_expr(p.polqual, p.polrelid)||')', ''),
     coalesce(' WITH CHECK ('||pg_get_expr(p.polwithcheck, p.polrelid)||')', ''))
  from pg_policy p join (select oid, nspname, relname from rels union all select oid, nspname, relname from prels where nspname='storage') c on c.oid=p.polrelid
  -- 17 privileges (explicit ACLs replace local defaults)
  union all
  select 17, 'a'||c.nspname||c.relname, format('REVOKE ALL ON %s %I.%I FROM PUBLIC, anon, authenticated, service_role;', case when c.relkind='S' then 'SEQUENCE' else 'TABLE' end, c.nspname, c.relname)
  from rels c where c.relkind in ('r','p','v','m','S') and c.relacl is not null
  union all
  select 17, 'b'||c.nspname||c.relname||a.grantee::text||a.privilege_type, format('GRANT %s ON %s %I.%I TO %s%s;', a.privilege_type,
     case when c.relkind='S' then 'SEQUENCE' else 'TABLE' end, c.nspname, c.relname,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from rels c, aclexplode(c.relacl) a where c.relkind in ('r','p','v','m','S') and a.grantee<>c.relowner
  union all
  select 17, 'c'||c.nspname||c.relname||at.attname||a.grantee::text||a.privilege_type, format('GRANT %s (%I) ON TABLE %I.%I TO %s%s;', a.privilege_type, at.attname, c.nspname, c.relname,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from rels c join pg_attribute at on at.attrelid=c.oid and at.attacl is not null, aclexplode(at.attacl) a
  union all
  select 17, 'd'||p.ident, format('REVOKE ALL ON %s %s FROM PUBLIC, anon, authenticated, service_role;', case p.prokind when 'p' then 'PROCEDURE' else 'FUNCTION' end, p.ident) from procs p where p.proacl is not null
  union all
  select 17, 'e'||p.ident||a.grantee::text, format('GRANT EXECUTE ON %s %s TO %s%s;', case p.prokind when 'p' then 'PROCEDURE' else 'FUNCTION' end, p.ident,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from procs p, aclexplode(p.proacl) a where a.grantee<>p.proowner
  union all
  select 17, 'f'||n.nspname||a.grantee::text||a.privilege_type, format('GRANT %s ON SCHEMA %I TO %s%s;', a.privilege_type, n.nspname,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from pg_namespace n, aclexplode(n.nspacl) a where n.nspname in (select n from app) and a.grantee<>n.nspowner
  -- 19 realtime publication membership (app tables)
  union all
  select 19, pt.schemaname||pt.tablename,
     format($p$DO $r$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I; EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $r$;$p$, pt.schemaname, pt.tablename)
  from pg_publication_tables pt where pt.pubname='supabase_realtime' and pt.schemaname in (select n from app)
  -- 20 global configuration rows (no org/customer data), as JSON so types round-trip exactly
  union all
  select 20, 'storage.buckets', format($b$INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) SELECT id, name, public, file_size_limit, allowed_mime_types FROM json_populate_recordset(NULL::storage.buckets, %L) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;$b$,
     (select json_agg(json_build_object('id', id, 'name', name, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id) from storage.buckets))
  union all
  select 20, 'public.'||t, format('INSERT INTO public.%I SELECT * FROM json_populate_recordset(NULL::public.%I, %L) ON CONFLICT DO NOTHING;', t, t, j)
  from (select 'permissions_catalog' t, (select json_agg(x) from public.permissions_catalog x) j
        union all select 'role_permission_templates', (select json_agg(x) from public.role_permission_templates x)) cfg
  where j is not null
  -- 21 migration ledger (version + name only)
  union all
  select 21, '0', 'CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);'
  union all
  select 21, 'v'||version, format('INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (%L, %L) ON CONFLICT (version) DO NOTHING;', version, name)
  from supabase_migrations.schema_migrations
),
doc as (
  select string_agg(format('-- [%s] %s', lpad(sec::text, 2, '0'), k)||E'\n'||s, E'\n' order by sec, k, s) ddl from stmts
)
select 'lynkvfduzqdyvlzgriyh' as expected_ref,
       current_setting('server_version') as server_version,
       (select max(version) from supabase_migrations.schema_migrations) as max_recorded_migration,
       (select count(*) from supabase_migrations.schema_migrations) as ledger_rows,
       (select count(*) from stmts) as statements,
       md5(ddl) as md5, length(ddl) as len, ddl,
       repeat('x', 200000) as spill_pad
from doc;

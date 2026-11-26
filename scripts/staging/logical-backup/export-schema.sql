-- Read-only logical schema export for the Axentra STAGING Supabase project.
-- Used when no direct Postgres credential is available (e.g. only the
-- Supabase MCP / SQL editor). Pure SELECT over catalogues: no writes.
-- Output: one row {project_ref, md5, ddl}. md5 is computed server-side so the
-- local copy can be verified byte-for-byte before it is trusted.
--
-- Scope: full DDL for `public`; table DDL + custom functions/triggers/policies
-- for managed schemas `auth`, `storage`, `supabase_migrations` so the dump
-- can be restored into an isolated local Postgres for rehearsal.
-- search_path is pinned so every name in the output is schema-qualified.
set search_path to pg_catalog;
with
sch(n) as (values ('public'),('axentra_private'),('auth'),('storage'),('supabase_migrations')),
nsp as (select oid, nspname from pg_namespace where nspname in (select n from sch)),
rels as (
  select c.*, n.nspname from pg_class c join nsp n on n.oid=c.relnamespace
  where not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
),
procs as (
  select p.*, n.nspname,
         format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) ident
  from pg_proc p join nsp n on n.oid=p.pronamespace
  where p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
),
roles_used(r) as (
  select relowner from rels union select proowner from procs
  union select nspowner from pg_namespace where nspname in (select n from sch)
  union select (aclexplode(relacl)).grantee from rels where relacl is not null
  union select (aclexplode(proacl)).grantee from procs where proacl is not null
  union select (aclexplode(nspacl)).grantee from pg_namespace where nspname in (select n from sch) and nspacl is not null
  union select unnest(polroles) from pg_policy where polrelid in (select oid from rels)
  union select defaclrole from pg_default_acl
  union select (aclexplode(defaclacl)).grantee from pg_default_acl
  union select rolname::regrole::oid from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')
),
stmts(sec, k, s) as (
  -- 00 roles (NOLOGIN placeholders; attributes/memberships replicated, never passwords)
  select 0, r.rolname, format($f$DO $r$ BEGIN CREATE ROLE %I NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $r$;$f$, r.rolname)
  from pg_roles r where r.oid in (select r from roles_used where r<>0) and r.rolname<>'postgres' and r.rolname !~ '^pg_'
  union all
  select 1, r.rolname, format('ALTER ROLE %I WITH %s %s %s %s;', r.rolname,
     case when r.rolsuper then 'SUPERUSER' else 'NOSUPERUSER' end,
     case when r.rolbypassrls then 'BYPASSRLS' else 'NOBYPASSRLS' end,
     case when r.rolinherit then 'INHERIT' else 'NOINHERIT' end,
     case when r.rolcreaterole then 'CREATEROLE' else 'NOCREATEROLE' end)
  from pg_roles r where r.oid in (select r from roles_used where r<>0) and r.rolname<>'postgres' and r.rolname !~ '^pg_'
  union all
  select 1, r.rolname||c, format('ALTER ROLE %I SET %s;', r.rolname, regexp_replace(c, '^([^=]+)=(.*)$', '\1 = ''\2'''))
  from pg_roles r, unnest(r.rolconfig) c where r.oid in (select r from roles_used where r<>0) and r.rolname<>'postgres' and r.rolname !~ '^pg_'
  union all
  select 1, 'm'||m.roleid::regrole::text||m.member::regrole::text,
    format('GRANT %I TO %I;', m.roleid::regrole::text, m.member::regrole::text)
  from pg_auth_members m where m.roleid in (select r from roles_used) and m.member in (select r from roles_used)
    and m.member::regrole::text<>'postgres'
  -- 02 schemas + 03 extensions
  union all select 2, n, format('CREATE SCHEMA IF NOT EXISTS %I;', n) from sch
  union all select 2, 'extensions', 'CREATE SCHEMA IF NOT EXISTS extensions;'
  union all
  select 3, e.extname, format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', e.extname, n.nspname)
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  where e.extname in ('uuid-ossp','pgcrypto','btree_gist','pg_trgm','citext','btree_gin','unaccent','fuzzystrmatch')
  -- 04 types: enums, domains, composites
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
  -- 07 functions (bodies not validated at create time; see restore script)
  union all
  select 7, p.ident, pg_get_functiondef(p.oid)||';' from procs p
  -- 08 views (after functions; security_invoker etc. preserved via reloptions)
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
  -- 10/11 constraints (FK last)
  union all
  select case when con.contype='f' then 11 else 10 end, c.nspname||c.relname||con.conname,
     format('ALTER TABLE ONLY %I.%I ADD CONSTRAINT %I %s%s;', c.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid),
       case when not con.convalidated then '' else '' end)
  from pg_constraint con join rels c on c.oid=con.conrelid where con.contype in ('p','u','c','x','f') and con.conislocal
  -- 12 indexes not backing constraints
  union all
  select 12, i.relname, pg_get_indexdef(i.oid)||';'
  from rels i join pg_index x on x.indexrelid=i.oid
  where i.relkind in ('i','I') and not exists (select 1 from pg_constraint con where con.conindid=i.oid and con.contype in ('p','u','x'))
  -- 13 triggers
  union all
  select 13, c.relname||t.tgname, pg_get_triggerdef(t.oid)||';'||
     case t.tgenabled when 'D' then format(' ALTER TABLE %I.%I DISABLE TRIGGER %I;', c.nspname, c.relname, t.tgname)
                      when 'R' then format(' ALTER TABLE %I.%I ENABLE REPLICA TRIGGER %I;', c.nspname, c.relname, t.tgname)
                      when 'A' then format(' ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER %I;', c.nspname, c.relname, t.tgname) else '' end
  from pg_trigger t join rels c on c.oid=t.tgrelid where not t.tgisinternal
  -- 14 RLS flags
  union all
  select 14, c.nspname||c.relname, format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', c.nspname, c.relname) from rels c where c.relrowsecurity
  union all
  select 14, 'f'||c.nspname||c.relname, format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', c.nspname, c.relname) from rels c where c.relforcerowsecurity
  -- 15 policies
  union all
  select 15, c.nspname||c.relname||p.polname, format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;', p.polname, c.nspname, c.relname,
     case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
     case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
     (select string_agg(case when r=0 then 'PUBLIC' else quote_ident(r::regrole::text) end, ', ') from unnest(p.polroles) r),
     coalesce(' USING ('||pg_get_expr(p.polqual, p.polrelid)||')', ''),
     coalesce(' WITH CHECK ('||pg_get_expr(p.polwithcheck, p.polrelid)||')', ''))
  from pg_policy p join rels c on c.oid=p.polrelid
  -- 16 ownership
  union all
  select 16, c.nspname||c.relname, format('ALTER %s %I.%I OWNER TO %I;',
     case c.relkind when 'S' then 'SEQUENCE' when 'v' then 'VIEW' when 'm' then 'MATERIALIZED VIEW' when 'c' then 'TYPE' else 'TABLE' end,
     c.nspname, c.relname, c.relowner::regrole::text)
  from rels c where c.relkind in ('r','p','v','m','S','c')
  union all
  select 16, 'f'||p.ident, format('ALTER %s %s OWNER TO %I;', case p.prokind when 'p' then 'PROCEDURE' else 'FUNCTION' end, p.ident, p.proowner::regrole::text) from procs p
  union all
  select 16, 't'||t.typname, format('ALTER TYPE %I.%I OWNER TO %I;', n.nspname, t.typname, t.typowner::regrole::text)
  from pg_type t join nsp n on n.oid=t.typnamespace where t.typtype in ('e','d')
  union all
  select 16, 's'||nspname, format('ALTER SCHEMA %I OWNER TO %I;', nspname, nspowner::regrole::text) from pg_namespace where nspname in (select n from sch)
  -- 17 privileges (explicit ACLs replace local defaults)
  union all
  select 17, 'a'||c.nspname||c.relname, format('REVOKE ALL ON %s %I.%I FROM PUBLIC;', case when c.relkind='S' then 'SEQUENCE' else 'TABLE' end, c.nspname, c.relname)
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
  select 17, 'd'||p.ident, format('REVOKE ALL ON %s %s FROM PUBLIC;', case p.prokind when 'p' then 'PROCEDURE' else 'FUNCTION' end, p.ident) from procs p where p.proacl is not null
  union all
  select 17, 'e'||p.ident||a.grantee::text, format('GRANT EXECUTE ON %s %s TO %s%s;', case p.prokind when 'p' then 'PROCEDURE' else 'FUNCTION' end, p.ident,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from procs p, aclexplode(p.proacl) a where a.grantee<>p.proowner
  union all
  select 17, 'f'||n.nspname||a.grantee::text||a.privilege_type, format('GRANT %s ON SCHEMA %I TO %s%s;', a.privilege_type, n.nspname,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from pg_namespace n, aclexplode(n.nspacl) a where n.nspname in (select n from sch) and a.grantee<>n.nspowner
  -- 18 default privileges
  union all
  select 18, 'a'||d.oid::text, format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM PUBLIC;', d.defaclrole::regrole::text,
     coalesce(' IN SCHEMA '||quote_ident(n.nspname), ''), case d.defaclobjtype when 'r' then 'TABLES' when 'S' then 'SEQUENCES' when 'f' then 'FUNCTIONS' when 'T' then 'TYPES' when 'n' then 'SCHEMAS' end)
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
  where d.defaclnamespace=0 or n.nspname in (select n from sch)
  union all
  select 18, 'b'||d.oid::text||a.grantee::text||a.privilege_type, format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %s%s;', d.defaclrole::regrole::text,
     coalesce(' IN SCHEMA '||quote_ident(n.nspname), ''), a.privilege_type,
     case d.defaclobjtype when 'r' then 'TABLES' when 'S' then 'SEQUENCES' when 'f' then 'FUNCTIONS' when 'T' then 'TYPES' when 'n' then 'SCHEMAS' end,
     case when a.grantee=0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end, case when a.is_grantable then ' WITH GRANT OPTION' else '' end)
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace, aclexplode(d.defaclacl) a
  where d.defaclnamespace=0 or n.nspname in (select n from sch)
  -- 19 realtime publication membership
  union all
  select 19, '0', $p$DO $r$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $r$;$p$
  where exists (select 1 from pg_publication where pubname='supabase_realtime')
  union all
  select 19, pt.schemaname||pt.tablename, format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I;', pt.schemaname, pt.tablename)
  from pg_publication_tables pt where pt.pubname='supabase_realtime'
),
doc as (
  select string_agg(format('-- [%s] %s', lpad(sec::text, 2, '0'), k)||E'\n'||s, E'\n' order by sec, k, s) ddl from stmts
)
select 'mfedxybzajdgavzmajkl' as expected_ref,
       current_setting('cluster_name', true) as cluster_name,
       (select count(*) from stmts) as statements,
       md5(ddl) as md5, length(ddl) as len, ddl
from doc;

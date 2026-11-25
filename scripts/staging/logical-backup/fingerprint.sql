-- Catalogue fingerprint (read-only). Same output shape as
-- scripts/staging/phase00-catalogue.sql: rows of {kind, object, entries, hash}
-- so scripts/staging/phase00-catalogue-compare.mjs can diff two environments.
-- Wider than the Phase 00 query: ownership, function ACL / SECURITY DEFINER /
-- search_path, enums, sequences, auth+storage triggers, storage RLS flags,
-- schema ACLs and default privileges. Collation-pinned for portability.
-- Run with search_path pinned so expressions render schema-qualified.
set search_path to pg_catalog;
with
app as (select oid, nspname from pg_namespace where nspname='public'),
ext_objs as (select objid from pg_depend where deptype='e'),
entries(kind, object, item, definition) as (
  select 'columns', c.relname, a.attname,
    json_build_array(rank() over (partition by c.oid order by a.attnum), format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated)::text
  from pg_attribute a join pg_class c on c.oid=a.attrelid join app n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped
  union all
  select 'enums', t.typname, 'labels', (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)
  from pg_type t join app n on n.oid=t.typnamespace where t.typtype='e'
  union all
  select 'sequences', c.relname, 'def', json_build_array(format_type(s.seqtypid,null), s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcycle)::text
  from pg_class c join app n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid
  union all
  select 'relations', c.relname, 'flags', json_build_array(c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions, c.relowner::regrole::text)::text
  from pg_class c join app n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','S')
  union all
  select 'relations', 'storage.'||c.relname, 'flags', json_build_array(c.relkind, c.relrowsecurity, c.relforcerowsecurity)::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relkind='r' and c.relname in ('objects','buckets')
  union all
  select 'constraints', c.relname, con.conname, json_build_array(pg_get_constraintdef(con.oid), con.convalidated, con.condeferrable)::text
  from pg_constraint con join pg_class c on c.oid=con.conrelid join app n on n.oid=c.relnamespace
  union all
  select 'indexes', c.relname, i.relname, pg_get_indexdef(i.oid)
  from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class c on c.oid=x.indrelid join app n on n.oid=c.relnamespace
  union all
  select 'views', c.relname, 'definition', pg_get_viewdef(c.oid, true)
  from pg_class c join app n on n.oid=c.relnamespace where c.relkind in ('v','m')
  union all
  select 'functions', case when n.nspname='public' then '' else n.nspname||'.' end||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', 'definition',
    json_build_array(md5(pg_get_functiondef(p.oid)), p.prosecdef, p.proconfig, p.provolatile, p.proowner::regrole::text,
      (select string_agg(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||':'||a.privilege_type||case when a.is_grantable then '*' else '' end, ',' order by (case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||':'||a.privilege_type) collate "C")
         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a))::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','axentra_private','auth','storage') and p.prokind in ('f','p') and p.oid not in (select objid from ext_objs)
    and (n.nspname in ('public','axentra_private') or p.proowner::regrole::text in ('postgres'))
  union all
  select 'triggers', n.nspname||'.'||c.relname, t.tgname, json_build_array(pg_get_triggerdef(t.oid), t.tgenabled)::text
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and (n.nspname='public' or (n.nspname in ('auth','storage') and t.tgfoid in (
     select p.oid from pg_proc p join pg_namespace pn on pn.oid=p.pronamespace where pn.nspname in ('public','axentra_private'))))
  union all
  select 'policies', n.nspname||'.'||c.relname, p.polname,
    json_build_array(p.polpermissive, p.polcmd,
      (select string_agg(case when r=0 then 'PUBLIC' else r::regrole::text end, ',' order by (case when r=0 then 'PUBLIC' else r::regrole::text end) collate "C") from unnest(p.polroles) r),
      pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))::text
  from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','storage')
  union all
  select 'grants', c.relname, case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||'|'||a.privilege_type, a.is_grantable::text
  from pg_class c join app n on n.oid=c.relnamespace, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.relkind in ('r','p','v','m','S')
    and (a.grantee=0 or a.grantee::regrole::text in ('anon','authenticated','service_role'))
  union all
  select 'column_grants', c.relname, at.attname||'|'||case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||'|'||a.privilege_type, a.is_grantable::text
  from pg_class c join app n on n.oid=c.relnamespace join pg_attribute at on at.attrelid=c.oid and at.attacl is not null, aclexplode(at.attacl) a
  union all
  select 'schema_acl', n.nspname, case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||'|'||a.privilege_type, a.is_grantable::text
  from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a where n.nspname in ('public','storage','axentra_private')
  union all
  select 'default_acl', coalesce(n.nspname,'*')||':'||d.defaclrole::regrole::text||':'||d.defaclobjtype::text,
    case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||'|'||a.privilege_type, a.is_grantable::text
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace, aclexplode(d.defaclacl) a
  where (d.defaclnamespace=0 or n.nspname='public') and d.defaclrole::regrole::text='postgres'
  union all
  select 'buckets', id, 'configuration', json_build_array(name, public, file_size_limit, allowed_mime_types)::text from storage.buckets
  union all
  select 'publication', pubname, schemaname||'.'||tablename, '' from pg_publication_tables where pubname='supabase_realtime'
)
select kind, object, count(*)::int as entries,
  md5(string_agg(json_build_array(item, definition)::text, chr(10) order by item collate "C", definition collate "C")) as hash
from entries group by kind, object order by kind collate "C", object collate "C";

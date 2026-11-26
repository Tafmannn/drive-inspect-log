-- Read-only logical DATA export for the Axentra STAGING project (pure SELECT).
-- Each row is captured as its exact composite text literal (t::text), carried
-- through XML as base64 (lossless), and re-inserted with an explicit column
-- list so every type round-trips without JSON coercion.
-- Two independent digests per table: `md5` over the decoded literals that go
-- into the dump, and `src_md5` computed straight from t::text. They must match
-- (literals_match_source) and are re-checked after restore.
-- Excludes the platform-owned migration ledgers of auth/storage (managed by
-- Supabase, version-recorded in the manifest only).
set search_path to pg_catalog;
with tabs as (
  select c.oid, n.nspname, c.relname,
    (select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attgenerated='') cols
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','supabase_migrations')
    and (n.nspname, c.relname) not in (('auth','schema_migrations'),('storage','migrations'))
),
r as (
  select t.nspname, t.relname, t.cols, convert_from(decode(x.b64, 'base64'), 'UTF8') lit
  from tabs t,
  lateral (select unnest(xpath('/x/row/b/text()', ('<x>'||query_to_xml(format(
      'select encode(convert_to((t)::text, ''UTF8''), ''base64'') as b from %I.%I t', t.nspname, t.relname),
      false, true, '')::text||'</x>')::xml))::text as b64) x
),
src as (
  select t.nspname, t.relname,
    (xpath('/row/h/text()', query_to_xml(format(
      'select coalesce(md5(string_agg((t)::text, chr(10) order by (t)::text collate "C")), ''-'') as h from %I.%I t', t.nspname, t.relname),
      false, true, '')))[1]::text h,
    (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I t', t.nspname, t.relname), false, true, '')))[1]::text::int n
  from tabs t
),
per as (
  select nspname, relname, count(*) n, md5(string_agg(lit, chr(10) order by lit collate "C")) h,
    string_agg(format('INSERT INTO %I.%I (%s) SELECT %s FROM (SELECT (%L::%I.%I).*) r;', nspname, relname, cols, cols, lit, nspname, relname), chr(10) order by lit collate "C") ins
  from r group by 1,2
),
seqs as (
  select n.nspname, c.relname,
    (xpath('/row/v/text()', query_to_xml(format('select last_value::text||'',''||is_called::text v from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text v
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='S' and n.nspname in ('public','auth','storage','supabase_migrations')
),
doc as (
  select coalesce((select string_agg(ins, chr(10) order by nspname, relname) from per), '') || chr(10) ||
         coalesce((select string_agg(format('SELECT setval(%L, %s, %s);', quote_ident(nspname)||'.'||quote_ident(relname),
            split_part(v, ',', 1), split_part(v, ',', 2)), chr(10) order by nspname, relname) from seqs), '') body
)
select 'mfedxybzajdgavzmajkl' as expected_ref,
  (select json_object_agg(s.nspname||'.'||s.relname, json_build_object('rows', s.n, 'src_md5', s.h, 'dump_md5', p.h) order by s.nspname, s.relname)
     from src s left join per p using (nspname, relname)) as tables,
  (select bool_and(s.n = coalesce(p.n, 0) and (s.n = 0 or s.h = p.h)) from src s left join per p using (nspname, relname)) as literals_match_source,
  (select json_object_agg(nspname||'.'||relname, v) from seqs) as sequences,
  md5(body) as md5, length(body) as len, body,
  -- Padding forces MCP clients to spill the result to a local file instead of
  -- echoing row data (incl. auth password hashes) into a chat transcript.
  repeat('#', 140000) as spill_pad
from doc;

-- axentra-weekly-numbers: READ-ONLY. Returns one JSON row. No personal data
-- (no names, emails, phones, regs); clients are reported by company label only.
-- Week = Monday 00:00 (DB time zone) to now; trailing = previous 4 full weeks.
with
w as (select date_trunc('week', now()) as wk, date_trunc('week', now()) - interval '28 days' as t4),
done as (
  select j.id, j.completed_at, jp.total_price, j.client_id, coalesce(j.job_source, '(not recorded)') as source,
         coalesce(nullif(trim(j.client_company), ''), nullif(trim(c.company), ''), nullif(trim(c.trading_name), ''), nullif(trim(c.name), ''), '(unlinked)') as client,
         coalesce((select sum(e.amount) from expenses e where e.job_id = j.id and not e.is_hidden and not e.is_test), 0) as costs,
         -- expenses recharged on a live invoice: recovered, so credited back
         coalesce((select sum(x.amount_charged) from invoice_expenses x where x.job_id = j.id and not x.voided), 0) as recharged,
         exists (select 1 from invoice_items ii where ii.job_id = j.id and not ii.voided)
           or exists (select 1 from invoices i where i.job_id = j.id and i.status <> 'cancelled') as invoiced
  from jobs j left join clients c on c.id = j.client_id
  -- prices live in job_pricing (jobs.total_price was dropped in phase 4 of the job-pricing split)
  left join job_pricing jp on jp.job_id = j.id
  where not j.is_hidden and not j.is_test and j.status in ('completed', 'closed') and j.completed_at is not null
),
inv as (select * from invoices where document_type = 'invoice' and not is_test)
select json_build_object(
  'this_week', (select json_build_object(
      'completed_jobs', count(*),
      'priced_jobs', count(total_price) filter (where total_price > 0),
      'recorded_revenue', round(coalesce(sum(total_price), 0)::numeric, 2),
      'logged_direct_costs', round(sum(costs)::numeric, 2),
      'contribution_priced_jobs', round(coalesce(sum(total_price + recharged - costs) filter (where total_price > 0), 0)::numeric, 2))
    from done, w where completed_at >= w.wk),
  'trailing_4_weeks', (select json_build_object(
      'completed_jobs', count(*),
      'avg_jobs_per_week', round(count(*) / 4.0, 1),
      'price_capture_pct', case when count(*) = 0 then null else round(100.0 * count(total_price) filter (where total_price > 0) / count(*)) end,
      'client_link_pct', case when count(*) = 0 then null else round(100.0 * count(client_id) / count(*)) end,
      'recorded_revenue', round(coalesce(sum(total_price), 0)::numeric, 2),
      'contribution_priced_jobs', round(coalesce(sum(total_price + recharged - costs) filter (where total_price > 0), 0)::numeric, 2))
    from done, w where completed_at >= w.t4 and completed_at < w.wk),
  'cash', json_build_object(
      'unbilled_jobs', (select count(*) from done where not invoiced and total_price > 0),
      'unbilled_value', (select round(coalesce(sum(total_price), 0)::numeric, 2) from done where not invoiced and total_price > 0),
      'unpriced_completed_jobs_180d', (select count(*) from done where coalesce(total_price, 0) <= 0 and completed_at >= now() - interval '180 days'),
      'draft_invoices', (select count(*) from inv where status = 'draft'),
      'draft_value', (select round(coalesce(sum(total), 0)::numeric, 2) from inv where status = 'draft'),
      'outstanding_value', (select round(coalesce(sum(total), 0)::numeric, 2) from inv where status = 'sent'),
      'overdue_count', (select count(*) from inv where status = 'sent' and due_date < current_date),
      'overdue_value', (select round(coalesce(sum(total), 0)::numeric, 2) from inv where status = 'sent' and due_date < current_date),
      'paid_last_28d', (select round(coalesce(sum(total), 0)::numeric, 2) from inv, w where status = 'paid' and paid_at >= w.t4)),
  'clients_90d', (select coalesce(json_agg(x order by x.revenue desc), '[]'::json) from (
      select client, count(*) as jobs, round(coalesce(sum(total_price), 0)::numeric, 2) as revenue,
             round(coalesce(sum(total_price + recharged - costs) filter (where total_price > 0), 0)::numeric, 2) as contribution,
             count(*) filter (where coalesce(total_price, 0) <= 0) as unpriced
      from done where completed_at >= now() - interval '90 days' group by client) x),
  'sources_90d', (select coalesce(json_agg(x order by x.contribution desc), '[]'::json) from (
      select source, count(*) as jobs, round(coalesce(sum(total_price), 0)::numeric, 2) as revenue,
             round(coalesce(sum(total_price + recharged - costs) filter (where total_price > 0), 0)::numeric, 2) as contribution,
             count(*) filter (where coalesce(total_price, 0) <= 0) as unpriced
      from done where completed_at >= now() - interval '90 days' group by source) x),
  'drivers_without_pay_basis', (select count(*) from driver_profiles where pay_basis is null and archived_at is null)
) as weekly;

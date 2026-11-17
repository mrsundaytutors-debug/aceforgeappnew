-- 003: reports, leaderboards, and write-policy fixes for app-side inserts.

-- FIX: the admin screens write audit rows, notifications and task questions with the signed-in user's session.
-- Without these policies those inserts are silently refused by RLS.
create policy audit_insert on audit_logs for insert to authenticated
  with check (actor_id = auth.uid() and my_role() in ('admin','tutor'));
create policy notif_insert on notifications for insert to authenticated
  with check (my_role() in ('admin','tutor'));
create policy tq_staff on task_questions for all
  using (exists (select 1 from tasks t where t.id = task_id and (is_admin() or t.created_by = auth.uid())))
  with check (exists (select 1 from tasks t where t.id = task_id and (is_admin() or t.created_by = auth.uid())));

alter table settings add column leaderboard_enabled boolean not null default true;

-- Leaderboard: class-scoped, first name + last initial only. Students see it only when enabled and only for their own class.
create function leaderboard(p_class uuid, p_from date, p_to date, p_metric text)
returns table(pos bigint, display_name text, score numeric, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare enabled boolean;
begin
  select leaderboard_enabled into enabled from settings where id = 1;
  if not (can_manage_class(p_class) or (enabled and exists (select 1 from class_members where class_id = p_class and student_id = auth.uid()))) then
    raise exception 'Not allowed'; end if;
  if p_metric not in ('points','attendance','punctual','tasks') then raise exception 'Unknown metric'; end if;
  return query
  with m as (select p.id, p.full_name from class_members cm join profiles p on p.id = cm.student_id where cm.class_id = p_class and p.active),
  v as (select m.id, m.full_name,
    (case p_metric
      when 'points' then (select coalesce(sum(l.points),0)::numeric from points_ledger l where l.student_id = m.id and l.kind = 'earn'
                          and (l.created_at at time zone 'Africa/Lagos')::date between p_from and p_to)
      when 'attendance' then (select count(*)::numeric from attendance_records r join attendance_sessions s on s.id = r.session_id
                          where r.student_id = m.id and r.verification = 'verified' and r.status in ('punctual','late') and s.session_date between p_from and p_to)
      when 'punctual' then (select count(*)::numeric from attendance_records r join attendance_sessions s on s.id = r.session_id
                          where r.student_id = m.id and r.verification = 'verified' and r.status = 'punctual' and s.session_date between p_from and p_to)
      else (select count(*)::numeric from task_submissions x where x.student_id = m.id and x.status = 'approved'
                          and (x.reviewed_at at time zone 'Africa/Lagos')::date between p_from and p_to)
    end) as val from m)
  select dense_rank() over (order by v.val desc),
         split_part(v.full_name,' ',1) || coalesce(' ' || nullif(left(split_part(v.full_name,' ',2),1),'') || '.', ''),
         v.val, v.id = auth.uid()
  from v order by 1, 2;
end $$;

-- Report data: SECURITY INVOKER, so RLS limits tutors to their own students automatically.
create function report_data(p_from date, p_to date, p_class uuid default null) returns jsonb language sql stable as $$
with st as (
  select p.id, p.full_name, cm.class_id, c.name as class_name
  from profiles p join class_members cm on cm.student_id = p.id join classes c on c.id = cm.class_id
  where p.role = 'student' and (p_class is null or cm.class_id = p_class)),
ses as (select s.id, s.class_id, s.session_date from attendance_sessions s
        where s.session_date between p_from and p_to and (p_class is null or s.class_id = p_class)),
att as (
  select st.id, st.full_name, st.class_name, count(ses.id) as sessions,
    count(r.id) filter (where r.verification = 'verified' and r.status in ('punctual','late')) as present,
    count(r.id) filter (where r.verification = 'verified' and r.status = 'punctual') as punctual,
    count(r.id) filter (where r.verification = 'verified' and r.status = 'late') as late,
    count(r.id) filter (where r.status = 'excused') as excused
  from st join ses on ses.class_id = st.class_id
  left join attendance_records r on r.session_id = ses.id and r.student_id = st.id
  group by st.id, st.full_name, st.class_name),
tk as (
  select st.id, st.full_name, st.class_name, count(t.id) as assigned, count(sb.id) as submitted,
    count(sb.id) filter (where sb.status = 'approved') as approved,
    count(sb.id) filter (where sb.status in ('rejected','resubmit_requested')) as rejected,
    round(avg(sb.verified_score / nullif(t.max_score,0) * 100) filter (where sb.status = 'approved' and sb.verified_score is not null), 1) as avg_pct
  from st join task_assignments ta on ta.class_id = st.class_id
  join tasks t on t.id = ta.task_id and t.assigned_date between p_from and p_to
  left join lateral (select x.id, x.status, x.verified_score from task_submissions x
                     where x.task_id = t.id and x.student_id = st.id order by x.attempt desc limit 1) sb on true
  group by st.id, st.full_name, st.class_name),
ids as (select distinct id from st)
select jsonb_build_object(
  'attendance', coalesce((select jsonb_agg(to_jsonb(att)) from att), '[]'::jsonb),
  'tasks', coalesce((select jsonb_agg(to_jsonb(tk)) from tk), '[]'::jsonb),
  'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from (
      select s.session_date as day,
        count(r.id) filter (where r.verification = 'verified' and r.status = 'punctual') as punctual,
        count(r.id) filter (where r.verification = 'verified' and r.status = 'late') as late
      from ses s left join attendance_records r on r.session_id = s.id group by s.session_date) d), '[]'::jsonb),
  'points', coalesce((select jsonb_agg(jsonb_build_object('source', q.source, 'points', q.pts)) from (
      select l.source, sum(l.points) as pts from points_ledger l
      where l.student_id in (select id from ids) and l.kind = 'earn' and (l.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
      group by l.source) q), '[]'::jsonb),
  'redemptions', coalesce((select jsonb_agg(jsonb_build_object('status', q.status, 'n', q.n)) from (
      select r.status, count(*) as n from redemptions r
      where r.student_id in (select id from ids) and (r.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
      group by r.status) q), '[]'::jsonb)
);
$$;

grant execute on function leaderboard, report_data to authenticated;

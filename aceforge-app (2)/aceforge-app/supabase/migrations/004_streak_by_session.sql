-- 004: streaks count consecutive class SESSIONS, not calendar days (so weekends do not break a streak).
create or replace function verify_attendance(p_record uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r attendance_records; s attendance_sessions; cfg settings; n int;
begin
  select * into r from attendance_records where id = p_record for update;
  select * into s from attendance_sessions where id = r.session_id;
  if not can_manage_class(s.class_id) then raise exception 'Not allowed'; end if;
  if r.verification = 'verified' then return; end if;
  select * into cfg from settings;
  update attendance_records set verification = 'verified', verified_by = auth.uid() where id = r.id;
  perform award_points(r.student_id, 'att:'||r.id, cfg.pts_attendance, 'earn', 'Verified attendance', 'attendance', r.id);
  if r.status = 'punctual' then
    perform award_points(r.student_id, 'pun:'||r.id, cfg.pts_punctual, 'earn', 'Punctual arrival', 'attendance', r.id);
  end if;
  -- consecutive verified-present sessions, newest first, stopping at the first miss
  select count(*) into n from (
    select o.ok, sum((not o.ok)::int) over (order by o.session_date desc) as breaks
    from (select x.session_date,
                 coalesce(a.verification = 'verified' and a.status in ('punctual','late'), false) as ok
          from attendance_sessions x
          left join attendance_records a on a.session_id = x.id and a.student_id = r.student_id
          where x.class_id = s.class_id and x.session_date <= s.session_date) o
  ) q where q.ok and q.breaks = 0;
  if n >= cfg.streak_length and n % cfg.streak_length = 0 then
    perform award_points(r.student_id, 'streak:'||r.student_id||':'||s.session_date, cfg.pts_streak, 'earn',
      n||'-session verified streak', 'streak', r.id);
  end if;
  insert into audit_logs(actor_id, action, detail) values (auth.uid(), 'attendance_verified', jsonb_build_object('record', r.id));
end $$;

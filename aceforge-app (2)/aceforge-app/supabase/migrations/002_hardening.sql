-- 002: keep the check-in code away from students, and let staff mark absent/excused.
revoke select on attendance_sessions from authenticated;
grant select (id, class_id, session_date, starts_at, late_after) on attendance_sessions to authenticated;
grant insert, update, delete on attendance_sessions to authenticated;  -- still limited by RLS (staff only)

create function session_code(p_session uuid) returns text language plpgsql security definer set search_path = public as $$
declare c uuid; code text;
begin
  select class_id, check_in_code into c, code from attendance_sessions where id = p_session;
  if not can_manage_class(c) then raise exception 'Not allowed'; end if;
  return code;
end $$;

create function mark_attendance(p_session uuid, p_student uuid, p_status att_status) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select class_id into c from attendance_sessions where id = p_session;
  if not can_manage_class(c) then raise exception 'Not allowed'; end if;
  if p_status not in ('absent','excused') then raise exception 'Use verify_attendance for present students'; end if;
  if exists (select 1 from attendance_records where session_id = p_session and student_id = p_student and verification = 'verified' and status in ('punctual','late')) then
    raise exception 'Verified attendance is locked. Use a points adjustment to correct it.'; end if;
  insert into attendance_records(session_id, student_id, status, verification, verified_by)
  values (p_session, p_student, p_status, 'verified', auth.uid())
  on conflict (session_id, student_id) do update set status = excluded.status, verification = 'verified', verified_by = auth.uid();
  insert into audit_logs(actor_id, action, detail) values (auth.uid(), 'attendance_marked', jsonb_build_object('session', p_session, 'student', p_student, 'status', p_status));
end $$;

grant execute on function session_code, mark_attendance to authenticated;

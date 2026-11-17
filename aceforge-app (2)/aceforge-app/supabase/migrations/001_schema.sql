-- Aceforge Student Success System: Supabase migration (run in order in the SQL editor)
-- Review before production. Not tested against a live project.

create extension if not exists pgcrypto;

-- ===== 1. Core tables =====
create type user_role as enum ('admin','tutor','student');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'student',
  full_name text not null,
  student_code text unique,            -- e.g. ACE-001 (students only)
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  level text
);
create table class_members (            -- students in classes
  class_id uuid references classes on delete cascade,
  student_id uuid references profiles on delete cascade,
  primary key (class_id, student_id)
);
create table tutor_classes (            -- tutor authorization
  class_id uuid references classes on delete cascade,
  tutor_id uuid references profiles on delete cascade,
  primary key (class_id, tutor_id)
);
create table class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  late_after_minutes int not null default 15
);

create table settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'Africa/Lagos',
  pts_attendance int not null default 10,
  pts_punctual int not null default 5,
  pts_task int not null default 10,
  pts_score_bonus int not null default 5,
  pts_all_tasks int not null default 5,
  pts_streak int not null default 10,
  streak_length int not null default 5,
  excused_earns_points boolean not null default false,
  auto_approve_tasks boolean not null default false,
  retention_days int not null default 365
);
insert into settings default values on conflict do nothing;

-- ===== 2. Attendance =====
create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes on delete cascade,
  session_date date not null,
  starts_at timestamptz not null,
  late_after timestamptz not null,
  check_in_code text not null,          -- rotate per session; staff share it in class
  unique (class_id, session_date)
);
create type att_status as enum ('punctual','late','absent','excused');
create type ver_status as enum ('pending','verified','rejected');
create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions on delete cascade,
  student_id uuid not null references profiles on delete cascade,
  checked_in_at timestamptz,
  status att_status not null,
  verification ver_status not null default 'pending',
  verified_by uuid references profiles,
  unique (session_id, student_id)       -- no duplicate check-ins
);

-- ===== 3. Tasks =====
create type task_status as enum ('scheduled','active','closed','archived');
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  task_type text not null default 'general',
  instructions text,
  max_score numeric,
  point_reward int not null default 10,
  deadline timestamptz not null,
  assigned_date date not null,
  status task_status not null default 'active',
  created_by uuid not null references profiles
);
create table task_questions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks on delete cascade,
  position int not null,
  body text not null,
  options jsonb,
  attachment_path text
);
create table task_assignments (
  task_id uuid references tasks on delete cascade,
  class_id uuid references classes on delete cascade,
  primary key (task_id, class_id)
);
create type sub_status as enum ('submitted','approved','rejected','resubmit_requested');
create table task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks on delete cascade,
  student_id uuid not null references profiles on delete cascade,
  attempt int not null default 1,
  screenshot_path text not null,        -- private bucket path, never a public URL
  reported_score numeric,
  verified_score numeric,
  note text,
  status sub_status not null default 'submitted',
  reviewer_id uuid references profiles,
  reviewed_at timestamptz,
  reviewer_comment text,
  submitted_at timestamptz not null default now(),
  unique (task_id, student_id, attempt),
  check (reviewer_id is distinct from student_id),            -- no self-approval
  check (status <> 'rejected' or reviewer_comment is not null) -- rejection needs a reason
);

-- ===== 4. Points ledger (append-only) =====
create table points_ledger (
  id bigint generated always as identity primary key,
  student_id uuid not null references profiles,
  idempotency_key text not null unique,  -- blocks duplicate awards on retry/refresh
  kind text not null check (kind in ('earn','redeem_reserve','redeem_refund','adjust')),
  points int not null check (points <> 0),
  reason text not null,
  source text not null,
  ref_id uuid,
  created_by uuid references profiles,
  created_at timestamptz not null default now()
);
create view wallet_balances as
  select student_id,
         coalesce(sum(points),0) as balance,
         coalesce(sum(points) filter (where points>0 and kind<>'redeem_refund'),0) as total_earned,
         coalesce(-sum(points) filter (where kind in ('redeem_reserve','redeem_refund')),0) as total_redeemed
  from points_ledger group by student_id;

-- block edits and deletes of history
create function forbid_change() returns trigger language plpgsql as
$$ begin raise exception 'This table is append-only'; end $$;
create trigger ledger_no_update before update or delete on points_ledger
  for each row execute function forbid_change();

-- ===== 5. Rewards =====
create table rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_path text,
  cost int not null check (cost > 0),
  stock int check (stock is null or stock >= 0),  -- null = unlimited
  per_student_limit int,
  instructions text,
  active boolean not null default true
);
create type red_status as enum ('pending','approved','rejected','ready','fulfilled','cancelled');
create table redemptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles,
  reward_id uuid not null references rewards,
  cost int not null,
  status red_status not null default 'pending',
  decided_by uuid references profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create trigger audit_no_update before update or delete on audit_logs
  for each row execute function forbid_change();

-- ===== 6. Helper functions for RLS =====
create function my_role() returns user_role language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;
create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(my_role() = 'admin', false) $$;
create function tutor_can_see_student(s uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from class_members m join tutor_classes t on t.class_id = m.class_id
                  where m.student_id = s and t.tutor_id = auth.uid()) $$;
create function can_see_student(s uuid) returns boolean language sql stable security definer set search_path = public as
$$ select s = auth.uid() or is_admin() or (my_role() = 'tutor' and tutor_can_see_student(s)) $$;
create function can_manage_class(c uuid) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or exists (select 1 from tutor_classes where class_id = c and tutor_id = auth.uid()) $$;

-- ===== 7. Row Level Security =====
do $$ declare t text; begin
  foreach t in array array['profiles','classes','class_members','tutor_classes','class_schedules','settings',
    'attendance_sessions','attendance_records','tasks','task_questions','task_assignments','task_submissions',
    'points_ledger','rewards','redemptions','notifications','audit_logs']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;

create policy profiles_read on profiles for select using (can_see_student(id) or id = auth.uid());
create policy profiles_admin on profiles for all using (is_admin()) with check (is_admin());
create policy classes_read on classes for select using (auth.uid() is not null);
create policy classes_admin on classes for all using (is_admin()) with check (is_admin());
create policy cm_read on class_members for select using (can_see_student(student_id));
create policy cm_admin on class_members for all using (is_admin()) with check (is_admin());
create policy tc_read on tutor_classes for select using (tutor_id = auth.uid() or is_admin());
create policy tc_admin on tutor_classes for all using (is_admin()) with check (is_admin());
create policy cs_read on class_schedules for select using (auth.uid() is not null);
create policy cs_admin on class_schedules for all using (is_admin()) with check (is_admin());
create policy settings_read on settings for select using (auth.uid() is not null);
create policy settings_admin on settings for all using (is_admin()) with check (is_admin());

create policy sess_read on attendance_sessions for select using (
  can_manage_class(class_id) or exists (select 1 from class_members where class_id = attendance_sessions.class_id and student_id = auth.uid()));
-- the check-in code must never reach students: expose it via a staff-only view or RPC, not this table
create policy sess_staff on attendance_sessions for all using (can_manage_class(class_id)) with check (can_manage_class(class_id));

create policy att_read on attendance_records for select using (can_see_student(student_id));
create policy att_staff_write on attendance_records for update using (
  exists (select 1 from attendance_sessions s where s.id = session_id and can_manage_class(s.class_id)));
-- students insert only through check_in() below; no direct insert/update policy for them

create policy tasks_read on tasks for select using (
  is_admin() or created_by = auth.uid() or exists (
    select 1 from task_assignments a join class_members m on m.class_id = a.class_id
    where a.task_id = tasks.id and (m.student_id = auth.uid() or can_manage_class(a.class_id))));
create policy tasks_staff on tasks for all using (my_role() in ('admin','tutor') and (is_admin() or created_by = auth.uid()))
  with check (my_role() in ('admin','tutor'));
create policy tq_read on task_questions for select using (exists (select 1 from tasks where tasks.id = task_id));
create policy ta_read on task_assignments for select using (auth.uid() is not null);
create policy ta_staff on task_assignments for all using (can_manage_class(class_id)) with check (can_manage_class(class_id));

create policy sub_read on task_submissions for select using (can_see_student(student_id));
create policy sub_insert on task_submissions for insert with check (
  student_id = auth.uid() and status = 'submitted' and reviewer_id is null);
create policy sub_review on task_submissions for update using (
  my_role() in ('admin','tutor') and tutor_can_see_student(student_id) or is_admin());

create policy ledger_read on points_ledger for select using (can_see_student(student_id));
-- no insert/update/delete policies: only SECURITY DEFINER functions write the ledger

create policy rewards_read on rewards for select using (active or is_admin());
create policy rewards_admin on rewards for all using (is_admin()) with check (is_admin());
create policy red_read on redemptions for select using (student_id = auth.uid() or is_admin());
create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_mark on notifications for update using (user_id = auth.uid());
create policy audit_admin on audit_logs for select using (is_admin());

-- ===== 8. Transactional functions (all writes that touch points or stock) =====
create function award_points(p_student uuid, p_key text, p_points int, p_kind text, p_reason text, p_source text, p_ref uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into points_ledger(student_id, idempotency_key, kind, points, reason, source, ref_id, created_by)
  values (p_student, p_key, p_kind, p_points, p_reason, p_source, p_ref, auth.uid())
  on conflict (idempotency_key) do nothing;
  return found;                        -- false means it was already awarded
end $$;

create function check_in(p_session uuid, p_code text) returns attendance_records
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions; r attendance_records;
begin
  select * into s from attendance_sessions where id = p_session;
  if not found then raise exception 'Session not found'; end if;
  if not exists (select 1 from class_members where class_id = s.class_id and student_id = auth.uid()) then
    raise exception 'Not enrolled in this class'; end if;
  if s.check_in_code is distinct from p_code then raise exception 'Invalid check-in code'; end if;
  insert into attendance_records(session_id, student_id, checked_in_at, status)
  values (s.id, auth.uid(), now(), case when now() <= s.late_after then 'punctual' else 'late' end)
  on conflict (session_id, student_id) do nothing returning * into r;
  if r.id is null then select * into r from attendance_records where session_id = s.id and student_id = auth.uid(); end if;
  return r;                            -- repeat calls return the existing record
end $$;

create function verify_attendance(p_record uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r attendance_records; s attendance_sessions; cfg settings; n int; d date;
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
  -- streak: count consecutive verified session dates ending on this one
  n := 0; d := s.session_date;
  while exists (select 1 from attendance_records a join attendance_sessions x on x.id = a.session_id
                join class_members m on m.class_id = x.class_id and m.student_id = a.student_id
                where a.student_id = r.student_id and a.verification = 'verified' and x.session_date = d) loop
    n := n + 1; d := d - 1;
  end loop;
  if n >= cfg.streak_length and n % cfg.streak_length = 0 then
    perform award_points(r.student_id, 'streak:'||r.student_id||':'||s.session_date, cfg.pts_streak, 'earn',
      n||'-day verified streak', 'streak', r.id);
  end if;
  insert into audit_logs(actor_id, action, detail) values (auth.uid(), 'attendance_verified', jsonb_build_object('record', r.id));
end $$;

create function review_submission(p_sub uuid, p_decision sub_status, p_comment text, p_verified_score numeric)
returns void language plpgsql security definer set search_path = public as $$
declare s task_submissions; t tasks; cfg settings; open_tasks int; done_tasks int;
begin
  select * into s from task_submissions where id = p_sub for update;
  if s.student_id = auth.uid() then raise exception 'You cannot review your own submission'; end if;
  if not (is_admin() or (my_role() = 'tutor' and tutor_can_see_student(s.student_id))) then raise exception 'Not allowed'; end if;
  if s.status = 'approved' then return; end if;
  if p_decision <> 'approved' and coalesce(trim(p_comment),'') = '' then raise exception 'A reason is required'; end if;
  update task_submissions set status = p_decision, reviewer_id = auth.uid(), reviewed_at = now(),
    reviewer_comment = p_comment, verified_score = p_verified_score where id = s.id;
  select * into t from tasks where id = s.task_id; select * into cfg from settings;
  if p_decision = 'approved' then
    perform award_points(s.student_id, 'task:'||s.student_id||':'||t.id, t.point_reward, 'earn', 'Approved: '||t.title, 'task', s.id);
    if t.max_score is not null and p_verified_score is not null and p_verified_score / t.max_score >= 0.8 then
      perform award_points(s.student_id, 'b80:'||s.student_id||':'||t.id, cfg.pts_score_bonus, 'earn', '80%+ verified score', 'task', s.id);
    end if;
    select count(*) into open_tasks from tasks x join task_assignments a on a.task_id = x.id
      join class_members m on m.class_id = a.class_id and m.student_id = s.student_id
      where x.assigned_date = t.assigned_date and x.status = 'active';
    select count(*) into done_tasks from task_submissions y join tasks x on x.id = y.task_id
      where y.student_id = s.student_id and y.status = 'approved' and x.assigned_date = t.assigned_date;
    if done_tasks >= open_tasks then
      perform award_points(s.student_id, 'all:'||s.student_id||':'||t.assigned_date, cfg.pts_all_tasks, 'earn', 'All tasks completed', 'task', s.id);
    end if;
  end if;
  insert into notifications(user_id, body) values (s.student_id, 'Submission '||p_decision||': '||t.title);
  insert into audit_logs(actor_id, action, detail) values (auth.uid(), 'submission_reviewed', jsonb_build_object('submission', s.id, 'decision', p_decision));
end $$;

create function request_redemption(p_reward uuid) returns redemptions
language plpgsql security definer set search_path = public as $$
declare rw rewards; red redemptions; bal int; used int;
begin
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));   -- serialize this student's requests
  select * into rw from rewards where id = p_reward for update; -- lock stock row
  if not found or not rw.active then raise exception 'Reward unavailable'; end if;
  if rw.stock is not null and rw.stock < 1 then raise exception 'Out of stock'; end if;
  select coalesce(sum(points),0) into bal from points_ledger where student_id = auth.uid();
  if bal < rw.cost then raise exception 'Not enough points'; end if;
  if rw.per_student_limit is not null then
    select count(*) into used from redemptions where student_id = auth.uid() and reward_id = rw.id and status not in ('rejected','cancelled');
    if used >= rw.per_student_limit then raise exception 'Redemption limit reached'; end if;
  end if;
  insert into redemptions(student_id, reward_id, cost) values (auth.uid(), rw.id, rw.cost) returning * into red;
  if rw.stock is not null then update rewards set stock = stock - 1 where id = rw.id; end if;
  perform award_points(auth.uid(), 'res:'||red.id, -rw.cost, 'redeem_reserve', 'Reserved: '||rw.name, 'redemption', red.id);
  insert into notifications(user_id, body) select id, 'New prize request' from profiles where role = 'admin';
  return red;
end $$;

create function decide_redemption(p_id uuid, p_status red_status) returns void
language plpgsql security definer set search_path = public as $$
declare red redemptions; rw rewards;
begin
  select * into red from redemptions where id = p_id for update;
  if red.student_id = auth.uid() then
    if not (p_status = 'cancelled' and red.status = 'pending') then raise exception 'Not allowed'; end if;
  elsif not is_admin() then raise exception 'Not allowed'; end if;
  if red.status in ('rejected','cancelled','fulfilled') then return; end if;   -- closed: no double refund
  select * into rw from rewards where id = red.reward_id for update;
  if p_status in ('rejected','cancelled') then
    perform award_points(red.student_id, 'rel:'||red.id, red.cost, 'redeem_refund', 'Refund: '||rw.name, 'redemption', red.id);
    if rw.stock is not null then update rewards set stock = stock + 1 where id = rw.id; end if;
  end if;
  update redemptions set status = p_status, decided_by = auth.uid(), updated_at = now() where id = red.id;
  insert into notifications(user_id, body) values (red.student_id, rw.name||': '||p_status);
  insert into audit_logs(actor_id, action, detail) values (auth.uid(), 'redemption_'||p_status, jsonb_build_object('id', red.id));
end $$;

create function adjust_points(p_student uuid, p_points int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  if (select coalesce(sum(points),0) from points_ledger where student_id = p_student) + p_points < 0 then
    raise exception 'Balance cannot go negative'; end if;
  perform award_points(p_student, 'adj:'||gen_random_uuid(), p_points, 'adjust', p_reason, 'admin', null);
  insert into audit_logs(actor_id, action, detail) values (auth.uid(), 'points_adjusted',
    jsonb_build_object('student', p_student, 'points', p_points, 'reason', p_reason));
end $$;

-- Lock the privileged functions to signed-in users only
revoke execute on function award_points from public, anon, authenticated;
grant execute on function check_in, verify_attendance, review_submission, request_redemption,
  decide_redemption, adjust_points to authenticated;

-- ===== 9. Private screenshot storage =====
insert into storage.buckets (id, name, public) values ('screenshots','screenshots', false) on conflict do nothing;
-- Students upload to screenshots/<their uid>/..., and read only their own folder; staff read their students' folders.
create policy shots_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy shots_read on storage.objects for select to authenticated using (
  bucket_id = 'screenshots' and can_see_student(((storage.foldername(name))[1])::uuid));
-- Serve with createSignedUrl(path, 60) from server code; never use public URLs.

-- ===== 10. Demo seed (separate from real data; delete before go-live) =====
-- Create demo users in Supabase Auth first, then insert matching profiles/classes here.
-- First admin: sign up one user in the Auth dashboard, then run:
--   insert into profiles(id, role, full_name) values ('<that auth user uuid>', 'admin', 'Academy Owner');

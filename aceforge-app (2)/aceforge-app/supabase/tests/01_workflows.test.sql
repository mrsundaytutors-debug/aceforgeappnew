-- pgTAP tests for the critical workflows. Run with: supabase test db   (needs the Supabase CLI and local Docker stack)
-- Everything runs inside one transaction that is rolled back, so no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- helper: act as a signed-in user. Call "reset role" first when switching users.
create function as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ===== fixtures (ids: a0 admin, t1 tutor of class A, t2 tutor of class B, s1/s2 in A, s3 in B) =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a0','admin@t.test'), ('00000000-0000-0000-0000-0000000000b1','t1@t.test'),
  ('00000000-0000-0000-0000-0000000000b2','t2@t.test'),   ('00000000-0000-0000-0000-0000000000c1','s1@t.test'),
  ('00000000-0000-0000-0000-0000000000c2','s2@t.test'),   ('00000000-0000-0000-0000-0000000000c3','s3@t.test');
insert into profiles (id, role, full_name, student_code) values
  ('00000000-0000-0000-0000-0000000000a0','admin','Admin',null), ('00000000-0000-0000-0000-0000000000b1','tutor','Tutor A',null),
  ('00000000-0000-0000-0000-0000000000b2','tutor','Tutor B',null), ('00000000-0000-0000-0000-0000000000c1','student','Student One','T-001'),
  ('00000000-0000-0000-0000-0000000000c2','student','Student Two','T-002'), ('00000000-0000-0000-0000-0000000000c3','student','Student Three','T-003');
insert into classes (id, name) values ('00000000-0000-0000-0000-00000000d001','Class A'), ('00000000-0000-0000-0000-00000000d002','Class B');
insert into class_members values ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-0000000000c3');
insert into tutor_classes values ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-0000000000b2');
update settings set pts_attendance=10, pts_punctual=5, pts_task=10, pts_score_bonus=5, pts_all_tasks=5, pts_streak=10, streak_length=5 where id=1;
-- e1: open now (on time). e2: yesterday, late window already passed.
insert into attendance_sessions (id, class_id, session_date, starts_at, late_after, check_in_code) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001', current_date,   now()-interval '5 minutes', now()+interval '60 minutes','CODE1'),
  ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-00000000d001', current_date-1, now()-interval '2 hours',   now()-interval '1 hour','CODE2');

-- ===== attendance =====
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select lives_ok($$select check_in('00000000-0000-0000-0000-00000000e001','CODE1')$$, 'student checks in with the right code');
select is((select status::text from attendance_records where student_id='00000000-0000-0000-0000-0000000000c1' and session_id='00000000-0000-0000-0000-00000000e001'),
  'punctual', 'check-in before the late threshold is punctual');
select lives_ok($$select check_in('00000000-0000-0000-0000-00000000e001','CODE1')$$, 'repeating the check-in does not error');
select is((select count(*)::int from attendance_records where student_id='00000000-0000-0000-0000-0000000000c1' and session_id='00000000-0000-0000-0000-00000000e001'),
  1, 'repeated check-in creates no duplicate record');
select check_in('00000000-0000-0000-0000-00000000e002','CODE2');
select is((select status::text from attendance_records where student_id='00000000-0000-0000-0000-0000000000c1' and session_id='00000000-0000-0000-0000-00000000e002'),
  'late', 'check-in after the late threshold is late');
select throws_like($$select check_in('00000000-0000-0000-0000-00000000e001','WRONG')$$, '%Invalid check-in code%', 'a wrong code is refused');
select throws_ok($$select check_in_code from attendance_sessions$$, '42501', null, 'students cannot read the check-in code');
update attendance_records set verification = 'verified' where student_id='00000000-0000-0000-0000-0000000000c1';
reset role;
select is((select count(*)::int from attendance_records where verification='verified'), 0, 'a student cannot verify their own attendance');
select set_config('test.rec1', (select id::text from attendance_records where session_id='00000000-0000-0000-0000-00000000e001'), true);
select set_config('test.rec2', (select id::text from attendance_records where session_id='00000000-0000-0000-0000-00000000e002'), true);

do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c3'); end $$;
select throws_like($$select check_in('00000000-0000-0000-0000-00000000e001','CODE1')$$, '%Not enrolled%', 'a student from another class cannot check in');
reset role;
select throws_ok($$insert into attendance_records(session_id, student_id, status) values ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000c1','late')$$,
  '23505', null, 'the database rejects a duplicate attendance row');

do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select throws_like($$select verify_attendance(current_setting('test.rec1')::uuid)$$, '%Not allowed%', 'students cannot call verify_attendance');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b2'); end $$;
select throws_like($$select verify_attendance(current_setting('test.rec1')::uuid)$$, '%Not allowed%', 'a tutor of another class cannot verify');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select lives_ok($$select verify_attendance(current_setting('test.rec1')::uuid)$$, 'the class tutor verifies attendance');
select lives_ok($$select verify_attendance(current_setting('test.rec1')::uuid)$$, 'verifying twice is harmless');
select verify_attendance(current_setting('test.rec2')::uuid);
reset role;
select is((select sum(points)::int from points_ledger where student_id='00000000-0000-0000-0000-0000000000c1'), 25,
  'on-time day pays 10+5, late day pays 10, each exactly once');
select is((select count(*)::int from points_ledger where student_id='00000000-0000-0000-0000-0000000000c1'), 3, 'three ledger rows, no duplicates');

-- ===== privacy between students and classes =====
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c2'); end $$;
select is((select count(*)::int from points_ledger where student_id='00000000-0000-0000-0000-0000000000c1'), 0, 'a student cannot read another student''s ledger');
select is((select count(*)::int from wallet_balances where student_id='00000000-0000-0000-0000-0000000000c1'), 0, 'a student cannot read another student''s balance (needs migration 005)');
select throws_ok($$insert into points_ledger(student_id, idempotency_key, kind, points, reason, source) values ('00000000-0000-0000-0000-0000000000c2','hack','earn',999,'x','x')$$,
  '42501', null, 'a student cannot write to the ledger');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b2'); end $$;
select is((select count(*)::int from profiles where id='00000000-0000-0000-0000-0000000000c1'), 0, 'a tutor cannot see students outside their classes');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select is((select count(*)::int from profiles where id='00000000-0000-0000-0000-0000000000c1'), 1, 'a tutor can see students in their class');
reset role;
select throws_like($$update points_ledger set points = 999$$, '%append-only%', 'ledger rows cannot be edited');
select throws_like($$delete from points_ledger$$, '%append-only%', 'ledger rows cannot be deleted');

-- ===== tasks and review =====
insert into tasks (id, title, max_score, point_reward, deadline, assigned_date, status, created_by) values
  ('00000000-0000-0000-0000-00000000f001','Task 1',20,10, now()+interval '1 day', current_date,'active','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-00000000f002','Task 2',20,10, now()+interval '1 day', current_date,'active','00000000-0000-0000-0000-0000000000b1');
insert into task_assignments values ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000d001'), ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-00000000d001');
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select lives_ok($$insert into task_submissions(task_id, student_id, screenshot_path, reported_score) values ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c1','c1/t1.png',18)$$, 'student submits task 1');
select lives_ok($$insert into task_submissions(task_id, student_id, screenshot_path, reported_score) values ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-0000000000c1','c1/t2.png',10)$$, 'student submits task 2');
select throws_ok($$insert into task_submissions(task_id, student_id, screenshot_path, status) values ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c1','c1/x.png','approved')$$,
  '42501', null, 'a student cannot insert an already-approved submission');
reset role;
select set_config('test.sub1', (select id::text from task_submissions where task_id='00000000-0000-0000-0000-00000000f001'), true);
select set_config('test.sub2', (select id::text from task_submissions where task_id='00000000-0000-0000-0000-00000000f002'), true);

do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select throws_like($$select review_submission(current_setting('test.sub1')::uuid,'approved','',18)$$, '%cannot review your own%', 'a student cannot approve their own submission');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b2'); end $$;
select throws_like($$select review_submission(current_setting('test.sub1')::uuid,'approved','',18)$$, '%Not allowed%', 'a tutor of another class cannot review');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select lives_ok($$select review_submission(current_setting('test.sub1')::uuid,'approved','Good',18)$$, 'tutor approves task 1 with a verified 18/20');
select lives_ok($$select review_submission(current_setting('test.sub1')::uuid,'approved','Good',18)$$, 'approving again is harmless');
select review_submission(current_setting('test.sub2')::uuid,'approved','OK',10);
reset role;
select is((select sum(points)::int from points_ledger where student_id='00000000-0000-0000-0000-0000000000c1' and source='task'), 30,
  'task 1 pays 10+5 (80% bonus), task 2 pays 10, all-tasks bonus pays 5, each once');
select is((select count(*)::int from points_ledger where idempotency_key like 'task:%'), 2, 'one completion award per task');

-- rejection needs a reason; resubmission keeps history
insert into task_submissions(id, task_id, student_id, screenshot_path) values ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c2','c2/t1.png');
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select throws_like($$select review_submission('00000000-0000-0000-0000-00000000a501','rejected','',null)$$, '%reason is required%', 'rejection without a reason is refused');
select lives_ok($$select review_submission('00000000-0000-0000-0000-00000000a501','rejected','Screenshot is cropped',null)$$, 'rejection with a reason works');
reset role;
select is((select count(*)::int from points_ledger where student_id='00000000-0000-0000-0000-0000000000c2' and source='task'), 0, 'rejected work earns no points');
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c2'); end $$;
select lives_ok($$insert into task_submissions(task_id, student_id, attempt, screenshot_path) values ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c2',2,'c2/t1b.png')$$, 'student resubmits as attempt 2');
reset role;
select is((select count(*)::int from task_submissions where student_id='00000000-0000-0000-0000-0000000000c2'), 2, 'both attempts are kept');

-- ===== redemptions (student one has 55 points; reward costs 20, two in stock) =====
insert into rewards (id, name, cost, stock) values ('00000000-0000-0000-0000-00000000aa01','Pen',20,2), ('00000000-0000-0000-0000-00000000aa02','Bag',60,5);
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select throws_like($$select request_redemption('00000000-0000-0000-0000-00000000aa02')$$, '%Not enough points%', 'cannot redeem more than the balance (55 < 60)');
select lives_ok($$select request_redemption('00000000-0000-0000-0000-00000000aa01')$$, 'first request succeeds');
reset role;
select set_config('test.red1', (select id::text from redemptions where student_id='00000000-0000-0000-0000-0000000000c1'), true);
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select lives_ok($$select request_redemption('00000000-0000-0000-0000-00000000aa01')$$, 'second request succeeds (35 >= 20)');
select throws_like($$select request_redemption('00000000-0000-0000-0000-00000000aa01')$$, '%Out of stock%', 'a third request fails: stock is gone');
reset role;
select is((select balance::int from wallet_balances where student_id='00000000-0000-0000-0000-0000000000c1'), 15, 'two reservations deducted 40 points');
select is((select stock from rewards where id='00000000-0000-0000-0000-00000000aa01'), 0, 'stock reduced by both requests');
select set_config('test.red2', (select id::text from redemptions where student_id='00000000-0000-0000-0000-0000000000c1' and id::text <> current_setting('test.red1')), true);
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select throws_like($$select decide_redemption(current_setting('test.red1')::uuid,'approved')$$, '%Not allowed%', 'a student cannot approve their own redemption');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000a0'); end $$;
select lives_ok($$select decide_redemption(current_setting('test.red1')::uuid,'rejected')$$, 'admin rejects a request');
select lives_ok($$select decide_redemption(current_setting('test.red1')::uuid,'rejected')$$, 'rejecting twice is harmless');
reset role;
select is((select balance::int from wallet_balances where student_id='00000000-0000-0000-0000-0000000000c1'), 35, 'rejection refunds exactly once');
select is((select stock from rewards where id='00000000-0000-0000-0000-00000000aa01'), 1, 'rejection returns the stock exactly once');
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000c1'); end $$;
select lives_ok($$select decide_redemption(current_setting('test.red2')::uuid,'cancelled')$$, 'student cancels a pending request');
reset role;
select is((select balance::int from wallet_balances where student_id='00000000-0000-0000-0000-0000000000c1'), 55, 'cancelling refunds the reserved points');

-- ===== streak: five verified sessions three days apart still make a streak (sessions, not calendar days) =====
insert into attendance_sessions (class_id, session_date, starts_at, late_after, check_in_code)
  select '00000000-0000-0000-0000-00000000d001', current_date - (20 - 3*i), now() - interval '30 days', now() - interval '30 days' + interval '15 minutes', 'S'||i from generate_series(0,4) i;
insert into attendance_records (session_id, student_id, status)
  select s.id, '00000000-0000-0000-0000-0000000000c2', 'punctual' from attendance_sessions s where s.check_in_code like 'S_';
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select verify_attendance(r.id) from attendance_records r join attendance_sessions s on s.id = r.session_id
  where r.student_id='00000000-0000-0000-0000-0000000000c2' and s.check_in_code in ('S0','S1','S2','S3') order by s.session_date;
reset role;
select is((select count(*)::int from points_ledger where idempotency_key like 'streak:%'), 0, 'no streak bonus after four sessions');
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select verify_attendance(r.id) from attendance_records r join attendance_sessions s on s.id = r.session_id
  where r.student_id='00000000-0000-0000-0000-0000000000c2' and s.check_in_code = 'S4';
select verify_attendance(r.id) from attendance_records r join attendance_sessions s on s.id = r.session_id
  where r.student_id='00000000-0000-0000-0000-0000000000c2' and s.check_in_code = 'S4';
reset role;
select is((select count(*)::int from points_ledger where idempotency_key like 'streak:%' and student_id='00000000-0000-0000-0000-0000000000c2'), 1, 'the fifth session pays one streak bonus, even if verified twice');

-- ===== admin point adjustments =====
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000b1'); end $$;
select throws_like($$select adjust_points('00000000-0000-0000-0000-0000000000c1', 5, 'x')$$, '%Admins only%', 'a tutor cannot adjust points');
reset role;
do $$ begin perform as_user('00000000-0000-0000-0000-0000000000a0'); end $$;
select throws_like($$select adjust_points('00000000-0000-0000-0000-0000000000c1', 5, '')$$, '%reason is required%', 'an adjustment needs a reason');
select throws_like($$select adjust_points('00000000-0000-0000-0000-0000000000c1', -9999, 'oops')$$, '%negative%', 'an adjustment cannot make the balance negative');
select lives_ok($$select adjust_points('00000000-0000-0000-0000-0000000000c1', 5, 'Bonus for helping')$$, 'a valid adjustment works');
reset role;
select ok(exists (select 1 from audit_logs where action = 'points_adjusted'), 'the adjustment is in the audit log');

select * from finish();
rollback;

-- DEMO DATA for Aceforge. Run in the Supabase SQL editor (as the postgres role) on a TEST project, after migrations 001-005.
-- Everything is tagged: logins end in @demo.aceforge.test, student IDs start with DEMO-, classes/rewards start with "Demo".
-- Remove it all with supabase/demo/remove_demo.sql. Do not mix with real students.
-- Demo password for every account: DemoPass#2026
-- Not run against a live project by the author. The auth.users columns can differ between Supabase versions; if the inserts fail, create the 8 demo users in the Auth dashboard instead and keep the rest.

create temp table demo_users (id uuid, email text, role user_role, name text, code text, cls uuid);
insert into demo_users values
 ('dddddddd-0000-0000-0000-000000000001','admin@demo.aceforge.test','admin','Demo Owner',null,null),
 ('dddddddd-0000-0000-0000-000000000002','tutor@demo.aceforge.test','tutor','Mrs Bello',null,null),
 ('dddddddd-0000-0000-0000-000000000011','ada@demo.aceforge.test','student','Ada Okafor','DEMO-001','dddddddd-0000-0000-0000-0000000000c1'),
 ('dddddddd-0000-0000-0000-000000000012','tunde@demo.aceforge.test','student','Tunde Bakare','DEMO-002','dddddddd-0000-0000-0000-0000000000c1'),
 ('dddddddd-0000-0000-0000-000000000013','chioma@demo.aceforge.test','student','Chioma Eze','DEMO-003','dddddddd-0000-0000-0000-0000000000c1'),
 ('dddddddd-0000-0000-0000-000000000014','ibrahim@demo.aceforge.test','student','Ibrahim Musa','DEMO-004','dddddddd-0000-0000-0000-0000000000c2'),
 ('dddddddd-0000-0000-0000-000000000015','ngozi@demo.aceforge.test','student','Ngozi Adeyemi','DEMO-005','dddddddd-0000-0000-0000-0000000000c2'),
 ('dddddddd-0000-0000-0000-000000000016','seyi@demo.aceforge.test','student','Seyi Johnson','DEMO-006','dddddddd-0000-0000-0000-0000000000c2');

-- logins
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, crypt('DemoPass#2026', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '' from demo_users on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from demo_users
on conflict do nothing;

insert into profiles (id, role, full_name, student_code) select id, role, name, code from demo_users on conflict (id) do nothing;
insert into classes (id, name, level) values ('dddddddd-0000-0000-0000-0000000000c1','Demo SS2 Maths','SS2'), ('dddddddd-0000-0000-0000-0000000000c2','Demo SS3 English','SS3') on conflict do nothing;
insert into class_members select cls, id from demo_users where role = 'student' on conflict do nothing;
insert into tutor_classes values ('dddddddd-0000-0000-0000-0000000000c1','dddddddd-0000-0000-0000-000000000002') on conflict do nothing;   -- tutor sees Maths only

-- past sessions (last two weeks, weekdays) plus an open session today with code DEMO1234
insert into attendance_sessions (class_id, session_date, starts_at, late_after, check_in_code)
select c.id, d::date, (d::date + time '16:00') at time zone 'Africa/Lagos', (d::date + time '16:15') at time zone 'Africa/Lagos', 'DEMO' || to_char(d, 'MMDD')
from classes c, generate_series(((now() at time zone 'Africa/Lagos')::date - 14)::timestamp, ((now() at time zone 'Africa/Lagos')::date - 1)::timestamp, interval '1 day') d
where c.name like 'Demo %' and extract(isodow from d) < 6 on conflict do nothing;
insert into attendance_sessions (class_id, session_date, starts_at, late_after, check_in_code)
select id, (now() at time zone 'Africa/Lagos')::date, now() - interval '5 minutes', now() + interval '2 hours', 'DEMO1234' from classes where name like 'Demo %' on conflict do nothing;

-- attendance: deterministic mix (about 10% absent, 10% excused, 20% late, rest punctual), all verified
insert into attendance_records (session_id, student_id, checked_in_at, status, verification, verified_by)
select s.id, m.student_id,
       case when x.h >= 2 then s.starts_at + (case when x.h <= 3 then interval '25 minutes' else interval '-4 minutes' end) end,
       (case x.h when 1 then 'excused' when 2 then 'late' when 3 then 'late' else 'punctual' end)::att_status,
       'verified', 'dddddddd-0000-0000-0000-000000000002'
from attendance_sessions s join classes c on c.id = s.class_id and c.name like 'Demo %'
join class_members m on m.class_id = s.class_id
cross join lateral (select abs(hashtext(m.student_id::text || s.session_date::text)) % 10 as h) x
where s.session_date < (now() at time zone 'Africa/Lagos')::date and x.h <> 0 on conflict do nothing;

insert into points_ledger (student_id, idempotency_key, kind, points, reason, source, ref_id, created_by, created_at)
select r.student_id, 'att:' || r.id, 'earn', 10, 'Verified attendance', 'attendance', r.id, r.verified_by, s.starts_at + interval '1 hour'
from attendance_records r join attendance_sessions s on s.id = r.session_id
where r.student_id in (select id from demo_users) and r.status in ('punctual','late') and r.verification = 'verified' on conflict do nothing;
insert into points_ledger (student_id, idempotency_key, kind, points, reason, source, ref_id, created_by, created_at)
select r.student_id, 'pun:' || r.id, 'earn', 5, 'Punctual arrival', 'attendance', r.id, r.verified_by, s.starts_at + interval '1 hour'
from attendance_records r join attendance_sessions s on s.id = r.session_id
where r.student_id in (select id from demo_users) and r.status = 'punctual' and r.verification = 'verified' on conflict do nothing;

-- one task per past session day per class; most students submit, a few miss or get rejected
create temp table demo_tasks as
select gen_random_uuid() as id, s.class_id, s.session_date as d from attendance_sessions s
where s.class_id in ('dddddddd-0000-0000-0000-0000000000c1','dddddddd-0000-0000-0000-0000000000c2') and s.session_date < (now() at time zone 'Africa/Lagos')::date;
insert into tasks (id, title, subject, task_type, instructions, max_score, point_reward, deadline, assigned_date, status, created_by)
select t.id, 'Demo practice ' || to_char(t.d, 'DD Mon'), case when c.name like '%Maths%' then 'Maths' else 'English' end, 'external_cbt',
       'Complete the practice set and screenshot your result page.', 20, 10, (t.d + time '23:59') at time zone 'Africa/Lagos', t.d, 'closed', 'dddddddd-0000-0000-0000-000000000002'
from demo_tasks t join classes c on c.id = t.class_id;
insert into task_assignments select id, class_id from demo_tasks;
insert into task_submissions (task_id, student_id, screenshot_path, reported_score, verified_score, status, reviewer_id, reviewed_at, reviewer_comment, submitted_at)
select t.id, m.student_id, 'demo/placeholder.png', least(20, 10 + x.h * 1.2)::int, case when x.h > 2 then least(20, 10 + x.h * 1.2)::int end,
       (case when x.h > 2 then 'approved' else 'rejected' end)::sub_status, 'dddddddd-0000-0000-0000-000000000002',
       t.d + interval '20 hours', case when x.h <= 2 then 'Screenshot is cropped. Please send the full result page.' end, t.d + interval '18 hours'
from demo_tasks t join class_members m on m.class_id = t.class_id
cross join lateral (select abs(hashtext(m.student_id::text || t.id::text)) % 10 as h) x where x.h >= 2;   -- h of 0 or 1 = never submitted
insert into points_ledger (student_id, idempotency_key, kind, points, reason, source, ref_id, created_by, created_at)
select sb.student_id, 'task:' || sb.student_id || ':' || sb.task_id, 'earn', 10, 'Approved: ' || t.title, 'task', sb.id, sb.reviewer_id, sb.reviewed_at
from task_submissions sb join tasks t on t.id = sb.task_id where sb.status = 'approved' and sb.student_id in (select id from demo_users) on conflict do nothing;
insert into points_ledger (student_id, idempotency_key, kind, points, reason, source, ref_id, created_by, created_at)
select sb.student_id, 'b80:' || sb.student_id || ':' || sb.task_id, 'earn', 5, '80%+ verified score', 'task', sb.id, sb.reviewer_id, sb.reviewed_at
from task_submissions sb join tasks t on t.id = sb.task_id
where sb.status = 'approved' and sb.verified_score >= 0.8 * t.max_score and sb.student_id in (select id from demo_users) on conflict do nothing;

-- rewards, one fulfilled redemption (Ada) and one pending (Tunde)
insert into rewards (id, name, description, cost, stock, instructions) values
 ('dddddddd-0000-0000-0000-0000000000a1','Demo Exercise book','80-leaf exercise book',40,20,'Collect from the front desk.'),
 ('dddddddd-0000-0000-0000-0000000000a2','Demo Pen set','Pack of 5 pens',60,10,'Collect from the front desk.'),
 ('dddddddd-0000-0000-0000-0000000000a3','Demo Free tutoring hour','One free one-hour session',150,3,'Book with your tutor.'),
 ('dddddddd-0000-0000-0000-0000000000a4','Demo Achievement certificate','Printed certificate',100,null,'Collected at the next assembly.') on conflict do nothing;
insert into redemptions (id, student_id, reward_id, cost, status, decided_by) values
 ('dddddddd-0000-0000-0000-0000000000b1','dddddddd-0000-0000-0000-000000000011','dddddddd-0000-0000-0000-0000000000a1',40,'fulfilled','dddddddd-0000-0000-0000-000000000001'),
 ('dddddddd-0000-0000-0000-0000000000b2','dddddddd-0000-0000-0000-000000000012','dddddddd-0000-0000-0000-0000000000a2',60,'pending',null) on conflict do nothing;
insert into points_ledger (student_id, idempotency_key, kind, points, reason, source, ref_id)
values ('dddddddd-0000-0000-0000-000000000011','res:dddddddd-0000-0000-0000-0000000000b1','redeem_reserve',-40,'Reserved: Demo Exercise book','redemption','dddddddd-0000-0000-0000-0000000000b1'),
       ('dddddddd-0000-0000-0000-000000000012','res:dddddddd-0000-0000-0000-0000000000b2','redeem_reserve',-60,'Reserved: Demo Pen set','redemption','dddddddd-0000-0000-0000-0000000000b2') on conflict do nothing;
update rewards set stock = stock - 1 where id = 'dddddddd-0000-0000-0000-0000000000a1';
update rewards set stock = stock - 1 where id = 'dddddddd-0000-0000-0000-0000000000a2';
insert into audit_logs (actor_id, action, detail) values ('dddddddd-0000-0000-0000-000000000001', 'demo_seed_loaded', '{"note":"demo data"}');

-- Not seeded: streak and all-tasks bonuses (the live functions award those), and real screenshot images (review pages will show a broken image for demo submissions).
-- Demo logins: admin@demo.aceforge.test, tutor@demo.aceforge.test, ada@demo.aceforge.test (and the other students). Today's class code: DEMO1234.

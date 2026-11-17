-- Removes everything created by seed_demo.sql and nothing else. Run as the postgres role.
-- The ledger is append-only, so its protection trigger is switched off for the clean-up and switched back on at the end.
begin;
alter table points_ledger disable trigger ledger_no_update;
alter table audit_logs disable trigger audit_no_update;

delete from points_ledger where student_id in (select id from profiles where student_code like 'DEMO-%' or full_name in ('Demo Owner','Mrs Bello'));
delete from redemptions where student_id in (select id from profiles where student_code like 'DEMO-%');
delete from tasks where created_by = 'dddddddd-0000-0000-0000-000000000002' and title like 'Demo practice %';   -- cascades assignments, questions, submissions
delete from attendance_sessions where class_id in (select id from classes where name like 'Demo %');            -- cascades attendance records
delete from rewards where name like 'Demo %';
delete from classes where name like 'Demo %';                                                                     -- cascades memberships and tutor links
delete from audit_logs where actor_id in (select id from profiles where student_code like 'DEMO-%' or id in ('dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002'));
delete from auth.users where email like '%@demo.aceforge.test';                                                   -- cascades profiles and notifications

alter table points_ledger enable trigger ledger_no_update;
alter table audit_logs enable trigger audit_no_update;
commit;

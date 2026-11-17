-- 005: views run with their owner's rights by default, which bypasses RLS on points_ledger.
-- Without this, any signed-in student could read every student's balance through wallet_balances.
alter view wallet_balances set (security_invoker = true);   -- needs Postgres 15+, which Supabase uses

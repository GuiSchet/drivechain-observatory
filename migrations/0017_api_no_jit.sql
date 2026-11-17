-- The API runs short, index-driven queries, but some of them (the bids behind
-- /sidechains/{slot}/stats) are estimated above jit_above_cost, so PostgreSQL
-- compiles them to machine code on every call. Measured on Betanet
-- (2026-11-17, all pages in memory): the bids query for slot 2 took 2.0-2.2 s
-- with JIT and 0.28 s without, and pg_stat_statements put 1.7 s of each call
-- in JIT compilation. Turned off for the API role only; the sync's long
-- replays keep the server default. It applies to new connections, so to every
-- API connection after the deploy restarts it. Fresh databases get it from
-- deploy/postgres/init-roles.sh.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_api') THEN
        ALTER ROLE pulse_api SET jit = off;
    END IF;
END $$;

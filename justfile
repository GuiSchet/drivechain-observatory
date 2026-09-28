set dotenv-load := true

check-backend:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cargo test --workspace --all-features

check-web:
    npm --prefix apps/web run typecheck
    npm --prefix apps/web run build

check: check-backend check-web

fmt:
    cargo fmt --all

db-up:
    docker compose --env-file .env -f deploy/compose.yaml up -d postgres

db-down:
    docker compose --env-file .env -f deploy/compose.yaml down

migrate:
    docker compose --env-file .env -f deploy/compose.yaml run --rm migrate

api:
    cargo run -p pulse-api

sync-once:
    cargo run -p pulse-sync -- --once

web:
    npm --prefix apps/web run dev

verify-local:
    sh scripts/verify-local.sh

FROM rust:1.96.0-bookworm@sha256:5e2214abe154fe26e39f64488952e5c991eeed1d6d6da7cc8381ae83927f0cfc AS builder

WORKDIR /src
COPY Cargo.toml Cargo.lock* rust-toolchain.toml rustfmt.toml ./
COPY apps/api ./apps/api
COPY apps/sync ./apps/sync
COPY crates ./crates
COPY migrations ./migrations
RUN cargo build --locked --release --workspace

FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 pulse
COPY --from=builder /src/target/release/pulse-api /usr/local/bin/pulse-api
COPY --from=builder /src/target/release/pulse-sync /usr/local/bin/pulse-sync

USER pulse
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/pulse-api"]

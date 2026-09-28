FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssh-client netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 tunnel \
    && useradd --uid 1000 --gid 1000 --create-home tunnel

USER tunnel
ENTRYPOINT ["ssh"]

#!/bin/sh
# Runs the SSH forward and exits once it stops forwarding, so the restart
# policy replaces it. A live SSH session can keep answering keepalives while
# its forwarded channels no longer connect; only an end-to-end probe sees that.
set -u

# A PostgreSQL SSLRequest: the server always answers with one byte (N or S).
probe() {
    [ -n "$(printf '\000\000\000\010\004\322\026\057' | nc -N -w 5 127.0.0.1 5432 2>/dev/null | head -c 1)" ]
}

ssh "$@" &
pid=$!
trap 'kill "$pid" 2>/dev/null' TERM INT

sleep 15
failures=0
while kill -0 "$pid" 2>/dev/null; do
    if probe; then
        failures=0
    else
        failures=$((failures + 1))
    fi
    if [ "$failures" -ge 3 ]; then
        echo "forward to the monitor database is unresponsive; restarting the tunnel" >&2
        kill "$pid" 2>/dev/null
        wait "$pid"
        exit 1
    fi
    sleep 20
done
wait "$pid"

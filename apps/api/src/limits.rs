//! Per-client limits, so that repeated legitimate-looking requests cannot exhaust the API: a token bucket on every
//! request, and a cap on open live streams (each one costs a replay and holds a connection for hours).
//!
//! The limits are generous for a person browsing: a sidechain page opens ~15 requests at once and a few more per
//! block. They exist to bound one client, not to shape normal traffic.

use std::{
    collections::HashMap,
    net::{IpAddr, Ipv6Addr, SocketAddr},
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};

use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::RETRY_AFTER},
    middleware::Next,
    response::{IntoResponse, Response},
};

/// Buckets idle longer than a full refill are forgotten; this bounds how often the map is swept.
const SWEEP_EVERY: Duration = Duration::from_secs(60);
/// Clients tracked at once. Past it a new client is refused until the sweep frees room, so a flood of addresses
/// costs bounded memory instead of growing the map.
const MAX_CLIENTS: usize = 100_000;

/// The key a request is limited under: one IPv4 address, or one IPv6 /64 (what a single host usually gets).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct Client(IpAddr);

impl Client {
    /// Behind our proxy (a loopback or private peer) the client is the rightmost `X-Forwarded-For` entry: the one
    /// the proxy itself appended. Caddy discards the header a client sends, so it cannot be forged through it. A
    /// public peer reached us directly and is taken as it is, header or not.
    pub(crate) fn from_request(peer: IpAddr, headers: &HeaderMap) -> Self {
        let forwarded = || {
            headers
                .get_all("x-forwarded-for")
                .iter()
                .filter_map(|v| v.to_str().ok())
                .flat_map(|v| v.split(','))
                .next_back()
                .and_then(|v| v.trim().parse::<IpAddr>().ok())
        };
        let ip = if is_proxy(peer) {
            forwarded().unwrap_or(peer)
        } else {
            peer
        };
        Self(match canonical(ip) {
            IpAddr::V6(v6) => {
                let s = v6.segments();
                IpAddr::V6(Ipv6Addr::new(s[0], s[1], s[2], s[3], 0, 0, 0, 0))
            }
            v4 => v4,
        })
    }
}

fn canonical(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(ip, IpAddr::V4),
        v4 => v4,
    }
}

fn is_proxy(peer: IpAddr) -> bool {
    match canonical(peer) {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private(),
        // Loopback, or unique local fc00::/7 (Docker's IPv6 networks).
        IpAddr::V6(v6) => v6.is_loopback() || (v6.segments()[0] & 0xfe00) == 0xfc00,
    }
}

/// A token bucket per client: `burst` requests at once, refilled at `per_second`.
pub(crate) struct RateLimiter {
    per_second: f64,
    burst: f64,
    state: Mutex<Buckets>,
}

struct Buckets {
    clients: HashMap<Client, (f64, Instant)>,
    swept: Instant,
}

impl RateLimiter {
    pub(crate) fn new(per_second: u32, burst: u32) -> Self {
        Self {
            per_second: f64::from(per_second.max(1)),
            burst: f64::from(burst.max(1)),
            state: Mutex::new(Buckets {
                clients: HashMap::new(),
                swept: Instant::now(),
            }),
        }
    }

    /// Takes one token, or says how long until the next one.
    pub(crate) fn take(&self, client: Client, now: Instant) -> Result<(), Duration> {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        let full = Duration::from_secs_f64(self.burst / self.per_second);
        if now.duration_since(state.swept) >= SWEEP_EVERY
            || (state.clients.len() >= MAX_CLIENTS && !state.clients.contains_key(&client))
        {
            // A bucket left alone for a full refill is full again: forgetting it changes nothing.
            state
                .clients
                .retain(|_, (_, seen)| now.duration_since(*seen) < full);
            state.swept = now;
        }
        if state.clients.len() >= MAX_CLIENTS && !state.clients.contains_key(&client) {
            return Err(Duration::from_secs(1));
        }
        let (tokens, seen) = state.clients.entry(client).or_insert((self.burst, now));
        *tokens =
            (*tokens + now.duration_since(*seen).as_secs_f64() * self.per_second).min(self.burst);
        *seen = now;
        if *tokens >= 1.0 {
            *tokens -= 1.0;
            Ok(())
        } else {
            Err(Duration::from_secs_f64((1.0 - *tokens) / self.per_second))
        }
    }
}

/// Open live streams, in total and per client.
pub(crate) struct StreamSlots {
    max: usize,
    per_client: u32,
    open: Mutex<(usize, HashMap<Client, u32>)>,
}

/// One open stream; dropping it (the client left, or the stream ended) frees the slot.
pub(crate) struct StreamSlot {
    slots: Arc<StreamSlots>,
    client: Client,
}

impl StreamSlots {
    pub(crate) fn new(max: usize, per_client: u32) -> Arc<Self> {
        Arc::new(Self {
            max,
            per_client,
            open: Mutex::new((0, HashMap::new())),
        })
    }

    pub(crate) fn acquire(self: &Arc<Self>, client: Client) -> Option<StreamSlot> {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        let (total, clients) = &mut *open;
        let mine = clients.entry(client).or_insert(0);
        if *total >= self.max || *mine >= self.per_client {
            if *mine == 0 {
                clients.remove(&client);
            }
            return None;
        }
        *mine += 1;
        *total += 1;
        Some(StreamSlot {
            slots: Arc::clone(self),
            client,
        })
    }

    #[cfg(test)]
    fn open(&self) -> (usize, usize) {
        let open = self.open.lock().unwrap();
        (open.0, open.1.len())
    }
}

impl Drop for StreamSlot {
    fn drop(&mut self) {
        let mut open = self
            .slots
            .open
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let (total, clients) = &mut *open;
        *total -= 1;
        if let Some(mine) = clients.get_mut(&self.client) {
            *mine -= 1;
            if *mine == 0 {
                clients.remove(&self.client);
            }
        }
    }
}

/// 429 in the API's error format, with `Retry-After` in whole seconds.
pub(crate) fn too_many(message: &'static str, retry: Duration) -> Response {
    let mut response = crate::AppError {
        status: StatusCode::TOO_MANY_REQUESTS,
        code: "rate_limited",
        message,
    }
    .into_response();
    let seconds = retry.as_secs() + u64::from(retry.subsec_nanos() > 0);
    response
        .headers_mut()
        .insert(RETRY_AFTER, HeaderValue::from(seconds.max(1)));
    response
}

/// Identifies the client, records it for the handlers (the stream counts its slots by it), and spends a token.
pub(crate) async fn rate_limit(
    State(limiter): State<Arc<RateLimiter>>,
    mut request: Request,
    next: Next,
) -> Response {
    // Always present when served with connect info; a missing peer (tests) counts as one shared local client.
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map_or(IpAddr::from([127, 0, 0, 1]), |c| c.0.ip());
    let client = Client::from_request(peer, request.headers());
    request.extensions_mut().insert(client);
    match limiter.take(client, Instant::now()) {
        Ok(()) => next.run(request).await,
        Err(retry) => {
            tracing::debug!(?client, "rate limited");
            too_many("Too many requests; retry shortly", retry)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(xff: &[&str]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for v in xff {
            h.append("x-forwarded-for", HeaderValue::from_str(v).unwrap());
        }
        h
    }
    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn forwarded_for_is_trusted_only_from_the_proxy() {
        let proxy = ip("172.18.0.5");
        assert_eq!(
            Client::from_request(proxy, &headers(&["203.0.113.7"])),
            Client(ip("203.0.113.7"))
        );
        // The rightmost entry is the one our proxy appended.
        assert_eq!(
            Client::from_request(proxy, &headers(&["1.1.1.1, 203.0.113.7"])),
            Client(ip("203.0.113.7"))
        );
        assert_eq!(
            Client::from_request(proxy, &headers(&["1.1.1.1", "203.0.113.7"])),
            Client(ip("203.0.113.7"))
        );
        assert_eq!(Client::from_request(proxy, &headers(&[])), Client(proxy));
        assert_eq!(
            Client::from_request(proxy, &headers(&["garbage"])),
            Client(proxy)
        );
        // A public peer cannot pick its key with the header.
        let public = ip("198.51.100.9");
        assert_eq!(
            Client::from_request(public, &headers(&["203.0.113.7"])),
            Client(public)
        );
        assert_eq!(
            Client::from_request(ip("::ffff:198.51.100.9"), &headers(&["203.0.113.7"])),
            Client(public)
        );
    }

    #[test]
    fn ipv6_clients_share_their_64() {
        let proxy = ip("127.0.0.1");
        let a = Client::from_request(proxy, &headers(&["2001:db8:1:2:aaaa::1"]));
        let b = Client::from_request(proxy, &headers(&["2001:db8:1:2:bbbb::9"]));
        let other = Client::from_request(proxy, &headers(&["2001:db8:1:3::1"]));
        assert_eq!(a, b);
        assert_ne!(a, other);
        assert_eq!(
            Client::from_request(proxy, &headers(&["::ffff:203.0.113.7"])),
            Client(ip("203.0.113.7"))
        );
    }

    #[test]
    fn bucket_allows_a_burst_then_refills() {
        let limiter = RateLimiter::new(10, 5);
        let (a, b) = (Client(ip("203.0.113.1")), Client(ip("203.0.113.2")));
        let t = Instant::now();
        for _ in 0..5 {
            assert!(limiter.take(a, t).is_ok());
        }
        let wait = limiter.take(a, t).unwrap_err();
        assert!(wait > Duration::ZERO && wait <= Duration::from_millis(100));
        // Other clients are unaffected.
        assert!(limiter.take(b, t).is_ok());
        // One token back after 100 ms at 10/s, and never more than the burst.
        assert!(limiter.take(a, t + Duration::from_millis(100)).is_ok());
        assert!(limiter.take(a, t + Duration::from_millis(100)).is_err());
        let later = t + Duration::from_secs(3600);
        for _ in 0..5 {
            assert!(limiter.take(a, later).is_ok());
        }
        assert!(limiter.take(a, later).is_err());
    }

    #[test]
    fn idle_buckets_are_forgotten() {
        let limiter = RateLimiter::new(10, 5);
        let t = Instant::now();
        for i in 0..50u8 {
            limiter
                .take(Client(IpAddr::from([203, 0, 113, i])), t)
                .unwrap();
        }
        limiter
            .take(Client(ip("198.51.100.1")), t + SWEEP_EVERY)
            .unwrap();
        assert_eq!(limiter.state.lock().unwrap().clients.len(), 1);
    }

    #[test]
    fn stream_slots_cap_each_client_and_the_total() {
        let slots = StreamSlots::new(3, 2);
        let (a, b, c) = (
            Client(ip("203.0.113.1")),
            Client(ip("203.0.113.2")),
            Client(ip("203.0.113.3")),
        );
        let a1 = slots.acquire(a).unwrap();
        let a2 = slots.acquire(a).unwrap();
        assert!(slots.acquire(a).is_none(), "per-client cap");
        let b1 = slots.acquire(b).unwrap();
        assert!(slots.acquire(c).is_none(), "total cap");
        assert_eq!(slots.open(), (3, 2), "a refused client leaves no entry");
        drop(a1);
        let c1 = slots.acquire(c).unwrap();
        drop((a2, b1, c1));
        assert_eq!(slots.open(), (0, 0));
    }
}

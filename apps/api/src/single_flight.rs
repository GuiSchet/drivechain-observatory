//! A short-lived result cache with single flight: concurrent requests for one key wait for the first computation
//! instead of repeating it, and the result is reused until its TTL ends. Errors are not cached.
use std::collections::HashMap;
use std::future::Future;
use std::hash::Hash;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

type Flight = Arc<tokio::sync::Mutex<()>>;

pub struct TtlSingleFlight<K, V> {
    ttl: Duration,
    cache: Mutex<HashMap<K, (Instant, Arc<V>)>>,
    flights: Mutex<HashMap<K, Flight>>,
}

/// Holds a key's flight; on drop (also when the request is cancelled) it forgets the flight once nobody else holds
/// or waits on it, so the map only ever has the keys in flight.
struct FlightGuard<'a, K: Eq + Hash + Clone, V> {
    owner: &'a TtlSingleFlight<K, V>,
    key: K,
    flight: Option<Flight>,
}

impl<K: Eq + Hash + Clone, V> Drop for FlightGuard<'_, K, V> {
    fn drop(&mut self) {
        let mut flights = self
            .owner
            .flights
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        self.flight.take();
        if flights
            .get(&self.key)
            .is_some_and(|f| Arc::strong_count(f) == 1)
        {
            flights.remove(&self.key);
        }
    }
}

impl<K: Eq + Hash + Clone, V> TtlSingleFlight<K, V> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            cache: Mutex::default(),
            flights: Mutex::default(),
        }
    }

    fn cached(&self, key: &K) -> Option<Arc<V>> {
        let cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
        cache
            .get(key)
            .filter(|(at, _)| at.elapsed() < self.ttl)
            .map(|(_, v)| v.clone())
    }

    pub async fn get_or_compute<E, F, Fut>(&self, key: K, compute: F) -> Result<Arc<V>, E>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<V, E>>,
    {
        if let Some(hit) = self.cached(&key) {
            return Ok(hit);
        }
        let flight = {
            let mut flights = self.flights.lock().unwrap_or_else(PoisonError::into_inner);
            flights.entry(key.clone()).or_default().clone()
        };
        let guard = FlightGuard {
            owner: self,
            key: key.clone(),
            flight: Some(flight),
        };
        let _turn = guard.flight.as_ref().expect("held until drop").lock().await;
        // Whoever held the turn before may have computed it.
        if let Some(hit) = self.cached(&key) {
            return Ok(hit);
        }
        let value = Arc::new(compute().await?);
        // Cached before the turn is released, so the next waiter finds it instead of computing again.
        let mut cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
        cache.retain(|_, (at, _)| at.elapsed() < self.ttl);
        cache.insert(key, (Instant::now(), value.clone()));
        Ok(value)
    }

    #[cfg(test)]
    fn flights_in_use(&self) -> usize {
        self.flights
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    async fn slow(counter: &AtomicUsize, value: u32) -> Result<u32, String> {
        counter.fetch_add(1, Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(50)).await;
        Ok(value)
    }

    #[tokio::test]
    async fn concurrent_requests_for_one_key_compute_once() {
        let cache = Arc::new(TtlSingleFlight::<u8, u32>::new(Duration::from_secs(15)));
        let counter = Arc::new(AtomicUsize::new(0));
        let tasks: Vec<_> = (0..20)
            .map(|_| {
                let (cache, counter) = (cache.clone(), counter.clone());
                tokio::spawn(async move {
                    *cache.get_or_compute(1, || slow(&counter, 7)).await.unwrap()
                })
            })
            .collect();
        for task in tasks {
            assert_eq!(task.await.unwrap(), 7);
        }
        assert_eq!(counter.load(Ordering::SeqCst), 1);
        assert_eq!(cache.flights_in_use(), 0, "no flight left behind");
        cache.get_or_compute(2, || slow(&counter, 8)).await.unwrap();
        assert_eq!(
            counter.load(Ordering::SeqCst),
            2,
            "another key computes on its own"
        );
    }

    #[tokio::test]
    async fn results_expire_and_errors_are_not_cached() {
        let cache = TtlSingleFlight::<u8, u32>::new(Duration::from_millis(40));
        let counter = AtomicUsize::new(0);
        cache.get_or_compute(1, || slow(&counter, 1)).await.unwrap();
        cache.get_or_compute(1, || slow(&counter, 1)).await.unwrap();
        assert_eq!(counter.load(Ordering::SeqCst), 1, "reused within the TTL");
        tokio::time::sleep(Duration::from_millis(60)).await;
        cache.get_or_compute(1, || slow(&counter, 1)).await.unwrap();
        assert_eq!(
            counter.load(Ordering::SeqCst),
            2,
            "recomputed after it (clock-based windows move on)"
        );
        let failed: Result<_, String> = cache
            .get_or_compute(3, || async { Err("timeout".to_owned()) })
            .await;
        assert!(failed.is_err());
        cache.get_or_compute(3, || slow(&counter, 3)).await.unwrap();
        assert_eq!(counter.load(Ordering::SeqCst), 3, "an error is not cached");
    }

    #[tokio::test]
    async fn a_cancelled_request_leaves_no_flight() {
        let cache = Arc::new(TtlSingleFlight::<u8, u32>::new(Duration::from_secs(15)));
        let counter = Arc::new(AtomicUsize::new(0));
        let (c, n) = (cache.clone(), counter.clone());
        let task = tokio::spawn(async move { c.get_or_compute(1, || slow(&n, 1)).await });
        tokio::time::sleep(Duration::from_millis(10)).await;
        task.abort();
        let _ = task.await;
        assert_eq!(cache.flights_in_use(), 0);
        assert_eq!(
            *cache.get_or_compute(1, || slow(&counter, 2)).await.unwrap(),
            2,
            "the next request computes"
        );
    }
}

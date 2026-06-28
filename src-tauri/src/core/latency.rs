//! Bounded endpoint latency probe.
//!
//! [`measure`] times a few lightweight GET requests against a provider base URL
//! and reports the median round-trip. It sends **NO auth header** — only timing
//! and the response status ever leave this module, never a key/token. Every
//! request is bounded by a hard timeout (connect + total), so an unreachable or
//! black-holed address returns `ok:false` quickly instead of hanging. The probe
//! never panics: any transport error is folded into the result.

use std::time::{Duration, Instant};

use reqwest::blocking::Client;

use crate::model::LatencyResult;

/// Probe `base_url` with one throwaway warm-up request followed by `samples`
/// timed GET requests, returning the median round-trip.
///
/// - No `Authorization` (or any auth) header is ever attached.
/// - Each request is bounded by `timeout` (both the connect phase and the whole
///   request), so an unroutable host fails fast rather than blocking.
/// - A reachable endpoint that answers with a non-2xx still yields `ms` and
///   `ok:true` — any arriving response counts as reachable.
/// - When no sample produces a response (every attempt timed out / could not
///   connect), the result is `ok:false`, `ms:None`, `status:None`.
pub fn measure(base_url: &str, samples: usize, timeout: Duration) -> LatencyResult {
    // One client, reused for the warm-up and every sample. No default headers are
    // set, so no auth ever rides along. A failed build (e.g. no TLS backend) is
    // treated like an unreachable endpoint rather than a panic.
    let client = match Client::builder()
        .connect_timeout(timeout)
        .timeout(timeout)
        .build()
    {
        Ok(c) => c,
        Err(_) => return LatencyResult::default(),
    };

    // Warm-up: prime DNS / the connection; its timing is discarded.
    let _ = probe(&client, base_url);

    let mut durations: Vec<Duration> = Vec::with_capacity(samples);
    let mut last_status: Option<u16> = None;
    for _ in 0..samples.max(1) {
        if let Some((elapsed, status)) = probe(&client, base_url) {
            durations.push(elapsed);
            last_status = Some(status);
        }
    }

    if durations.is_empty() {
        // Nothing answered within the hard timeout -> unreachable.
        return LatencyResult::default();
    }

    durations.sort_unstable();
    let median = durations[durations.len() / 2];
    LatencyResult {
        ms: Some(median.as_millis() as u64),
        ok: true,
        status: last_status,
    }
}

/// One timed GET. Returns `(elapsed, status)` when a response arrived (any
/// status), or `None` on a timeout / connect error. Never panics.
fn probe(client: &Client, base_url: &str) -> Option<(Duration, u16)> {
    let start = Instant::now();
    match client.get(base_url).send() {
        Ok(resp) => Some((start.elapsed(), resp.status().as_u16())),
        Err(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    /// A throwaway loopback HTTP/1.1 server that answers every connection with a
    /// fixed status, closing the socket after each response. Returns the bound
    /// `http://127.0.0.1:PORT/` URL; the accept loop leaks for the test's life.
    fn spawn_server(status_line: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
        let addr = listener.local_addr().expect("local addr");
        thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = match stream {
                    Ok(s) => s,
                    Err(_) => break,
                };
                // Best-effort drain of the request so the client can finish writing.
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let body = "ok";
                let resp = format!(
                    "HTTP/1.1 {status_line}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
            }
        });
        format!("http://{addr}/")
    }

    #[test]
    fn reachable_url_yields_ms_and_ok() {
        let url = spawn_server("200 OK");
        let res = measure(&url, 3, Duration::from_millis(500));
        assert!(res.ok, "a reachable endpoint must be ok");
        assert!(res.ms.is_some(), "a reachable endpoint must report ms");
        assert_eq!(res.status, Some(200));
    }

    #[test]
    fn reachable_non_2xx_still_yields_ms() {
        // A non-2xx response is still a response -> reachable, with a timing.
        let url = spawn_server("503 Service Unavailable");
        let res = measure(&url, 3, Duration::from_millis(500));
        assert!(res.ok, "any arriving response counts as reachable");
        assert!(res.ms.is_some());
        assert_eq!(res.status, Some(503));
    }

    #[test]
    fn unroutable_address_fails_within_timeout() {
        // 10.255.255.1 is a black hole on most networks: the connect never
        // completes, so each attempt must abort at the hard timeout.
        let timeout = Duration::from_millis(300);
        let started = Instant::now();
        let res = measure("http://10.255.255.1/", 1, timeout);
        let elapsed = started.elapsed();

        assert!(!res.ok, "an unroutable host must report not-ok");
        assert!(res.ms.is_none(), "no response -> no ms");
        assert!(res.status.is_none());
        // warm-up + 1 sample = 2 bounded attempts; comfortably under a wall clock
        // that proves the hard timeout is honored (never the OS default minutes).
        assert!(
            elapsed < timeout * 6,
            "probe must stay bounded by the timeout, took {elapsed:?}"
        );
    }
}

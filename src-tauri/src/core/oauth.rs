//! OAuth token freshness for the account vault: expiry judgement, credential
//! lineage fingerprints, and the classification of a refresh failure.
//!
//! Why this module exists: a stored account snapshot goes stale on its own.
//! Claude Code rotates the refresh token on **every** refresh (measured
//! 2026-09-07: the live credential and a snapshot captured hours earlier carry
//! different `refreshToken` values whose `refreshTokenExpiresAt` differ by ~1s,
//! i.e. two generations of one login), and the grant is single-use — whoever
//! POSTs it first invalidates the other copy. Activating a stale snapshot
//! therefore hands Claude Code a dead credential, which surfaces as a 403 on
//! the first-party MCP handshake long before anything says "log in again".
//!
//! Everything network-facing goes through [`TokenEndpoint`] so the judgement
//! logic here is testable without touching the real endpoint.
//!
//! SECRET: token strings pass through this module but never leave it — the
//! fingerprint is a hash, and no error string ever embeds a token.
#![allow(dead_code)] // wired up by the switch flow in a later task

use std::time::Duration;

use reqwest::blocking::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Treat a credential as needing a refresh this long before it actually expires.
/// Matches Claude Code's own 5-minute skew buffer, so we never hand it a token
/// it would immediately consider expired.
pub const EXPIRY_BUFFER_MS: i64 = 5 * 60 * 1000;

/// True when `claudeAiOauth` expires within [`EXPIRY_BUFFER_MS`] of `now_ms`.
///
/// A missing or non-numeric `expiresAt` counts as near-expiry: we cannot prove
/// the token is good, and refreshing an already-good token costs one round trip
/// whereas activating a dead one costs the user a broken session.
pub fn is_near_expiry(oauth: &Value, now_ms: i64) -> bool {
    match oauth.get("expiresAt").and_then(Value::as_i64) {
        Some(expires_at) => now_ms + EXPIRY_BUFFER_MS >= expires_at,
        None => true,
    }
}

/// Stable identity of a credential *lineage*, for compare-and-swap on write-back.
///
/// It hashes the **refresh** token, not the whole credential: the access token
/// is replaced on every refresh, so a whole-content hash would report "changed"
/// on every comparison and the CAS would degenerate into never writing. The
/// refresh token is stable within a lineage and changes exactly when the lineage
/// advances — which is the event the CAS exists to detect.
///
/// Credentials with no refresh token (API keys, setup tokens) never rotate, so
/// for those the content itself is the identity.
pub fn fingerprint(oauth: &Value) -> String {
    match oauth.get("refreshToken").and_then(Value::as_str) {
        Some(rt) if !rt.is_empty() => format!("sha256:{}", hex(rt.as_bytes())),
        _ => format!("sha256-full:{}", hex(oauth.to_string().as_bytes())),
    }
}

/// First 8 characters of a fingerprint — the only form safe for logs and UI.
pub fn fingerprint_short(fp: &str) -> String {
    let body = fp.split_once(':').map(|(_, b)| b).unwrap_or(fp);
    body.chars().take(8).collect()
}

fn hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// A refresh that will never succeed for this credential, however many times it
/// is retried.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermanentKind {
    /// The server rejected the grant: this refresh-token lineage is dead.
    InvalidGrant,
    /// The stored credential is structurally complete but carries no refresh
    /// token, so there is nothing to present.
    NoRefreshToken,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefreshError {
    /// Dead for good — quarantine the account and ask the user to sign in again.
    Permanent(PermanentKind),
    /// Refused identically every time until something outside this process
    /// changes (e.g. a rejected client registration). Not the account's fault.
    Deterministic(String),
    /// Network trouble, a timeout, or an unclassifiable response. Retryable.
    Transient(String),
}

impl RefreshError {
    pub fn is_permanent(&self) -> bool {
        matches!(self, RefreshError::Permanent(_))
    }
}

/// Classify an HTTP failure from the token endpoint.
///
/// Permanent requires BOTH a 4xx AND the server naming the verdict in the body
/// (RFC 6749 §5.2's top-level `error` member). Anything ambiguous stays
/// transient on purpose: misjudging a transient costs one retry, while
/// misjudging a permanent quarantines a live credential and forces the user
/// through a needless re-login.
pub fn classify_http(status: u16, body: &str) -> RefreshError {
    if !(400..500).contains(&status) {
        return RefreshError::Transient(format!("http {status}"));
    }
    match rfc6749_error(body) {
        Some(e) if e == "invalid_grant" => RefreshError::Permanent(PermanentKind::InvalidGrant),
        Some(e) if e == "invalid_client" || e == "unauthorized_client" => {
            RefreshError::Deterministic(e)
        }
        Some(e) => RefreshError::Transient(format!("http {status}: {e}")),
        None => RefreshError::Transient(format!("http {status}")),
    }
}

/// The top-level `error` member of an RFC 6749 §5.2 error response, if the body
/// is one. A nested `error` (e.g. `{"error":{"type":"..."}}`) is not that shape
/// and must not be read as a verdict.
fn rfc6749_error(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    v.get("error")?.as_str().map(str::to_string)
}

/// A successful token-endpoint response.
#[derive(Debug, Clone, PartialEq)]
pub struct TokenResponse {
    pub access_token: String,
    /// Lifetime in seconds, as returned; the caller turns it into `expiresAt`.
    pub expires_in: i64,
    /// Present means the lineage rotated — it MUST be written back, or the
    /// stored copy keeps a spent grant.
    pub refresh_token: Option<String>,
    /// Space-delimited scope list, when the server restates it.
    pub scope: Option<String>,
}

impl TokenResponse {
    /// Parse the endpoint's JSON body. A body missing `access_token` is not a
    /// success however it arrived.
    pub fn from_json(body: &str) -> Result<TokenResponse, RefreshError> {
        let v: Value = serde_json::from_str(body)
            .map_err(|e| RefreshError::Transient(format!("unparseable token response: {e}")))?;
        let access_token = v
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| RefreshError::Transient("token response has no access_token".into()))?;
        Ok(TokenResponse {
            access_token: access_token.to_string(),
            expires_in: v.get("expires_in").and_then(Value::as_i64).unwrap_or(0),
            refresh_token: v
                .get("refresh_token")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            scope: v
                .get("scope")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
        })
    }
}

/// What one refresh attempt produced: the successor credential, or why not.
#[derive(Debug, Clone)]
pub struct RefreshOutcome {
    /// The updated `claudeAiOauth` object on success.
    pub credentials: Option<Value>,
    pub error: Option<RefreshError>,
    /// Fingerprint of the credential whose grant was actually POSTed, so a
    /// permanent verdict can be pinned to the generation it struck down.
    pub consumed_fp: Option<String>,
}

impl RefreshOutcome {
    fn ok(credentials: Value, consumed_fp: String) -> Self {
        RefreshOutcome { credentials: Some(credentials), error: None, consumed_fp: Some(consumed_fp) }
    }
    fn err(error: RefreshError, consumed_fp: Option<String>) -> Self {
        RefreshOutcome { credentials: None, error: Some(error), consumed_fp }
    }
}

/// The token endpoint, abstracted so tests never reach the network.
pub trait TokenEndpoint {
    fn refresh(&self, refresh_token: &str) -> Result<TokenResponse, RefreshError>;
}

/// Refresh `oauth` through `endpoint`, returning the successor credential.
///
/// The successor keeps every field the caller's credential had and replaces only
/// what the server restated: `accessToken`, `expiresAt`, plus `refreshToken` and
/// `scopes` when returned.
pub fn refresh(oauth: &Value, now_ms: i64, endpoint: &dyn TokenEndpoint) -> RefreshOutcome {
    let Some(obj) = oauth.as_object() else {
        return RefreshOutcome::err(
            RefreshError::Transient("credential is not an object".into()),
            None,
        );
    };
    let refresh_token = obj
        .get("refreshToken")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());
    let Some(refresh_token) = refresh_token else {
        return RefreshOutcome::err(
            RefreshError::Permanent(PermanentKind::NoRefreshToken),
            None,
        );
    };
    let fp = fingerprint(oauth);

    let resp = match endpoint.refresh(refresh_token) {
        Ok(r) => r,
        Err(e) => return RefreshOutcome::err(e, Some(fp)),
    };

    let mut next = obj.clone();
    next.insert("accessToken".into(), Value::String(resp.access_token));
    next.insert(
        "expiresAt".into(),
        Value::from(now_ms + resp.expires_in * 1000),
    );
    if let Some(rt) = resp.refresh_token {
        next.insert("refreshToken".into(), Value::String(rt));
    }
    if let Some(scope) = resp.scope {
        next.insert(
            "scopes".into(),
            Value::Array(
                scope
                    .split_whitespace()
                    .map(|s| Value::String(s.to_string()))
                    .collect(),
            ),
        );
    }
    RefreshOutcome::ok(Value::Object(next), fp)
}

/// Reject a stored credential that could only ever be written as garbage.
///
/// These are not hypothetical: an `accessToken` of `""` with `expiresAt` of `0`
/// was found in a real backup on this machine, written by the unguarded
/// snapshot path this module replaces.
pub fn validate_snapshot(oauth: &Value) -> Result<(), String> {
    let Some(obj) = oauth.as_object() else {
        return Err("credential is not an object".into());
    };
    match obj.get("accessToken").and_then(Value::as_str) {
        Some(t) if !t.is_empty() => {}
        _ => return Err("credential has no accessToken".into()),
    }
    match obj.get("expiresAt").and_then(Value::as_i64) {
        Some(ms) if ms > 0 => Ok(()),
        _ => Err("credential has no usable expiresAt".into()),
    }
}

// ---------------------------------------------------------------------------
// The real endpoint
// ---------------------------------------------------------------------------

/// Claude Code's OAuth token endpoint. Verified against the installed 2.1.263
/// bundle (the same URL, client id and beta header it uses itself) — a swap that
/// refreshed against a different endpoint would mint a token Claude Code cannot use.
pub const TOKEN_URL: &str = "https://platform.claude.com/v1/oauth/token";
pub const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
/// Beta opt-in header Claude Code sends on the OAuth exchange.
pub const OAUTH_BETA_HEADER: &str = "oauth-2025-04-20";
/// Hard bound on the exchange. The switch holds Claude Code's advisory lock
/// across this call, so it must not be able to hang there.
pub const REFRESH_TIMEOUT: Duration = Duration::from_secs(10);

/// [`TokenEndpoint`] over the real HTTPS endpoint.
pub struct HttpTokenEndpoint {
    url: String,
}

impl Default for HttpTokenEndpoint {
    fn default() -> Self {
        HttpTokenEndpoint { url: TOKEN_URL.to_string() }
    }
}

impl HttpTokenEndpoint {
    pub fn new() -> Self {
        Self::default()
    }

    /// Point the exchange at another URL (tests use a loopback stub; nothing in
    /// the app calls this).
    pub fn with_url(url: impl Into<String>) -> Self {
        HttpTokenEndpoint { url: url.into() }
    }
}

impl TokenEndpoint for HttpTokenEndpoint {
    fn refresh(&self, refresh_token: &str) -> Result<TokenResponse, RefreshError> {
        let client = Client::builder()
            .connect_timeout(REFRESH_TIMEOUT)
            .timeout(REFRESH_TIMEOUT)
            .build()
            .map_err(|e| RefreshError::Transient(format!("http client: {e}")))?;

        // SECRET: this body carries the grant — it is never logged, and neither
        // is the response body beyond its RFC 6749 `error` member.
        let body = serde_json::json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": CLIENT_ID,
        });

        let resp = client
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("anthropic-beta", OAUTH_BETA_HEADER)
            .body(serde_json::to_vec(&body).unwrap_or_default())
            .send()
            .map_err(|e| {
                // Transport-level: unreachable, TLS, timeout. Always retryable.
                RefreshError::Transient(transport_reason(&e))
            })?;

        let status = resp.status().as_u16();
        let text = resp
            .text()
            .map_err(|e| RefreshError::Transient(format!("unreadable response: {e}")))?;

        if !(200..300).contains(&status) {
            return Err(classify_http(status, &text));
        }
        TokenResponse::from_json(&text)
    }
}

/// Describe a transport failure without echoing the request (which holds the grant).
fn transport_reason(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "timed out".to_string()
    } else if e.is_connect() {
        "could not connect".to_string()
    } else {
        "transport error".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cred(access: &str, refresh: &str, expires_at: i64) -> Value {
        json!({
            "accessToken": access,
            "refreshToken": refresh,
            "expiresAt": expires_at,
            "scopes": ["user:inference"],
            "subscriptionType": "max",
        })
    }

    #[test]
    fn near_expiry_uses_the_five_minute_buffer() {
        let now = 1_000_000_000i64;
        assert!(!is_near_expiry(&cred("a", "r", now + EXPIRY_BUFFER_MS + 1), now));
        assert!(is_near_expiry(&cred("a", "r", now + EXPIRY_BUFFER_MS), now));
        assert!(is_near_expiry(&cred("a", "r", now - 1), now));
    }

    #[test]
    fn missing_expiry_counts_as_near_expiry() {
        assert!(is_near_expiry(&json!({"accessToken": "a"}), 0));
    }

    #[test]
    fn fingerprint_survives_access_token_rotation() {
        // The property the CAS depends on: same lineage, new access token.
        let a = cred("access-1", "refresh-1", 10);
        let b = cred("access-2", "refresh-1", 99);
        assert_eq!(fingerprint(&a), fingerprint(&b));

        // And a rotated refresh token is a different lineage generation.
        let c = cred("access-2", "refresh-2", 99);
        assert_ne!(fingerprint(&a), fingerprint(&c));
    }

    #[test]
    fn fingerprint_without_refresh_token_hashes_content() {
        let a = json!({"accessToken": "key-1"});
        let b = json!({"accessToken": "key-2"});
        assert!(fingerprint(&a).starts_with("sha256-full:"));
        assert_ne!(fingerprint(&a), fingerprint(&b));
    }

    #[test]
    fn short_fingerprint_is_eight_chars_and_drops_the_prefix() {
        let fp = fingerprint(&cred("a", "r", 1));
        let short = fingerprint_short(&fp);
        assert_eq!(short.len(), 8);
        assert!(fp.ends_with(&fp[fp.len() - 8..]));
        assert!(!short.contains(':'));
    }

    #[test]
    fn classify_invalid_grant_is_permanent() {
        assert_eq!(
            classify_http(400, r#"{"error":"invalid_grant"}"#),
            RefreshError::Permanent(PermanentKind::InvalidGrant)
        );
    }

    #[test]
    fn classify_invalid_client_is_deterministic() {
        assert_eq!(
            classify_http(401, r#"{"error":"invalid_client"}"#),
            RefreshError::Deterministic("invalid_client".into())
        );
    }

    #[test]
    fn classify_5xx_is_transient() {
        assert!(matches!(
            classify_http(500, "upstream boom"),
            RefreshError::Transient(_)
        ));
    }

    #[test]
    fn classify_4xx_without_rfc6749_error_stays_transient() {
        // A 4xx alone is not a verdict — misjudging this as permanent would
        // quarantine a live credential.
        assert!(matches!(
            classify_http(403, "<html>blocked</html>"),
            RefreshError::Transient(_)
        ));
        // A nested object under `error` is not the RFC's shape either.
        assert!(matches!(
            classify_http(400, r#"{"error":{"type":"invalid_grant"}}"#),
            RefreshError::Transient(_)
        ));
    }

    struct MockEndpoint {
        result: std::cell::RefCell<Option<Result<TokenResponse, RefreshError>>>,
        seen: std::cell::RefCell<Vec<String>>,
    }

    impl MockEndpoint {
        fn ok(access: &str, expires_in: i64, refresh: Option<&str>, scope: Option<&str>) -> Self {
            MockEndpoint {
                result: std::cell::RefCell::new(Some(Ok(TokenResponse {
                    access_token: access.into(),
                    expires_in,
                    refresh_token: refresh.map(str::to_string),
                    scope: scope.map(str::to_string),
                }))),
                seen: std::cell::RefCell::new(Vec::new()),
            }
        }
        fn failing(e: RefreshError) -> Self {
            MockEndpoint {
                result: std::cell::RefCell::new(Some(Err(e))),
                seen: std::cell::RefCell::new(Vec::new()),
            }
        }
    }

    impl TokenEndpoint for MockEndpoint {
        fn refresh(&self, refresh_token: &str) -> Result<TokenResponse, RefreshError> {
            self.seen.borrow_mut().push(refresh_token.to_string());
            self.result.borrow_mut().take().expect("one call per mock")
        }
    }

    #[test]
    fn refresh_writes_back_rotated_token_and_scopes() {
        let now = 1_700_000_000_000i64;
        let ep = MockEndpoint::ok(
            "access-new",
            28800,
            Some("refresh-new"),
            Some("user:inference user:design:read"),
        );
        let out = refresh(&cred("access-old", "refresh-old", now), now, &ep);

        assert!(out.error.is_none());
        let next = out.credentials.expect("successor credential");
        assert_eq!(next["accessToken"], "access-new");
        assert_eq!(next["refreshToken"], "refresh-new");
        assert_eq!(next["expiresAt"], Value::from(now + 28_800_000));
        assert_eq!(next["scopes"], json!(["user:inference", "user:design:read"]));
        // Untouched fields travel with the credential.
        assert_eq!(next["subscriptionType"], "max");
        assert_eq!(ep.seen.borrow().as_slice(), ["refresh-old"]);
    }

    #[test]
    fn refresh_keeps_the_old_refresh_token_when_the_server_omits_one() {
        let now = 0i64;
        let ep = MockEndpoint::ok("access-new", 60, None, None);
        let out = refresh(&cred("access-old", "refresh-old", now), now, &ep);
        let next = out.credentials.expect("successor credential");
        assert_eq!(next["refreshToken"], "refresh-old");
    }

    #[test]
    fn refresh_without_a_refresh_token_is_permanent_and_makes_no_call() {
        let ep = MockEndpoint::ok("unused", 1, None, None);
        let out = refresh(&json!({"accessToken": "a", "expiresAt": 1}), 0, &ep);
        assert_eq!(
            out.error,
            Some(RefreshError::Permanent(PermanentKind::NoRefreshToken))
        );
        assert!(ep.seen.borrow().is_empty());
    }

    #[test]
    fn refresh_failure_pins_the_consumed_generation() {
        let c = cred("access-old", "refresh-old", 0);
        let ep = MockEndpoint::failing(RefreshError::Permanent(PermanentKind::InvalidGrant));
        let out = refresh(&c, 0, &ep);
        assert!(out.credentials.is_none());
        assert_eq!(out.consumed_fp, Some(fingerprint(&c)));
    }

    #[test]
    fn token_response_without_access_token_is_not_a_success() {
        assert!(TokenResponse::from_json(r#"{"expires_in":10}"#).is_err());
        assert!(TokenResponse::from_json("not json").is_err());
    }

    #[test]
    fn validate_snapshot_rejects_the_shapes_seen_in_the_wild() {
        // The real corrupt backup: empty accessToken, expiresAt 0.
        assert!(validate_snapshot(&json!({"accessToken": "", "expiresAt": 0})).is_err());
        assert!(validate_snapshot(&json!({"expiresAt": 123})).is_err());
        assert!(validate_snapshot(&json!({"accessToken": "a"})).is_err());
        assert!(validate_snapshot(&cred("a", "r", 123)).is_ok());
    }

    // -- HttpTokenEndpoint -------------------------------------------------
    // Driven against a loopback stub, never the real endpoint.

    fn stub_server(status_line: &str, body: &'static str) -> (String, std::thread::JoinHandle<Option<String>>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let url = format!("http://{}/v1/oauth/token", listener.local_addr().unwrap());
        let status_line = status_line.to_string();
        let handle = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().ok()?;
            let mut buf = [0u8; 4096];
            let n = sock.read(&mut buf).ok()?;
            let request = String::from_utf8_lossy(&buf[..n]).to_string();
            let resp = format!(
                "HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(resp.as_bytes()).ok()?;
            let _ = sock.flush();
            Some(request)
        });
        (url, handle)
    }

    #[test]
    fn http_endpoint_posts_the_grant_and_parses_the_response() {
        let (url, server) = stub_server(
            "200 OK",
            r#"{"access_token":"at-new","expires_in":28800,"refresh_token":"rt-new","scope":"user:inference"}"#,
        );
        let ep = HttpTokenEndpoint::with_url(url);
        let resp = ep.refresh("rt-old").expect("refresh succeeds");

        assert_eq!(resp.access_token, "at-new");
        assert_eq!(resp.expires_in, 28800);
        assert_eq!(resp.refresh_token.as_deref(), Some("rt-new"));
        assert_eq!(resp.scope.as_deref(), Some("user:inference"));

        let request = server.join().expect("server thread").expect("a request");
        assert!(request.starts_with("POST /v1/oauth/token"));
        assert!(request.contains("anthropic-beta: oauth-2025-04-20"));
        assert!(request.contains("\"grant_type\":\"refresh_token\""));
        assert!(request.contains("\"refresh_token\":\"rt-old\""));
        assert!(request.contains(CLIENT_ID));
    }

    #[test]
    fn http_endpoint_maps_invalid_grant_to_permanent() {
        let (url, server) = stub_server("400 Bad Request", r#"{"error":"invalid_grant"}"#);
        let err = HttpTokenEndpoint::with_url(url)
            .refresh("rt-spent")
            .expect_err("400 is a failure");
        assert_eq!(err, RefreshError::Permanent(PermanentKind::InvalidGrant));
        let _ = server.join();
    }

    #[test]
    fn http_endpoint_maps_a_dead_address_to_transient() {
        // Bind then drop: the port is free again, so connecting is refused.
        let addr = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
            l.local_addr().unwrap()
        };
        let err = HttpTokenEndpoint::with_url(format!("http://{addr}/v1/oauth/token"))
            .refresh("rt-must-not-appear")
            .expect_err("nothing is listening");
        assert!(matches!(err, RefreshError::Transient(_)), "got {err:?}");
        // The reason must not echo the grant.
        assert!(!format!("{err:?}").contains("must-not-appear"));
    }
}

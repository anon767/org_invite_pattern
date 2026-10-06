// Small GitHub API client for a Cloudflare Worker: App JWT, installation token,
// user OAuth, and the few REST calls this project needs.

const API = "https://api.github.com";

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem) {
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error("APP_PRIVATE_KEY must be PKCS#8. Convert it: openssl pkcs8 -topk8 -nocrypt -in app.pem -out app.pkcs8.pem");
  }
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

// JWT that authenticates as the GitHub App itself (valid 9 minutes).
export async function appJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) })));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(privateKeyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function gh(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "org-invite-pattern",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

// Token that acts as the App inside the organization (valid 1 hour).
export async function installationToken(env) {
  const jwt = await appJwt(env.APP_ID, env.APP_PRIVATE_KEY);
  const inst = await gh(jwt, "GET", `/orgs/${env.ORG}/installation`);
  if (inst.status !== 200) throw new Error(`App is not installed on ${env.ORG} (${inst.status})`);
  const tok = await gh(jwt, "POST", `/app/installations/${inst.data.id}/access_tokens`);
  if (tok.status !== 201) throw new Error(`Could not get installation token (${tok.status})`);
  return tok.data.token;
}

// Exchange the OAuth code from "Sign in with GitHub" for a user token.
export async function exchangeCode(env, code) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "org-invite-pattern" },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      code,
      redirect_uri: `${env.BASE_URL}/callback`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth exchange failed: ${data.error || res.status}`);
  return data.access_token;
}

// Revoke the user token once we are done with it; we only need it for one request.
export async function revokeUserToken(env, token) {
  await fetch(`${API}/applications/${env.CLIENT_ID}/token`, {
    method: "DELETE",
    headers: {
      Authorization: "Basic " + btoa(`${env.CLIENT_ID}:${env.CLIENT_SECRET}`),
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "org-invite-pattern",
    },
    body: JSON.stringify({ access_token: token }),
  }).catch(() => {});
}

export async function verifyWebhook(secret, rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}

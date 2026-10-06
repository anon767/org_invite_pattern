// Runs the Worker against a fake GitHub API: `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHmac, createVerify } from "node:crypto";
import worker from "../src/index.js";
import { appJwt } from "../src/github.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });

const env = {
  ORG: "acme-school", GRADERS_TEAM: "graders", APP_ID: "1", CLIENT_ID: "cid", CLIENT_SECRET: "csecret",
  BASE_URL: "https://invite.test", STUDENTS_TEAM: "students", WEBHOOK_SECRET: "whsecret", APP_PRIVATE_KEY: PEM,
};

// Fake GitHub: records every call, answers the ones the Worker makes.
function fakeGitHub({ membership = 404 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    const path = url.replace(/^https:\/\/(api\.)?github\.com/, "");
    calls.push(`${method} ${path}`);
    const json = (status, data) => new Response(data === null ? null : JSON.stringify(data), { status });
    if (path === "/login/oauth/access_token") return json(200, { access_token: "user-token" });
    if (path === "/user") return json(200, { id: 42, login: "alice" });
    if (path.startsWith("/applications/")) return json(204, null);
    if (path === "/orgs/acme-school/installation") return json(200, { id: 7 });
    if (path === "/app/installations/7/access_tokens") return json(201, { token: "inst-token" });
    if (path === "/orgs/acme-school/memberships/alice") return json(membership, membership === 200 ? { state: "active" } : {});
    if (path === "/orgs/acme-school/teams/students") return json(200, { id: 99 });
    if (path === "/orgs/acme-school/invitations") {
      assert.deepEqual(JSON.parse(init.body), { invitee_id: 42, role: "direct_member", team_ids: [99] });
      return json(201, { id: 1 });
    }
    if (method === "PATCH" && path === "/repos/acme-school/project") return json(200, {});
    if (method === "PUT" && path === "/orgs/acme-school/teams/graders/repos/acme-school/project") return json(204, null);
    return json(404, { message: `unexpected ${method} ${path}` });
  };
  return calls;
}

const callbackRequest = () => new Request("https://invite.test/callback?code=abc&state=s1", {
  headers: { Cookie: "oauth_state=s1" },
});

test("signed-in user gets invited into the students team", async () => {
  const calls = fakeGitHub();
  const res = await worker.fetch(callbackRequest(), env);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Invite sent/);
  assert.ok(calls.includes("POST /orgs/acme-school/invitations"));
  assert.ok(calls.some((c) => c.startsWith("DELETE /applications/")), "user token is revoked");
});

test("existing member is not invited again", async () => {
  const calls = fakeGitHub({ membership: 200 });
  const res = await worker.fetch(callbackRequest(), env);
  assert.match(await res.text(), /already a member/);
  assert.ok(!calls.includes("POST /orgs/acme-school/invitations"));
});

test("callback without matching state cookie is rejected", async () => {
  fakeGitHub();
  const res = await worker.fetch(new Request("https://invite.test/callback?code=abc&state=s1"), env);
  assert.equal(res.status, 400);
});

function signed(body, secret = env.WEBHOOK_SECRET) {
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://invite.test/webhook", {
    method: "POST", body, headers: { "X-Hub-Signature-256": sig, "X-GitHub-Event": "repository" },
  });
}

test("new public repo is made private and shared with graders", async () => {
  const calls = fakeGitHub();
  const body = JSON.stringify({ action: "created", organization: { login: "acme-school" },
    repository: { full_name: "acme-school/project", private: false } });
  const res = await worker.fetch(signed(body), env);
  assert.equal(await res.text(), "private:200 graders:204");
  assert.ok(calls.includes("PATCH /repos/acme-school/project"));
});

test("webhook with a bad signature is rejected", async () => {
  const calls = fakeGitHub();
  const res = await worker.fetch(signed("{}", "wrong-secret"), env);
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("App JWT is a valid RS256 signature", async () => {
  const jwt = await appJwt("1", PEM);
  const [h, p, s] = jwt.split(".");
  const v = createVerify("RSA-SHA256").update(`${h}.${p}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, "base64url")));
  assert.equal(JSON.parse(Buffer.from(p, "base64url")).iss, "1");
});

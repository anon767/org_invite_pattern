// Runs both scripts against a fake GitHub client: `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const invite = require("../.github/scripts/invite.cjs");
const lockdown = require("../.github/scripts/lockdown.cjs");

// Fake Octokit: records calls as "namespace.method", answers from `responses`.
function fakeGitHub(responses = {}) {
  const calls = [];
  const rest = new Proxy({}, {
    get: (_, ns) => new Proxy({}, {
      get: (_, method) => {
        const fn = async (args) => {
          const name = `${ns}.${method}`;
          calls.push({ name, args });
          const r = responses[name];
          if (r instanceof Error) throw r;
          return { data: typeof r === "function" ? r(args) : r ?? {} };
        };
        fn.key = `${ns}.${method}`;
        return fn;
      },
    }),
  });
  const paginate = async (fn, args) => {
    calls.push({ name: fn.key, args });
    return responses[fn.key] ?? [];
  };
  return { github: { rest, paginate }, calls };
}

function fakeCore() {
  const core = { failed: null, info: () => {}, setFailed: (m) => { core.failed = m; } };
  return core;
}

const notFound = Object.assign(new Error("Not Found"), { status: 404 });
const issueContext = (user = { id: 42, login: "alice", type: "User" }) => ({
  repo: { owner: "acme-school", repo: "join" },
  payload: { issue: { number: 7, user } },
});
const names = (calls) => calls.map((c) => c.name);

test("new user is invited to the students team, told what to do, issue closed", async () => {
  const { github, calls } = fakeGitHub({
    "orgs.getMembershipForUser": notFound,
    "teams.getByName": { id: 99 },
  });
  const core = fakeCore();
  await invite({ github, context: issueContext(), core });

  const inv = calls.find((c) => c.name === "orgs.createInvitation");
  assert.deepEqual(inv.args, { org: "acme-school", invitee_id: 42, role: "direct_member", team_ids: [99] });
  assert.equal(calls.find((c) => c.name === "teams.getByName").args.team_slug, "students");
  assert.match(calls.find((c) => c.name === "issues.createComment").args.body, /@alice you are invited/);
  assert.equal(calls.find((c) => c.name === "issues.update").args.state, "closed");
  assert.equal(core.failed, null);
});

test("existing member is not invited again", async () => {
  const { github, calls } = fakeGitHub({ "orgs.getMembershipForUser": { state: "active" } });
  await invite({ github, context: issueContext(), core: fakeCore() });
  assert.ok(!names(calls).includes("orgs.createInvitation"));
  assert.match(calls.find((c) => c.name === "issues.createComment").args.body, /already a member/);
  assert.ok(names(calls).includes("issues.update"));
});

test("pending invite gets a link instead of a second invite", async () => {
  const { github, calls } = fakeGitHub({ "orgs.getMembershipForUser": { state: "pending" } });
  await invite({ github, context: issueContext(), core: fakeCore() });
  assert.ok(!names(calls).includes("orgs.createInvitation"));
  assert.match(calls.find((c) => c.name === "issues.createComment").args.body, /invite is waiting/);
});

test("bots are ignored", async () => {
  const { github, calls } = fakeGitHub();
  await invite({ github, context: issueContext({ id: 1, login: "x[bot]", type: "Bot" }), core: fakeCore() });
  assert.deepEqual(names(calls), ["issues.update"]);
});

test("API failure leaves the issue open and fails the run", async () => {
  const { github, calls } = fakeGitHub({
    "orgs.getMembershipForUser": notFound,
    "teams.getByName": { id: 99 },
    "orgs.createInvitation": Object.assign(new Error("rate limited"), { status: 422 }),
  });
  const core = fakeCore();
  await invite({ github, context: issueContext(), core });
  assert.match(core.failed, /rate limited/);
  assert.ok(!names(calls).includes("issues.update"));
});

test("lockdown makes public repos private and adds graders where missing", async () => {
  const { github, calls } = fakeGitHub({
    "repos.listForOrg": [
      { name: "join", full_name: "acme-school/join", private: false },
      { name: "a", full_name: "acme-school/a", private: false },
      { name: "b", full_name: "acme-school/b", private: true },
      { name: "old", full_name: "acme-school/old", private: false, archived: true },
    ],
    "teams.listReposInOrg": [{ full_name: "acme-school/b" }],
  });
  const core = fakeCore();
  await lockdown({ github, context: { repo: { owner: "acme-school", repo: "join" } }, core });

  const updates = calls.filter((c) => c.name === "repos.update").map((c) => c.args.repo);
  const shared = calls.filter((c) => c.name === "teams.addOrUpdateRepoPermissionsInOrg").map((c) => c.args);
  assert.deepEqual(updates, ["a"], "join repo stays public, archived repos are skipped");
  assert.deepEqual(shared, [{ org: "acme-school", team_slug: "graders", owner: "acme-school", repo: "a", permission: "pull" }]);
  assert.equal(core.failed, null);
});

test("lockdown keeps going when one repo fails", async () => {
  const { github } = fakeGitHub({
    "repos.listForOrg": [
      { name: "fork", full_name: "acme-school/fork", private: false },
      { name: "c", full_name: "acme-school/c", private: true },
    ],
    "repos.update": new Error("forks of public repos cannot be private"),
  });
  const core = fakeCore();
  await lockdown({ github, context: { repo: { owner: "acme-school", repo: "join" } }, core });
  assert.match(core.failed, /acme-school\/fork/);
});

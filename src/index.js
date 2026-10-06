// Self-service access to a GitHub organization.
//
//   GET  /          landing page with a "Connect GitHub" button
//   GET  /login     redirect to GitHub sign-in
//   GET  /callback  check the student list, then invite to the org
//   POST /webhook   on every new repo: make it private, give the graders team read access

import { exchangeCode, gh, installationToken, revokeUserToken, verifyWebhook } from "./github.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/") return landing(env);
      if (request.method === "GET" && url.pathname === "/login") return login(env);
      if (request.method === "GET" && url.pathname === "/callback") return await callback(request, env, url);
      if (request.method === "POST" && url.pathname === "/webhook") return await webhook(request, env);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(err);
      return page("Something went wrong", "<p>Please try again in a few minutes. If it keeps failing, contact your program staff.</p>", 500);
    }
  },
};

function landing(env) {
  return page(`Join ${env.ORG} on GitHub`, `
    <p>Sign in with GitHub. If you are on the student list, you get an invite to the
    <b>${esc(env.ORG)}</b> organization, where you create your project repositories.</p>
    <p><a class="btn" href="/login">Connect GitHub</a></p>
    <p class="muted">We only read your GitHub username and your verified email addresses, once.</p>`);
}

function login(env) {
  const state = crypto.randomUUID();
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", env.CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${env.BASE_URL}/callback`);
  auth.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function callback(request, env, url) {
  const cookieState = /(?:^|;\s*)oauth_state=([^;]+)/.exec(request.headers.get("Cookie") || "")?.[1];
  if (!url.searchParams.get("code") || !cookieState || cookieState !== url.searchParams.get("state")) {
    return page("Sign-in expired", `<p><a href="/">Start again</a>.</p>`, 400);
  }

  // 1. Who is this? (verified by GitHub sign-in)
  const userToken = await exchangeCode(env, url.searchParams.get("code"));
  const user = await gh(userToken, "GET", "/user");
  const emails = await gh(userToken, "GET", "/user/emails");
  await revokeUserToken(env, userToken);
  if (user.status !== 200 || emails.status !== 200) throw new Error("Could not read GitHub profile");

  // 2. Are they on the student list? Match any verified GitHub email.
  let team = null;
  for (const e of emails.data.filter((e) => e.verified)) {
    team = await env.ROSTER.get(`email:${e.email.toLowerCase()}`);
    if (team) break;
  }
  if (!team) {
    return page("We could not find you on the student list", `
      <p>None of the verified email addresses on your GitHub account match the student list.</p>
      <p>Add the email address you use for your program to GitHub
      (<a href="https://github.com/settings/emails">Settings → Emails</a>), verify it, then
      <a href="/">try again</a>.</p>`, 403);
  }

  // 3. Invite (or tell them they are already in).
  const token = await installationToken(env);
  const login = user.data.login;
  const invitationUrl = `https://github.com/orgs/${env.ORG}/invitation`;
  const member = await gh(token, "GET", `/orgs/${env.ORG}/memberships/${login}`);
  if (member.status === 200 && member.data.state === "active") {
    return page("You are already a member", `<p>Go ahead and <a href="https://github.com/organizations/${env.ORG}/repositories/new">create your repository in ${esc(env.ORG)}</a>.</p>`);
  }
  if (member.status === 200 && member.data.state === "pending") {
    return page("Your invite is waiting", `<p><a href="${invitationUrl}">Accept your invite</a> (it expires after 7 days).</p>`);
  }

  const teamInfo = await gh(token, "GET", `/orgs/${env.ORG}/teams/${encodeURIComponent(team)}`);
  if (teamInfo.status !== 200) throw new Error(`Team "${team}" not found in ${env.ORG}`);
  const inv = await gh(token, "POST", `/orgs/${env.ORG}/invitations`, {
    invitee_id: user.data.id,
    role: "direct_member",
    team_ids: [teamInfo.data.id],
  });
  if (inv.status !== 201) throw new Error(`Invite failed (${inv.status}): ${JSON.stringify(inv.data)}`);

  return page("Invite sent", `
    <p>Hi <b>${esc(login)}</b>, you have been invited to <b>${esc(env.ORG)}</b>.</p>
    <p><a class="btn" href="${invitationUrl}">Accept the invite</a></p>
    <p class="muted">The invite expires after 7 days. If it does, just connect again.</p>`);
}

async function webhook(request, env) {
  const raw = await request.text();
  if (!(await verifyWebhook(env.WEBHOOK_SECRET, raw, request.headers.get("X-Hub-Signature-256")))) {
    return new Response("Bad signature", { status: 401 });
  }
  if (request.headers.get("X-GitHub-Event") !== "repository") return new Response("ignored");

  const { action, repository, organization } = JSON.parse(raw);
  if (organization?.login !== env.ORG || !["created", "publicized"].includes(action)) {
    return new Response("ignored");
  }

  const token = await installationToken(env);
  const done = [];
  if (!repository.private) {
    // The free plan cannot force private repos, so we fix it right after creation.
    const r = await gh(token, "PATCH", `/repos/${repository.full_name}`, { private: true });
    done.push(`private:${r.status}`);
  }
  if (action === "created") {
    const r = await gh(token, "PUT", `/orgs/${env.ORG}/teams/${env.GRADERS_TEAM}/repos/${repository.full_name}`, { permission: "pull" });
    done.push(`graders:${r.status}`);
  }
  return new Response(done.join(" ") || "ok");
}

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1f2328}
.btn{display:inline-block;background:#1f883d;color:#fff;padding:.6rem 1.1rem;border-radius:6px;text-decoration:none}
.muted{color:#656d76;font-size:.9rem}</style></head>
<body><h1>${esc(title)}</h1>${body}</body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

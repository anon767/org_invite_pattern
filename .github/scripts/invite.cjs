// Invite the author of a "Request access" issue to the org and the students team,
// answer on the issue, and close it. Run by .github/workflows/invite.yml.
//
// Only the issue author's id and login are used. The issue text is never read,
// so nothing a requester types can change what this script does.

module.exports = async ({ github, context, core }) => {
  const org = context.repo.owner;
  const repo = context.repo.repo;
  const { number, user } = context.payload.issue;
  const team = process.env.STUDENTS_TEAM || "students";

  const invitation = `https://github.com/orgs/${org}/invitation`;
  const newRepo = `https://github.com/organizations/${org}/repositories/new`;
  const reply = (body) => github.rest.issues.createComment({ owner: org, repo, issue_number: number, body });
  const close = () => github.rest.issues.update({ owner: org, repo, issue_number: number, state: "closed", state_reason: "completed" });

  if (user.type !== "User") {
    core.info(`Ignoring request from ${user.type} ${user.login}`);
    return close();
  }

  try {
    const state = await membershipState(github, org, user.login);
    if (state === "active") {
      await reply(`@${user.login} you are already a member. [Create your repository](${newRepo}).`);
      return close();
    }
    if (state === "pending") {
      await reply(`@${user.login} your invite is waiting: [accept it here](${invitation}).`);
      return close();
    }

    const { data: studentsTeam } = await github.rest.teams.getByName({ org, team_slug: team });
    await github.rest.orgs.createInvitation({ org, invitee_id: user.id, role: "direct_member", team_ids: [studentsTeam.id] });
    core.info(`Invited ${user.login} to ${org} / ${team}`);

    await reply([
      `@${user.login} you are invited.`,
      "",
      `1. [Accept the invite](${invitation}) (it expires after 7 days).`,
      `2. [Create your project repository](${newRepo}) in **${org}**.`,
    ].join("\n"));
    return close();
  } catch (err) {
    await reply(`@${user.login} something went wrong on our side. Staff have been notified; please don't open a new request.`)
      .catch(() => {});
    core.setFailed(`Could not invite ${user.login}: ${err.message}`);
  }
};

async function membershipState(github, org, username) {
  try {
    const { data } = await github.rest.orgs.getMembershipForUser({ org, username });
    return data.state; // "active" or "pending"
  } catch (err) {
    if (err.status === 404) return "none";
    throw err;
  }
}

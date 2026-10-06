// Make every repository in the org private and give the graders team read access.
// Run on a schedule by .github/workflows/lockdown.yml. Safe to run any number of times.

module.exports = async ({ github, context, core }) => {
  const org = context.repo.owner;
  const self = context.repo.repo; // the public join repo stays public
  const team = process.env.GRADERS_TEAM || "graders";

  const repos = await github.paginate(github.rest.repos.listForOrg, { org, type: "all", per_page: 100 });
  const shared = new Set(
    (await github.paginate(github.rest.teams.listReposInOrg, { org, team_slug: team, per_page: 100 }))
      .map((r) => r.full_name));

  const failed = [];
  let madePrivate = 0;
  let addedGraders = 0;

  for (const r of repos) {
    if (r.name === self || r.archived) continue;
    try {
      if (!r.private) {
        await github.rest.repos.update({ owner: org, repo: r.name, private: true });
        madePrivate++;
        core.info(`Made private: ${r.full_name}`);
      }
      if (!shared.has(r.full_name)) {
        await github.rest.teams.addOrUpdateRepoPermissionsInOrg({
          org, team_slug: team, owner: org, repo: r.name, permission: "pull",
        });
        addedGraders++;
        core.info(`Graders added: ${r.full_name}`);
      }
    } catch (err) {
      failed.push(`${r.full_name}: ${err.message}`);
    }
  }

  core.info(`${repos.length} repos checked, ${madePrivate} made private, graders added to ${addedGraders}`);
  if (failed.length) core.setFailed(`Failed on ${failed.length} repos:\n${failed.join("\n")}`);
};

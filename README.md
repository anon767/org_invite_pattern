# org_invite_pattern

Let students join your GitHub organization by themselves. Every student repository
ends up private and readable by your graders, and nobody shares a GitHub login.

## How it works

![How it works: student signs in, gets invited, creates a repo; the webhook makes it private and shares it with graders](docs/how-it-works.png)

1. The student opens the page and signs in with GitHub.
2. The Worker invites them to the organization and the `students` team.
3. The student accepts the invite and creates their project repository in the organization.
4. GitHub tells the Worker about the new repository. The Worker makes it private
   and gives the `graders` team read access.

Graders use their own GitHub accounts. To add a grader, add them to the `graders` team.

## What students are told

> Go to `<your Worker URL>` and click **Connect GitHub**. Accept the invite, then
> create your project repository in the `<org>` organization.

## Setup

You need: a GitHub organization (owner access), a Cloudflare account (free plan is enough), and Node.js 20+.

### 1. Organization settings

In **Organization settings**:

| Setting | Value | Why |
|---|---|---|
| Member privileges → Base permissions | **No permission** | Students cannot see each other's repos |
| Member privileges → Repository creation | **Public** and **Private** allowed | Students create their own repos. The free plan cannot allow only private; the Worker makes public repos private right away |
| Member privileges → Allow members to delete or transfer repositories | **Off** | Submissions stay in the org |
| Teams | Create `students` and `graders` | New members join `students`; `graders` can read every repo |

Do **not** make graders organization owners. Owners can delete repositories and change billing.

### 2. Create the GitHub App

**Organization settings → Developer settings → GitHub Apps → New GitHub App**

| Field | Value |
|---|---|
| Homepage URL | your Worker URL |
| Callback URL | `<Worker URL>/callback` |
| Webhook URL | `<Worker URL>/webhook` |
| Webhook secret | a long random string (`openssl rand -hex 32`) |
| Repository permissions | **Administration: Read and write**, Metadata: Read |
| Organization permissions | **Members: Read and write** |
| Subscribe to events | **Repository** |
| Where can this app be installed? | Only on this account |

Then on the App page:

1. Note the **App ID** and **Client ID**.
2. **Generate a client secret.**
3. **Generate a private key** and convert it to PKCS#8:
   `openssl pkcs8 -topk8 -nocrypt -in app.private-key.pem -out app.pkcs8.pem`
4. **Install App** on your organization, for **all repositories**.

### 3. Deploy the Worker

Fill in `[vars]` in `wrangler.toml`, then:

```sh
npm install
npx wrangler login
npx wrangler secret put APP_PRIVATE_KEY < app.pkcs8.pem
npx wrangler secret put CLIENT_SECRET
npx wrangler secret put WEBHOOK_SECRET
npm run deploy
```

Make sure `BASE_URL` in `wrangler.toml` and the URLs in the GitHub App match the deployed URL.

### 4. Test it

Open the Worker URL and click **Connect GitHub**. Accept the invite, create a public
repository in the organization, and check that it turns private and that `graders`
has read access.

## Good to know

- **Anyone with the link can join.** Members only see their own repositories. Remove
  people who do not belong under **Organization → People**.
- **Invites expire after 7 days.** The student just connects again.
- **GitHub limits invites per day**, and new or free organizations get a lower limit. Spread out large cohorts.
- **The Worker never stores tokens.** The student's GitHub token is used once and revoked.
- **Leaving the program:** remove the student from the organization. Their repositories stay in the organization.
- **Tests:** `npm test` runs the Worker against a fake GitHub API.

## Files

| File | What it does |
|---|---|
| `src/index.js` | The pages, the invite flow and the webhook |
| `src/github.js` | GitHub API helpers: App JWT, tokens, webhook signature check |
| `test/worker.test.mjs` | Tests against a fake GitHub API |
| `wrangler.toml` | Cloudflare Worker settings |
| `docs/diagram.py` | Draws `docs/how-it-works.png` and `docs/how-it-works.svg` (`python docs/diagram.py`, needs matplotlib) |

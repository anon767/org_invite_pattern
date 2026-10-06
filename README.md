# org_invite_pattern

Let students join your GitHub organization by themselves. Every student repository
ends up private and readable by your graders, and nobody shares a GitHub login.

It is just GitHub Actions in one repository. No server, no hosting.

## How it works

![How it works: student opens a request issue, an Action invites them; a scheduled Action makes repos private and shares them with graders](docs/how-it-works.png)

1. The student opens the **Request access** link and clicks **Create**. This opens an issue in the public `join` repo.
2. An Action invites the issue's author to the organization and the `students` team,
   replies with the next steps, and closes the issue.
3. The student accepts the invite and creates their project repository in the organization.
4. Every 10 minutes, another Action makes every repository private and gives the
   `graders` team read access.

GitHub itself tells the Action who opened the issue, so nobody can request access for someone else.
Graders use their own GitHub accounts. To add a grader, add them to the `graders` team.

## What students are told

> Open `https://github.com/<org>/join/issues/new?template=request-access.yml` and click
> **Create**. Accept the invite you get, then create your project repository in the `<org>` organization.

## Setup

You need owner access to a GitHub organization. The free plan is enough.

### 1. Organization settings

In **Organization settings**:

| Setting | Value | Why |
|---|---|---|
| Member privileges → Base permissions | **No permission** | Students cannot see each other's repos |
| Member privileges → Repository creation | **Public** and **Private** allowed | Students create their own repos. The free plan cannot allow only private; the lockdown Action makes them private |
| Member privileges → Allow members to delete or transfer repositories | **Off** | Submissions stay in the org |
| Teams | Create `students` and `graders` | New members join `students`; `graders` can read every repo |

Do **not** make graders organization owners. Owners can delete repositories and change billing.

### 2. Create the GitHub App

The Actions use this App to send invites and change repositories.

**Organization settings → Developer settings → GitHub Apps → New GitHub App**

| Field | Value |
|---|---|
| Homepage URL | your organization's URL |
| Webhook | **Off** (untick "Active") |
| Repository permissions | **Administration: Read and write**, **Issues: Read and write**, Metadata: Read |
| Organization permissions | **Members: Read and write** |
| Where can this app be installed? | Only on this account |

Then on the App page:

1. Note the **Client ID**.
2. **Generate a private key** (a `.pem` file is downloaded).
3. **Install App** on your organization, for **all repositories**.

### 3. Create the `join` repository

1. Create a **public** repository called `join` in the organization from this template
   (**Use this template**), or copy the `.github` folder into it.
2. In `join` → **Issues → Labels**, create the label `access-request`.
3. In `join` → **Settings → Secrets and variables → Actions**:
   - Variable `APP_CLIENT_ID`: the App's Client ID
   - Secret `APP_PRIVATE_KEY`: the full contents of the `.pem` file
   - Optional variables `STUDENTS_TEAM` and `GRADERS_TEAM` if your team names differ
     from `students` and `graders`

### 4. Test it

1. Open the request link from a second GitHub account and click **Create**.
   Within a minute the issue gets a reply and closes, and the account gets an invite.
2. Accept the invite and create a public repository in the organization.
3. Run **Actions → Lockdown → Run workflow** (or wait up to 10 minutes). The repository
   turns private and `graders` gets read access.

## Good to know

- **Anyone with the link can join.** Members only see their own repositories. Remove
  people who do not belong under **Organization → People**.
- **Requests are public issues**, so anyone can see which GitHub usernames asked to join.
- **New repositories are public for up to 10 minutes** before the lockdown Action catches them.
  GitHub may run scheduled Actions a few minutes late.
- **Invites expire after 7 days.** The student just opens the link again.
- **GitHub limits invites per day**, and new or free organizations get a lower limit.
- **The Action never reads what students type.** It only uses the issue author's account,
  so issue text cannot change what it does.
- **Leaving the program:** remove the student from the organization. Their repositories stay in the organization.
- **Tests:** `npm test` runs both scripts against a fake GitHub API.

## Files

| File | What it does |
|---|---|
| `.github/ISSUE_TEMPLATE/request-access.yml` | The "Request access" form |
| `.github/workflows/invite.yml` | Runs `invite.cjs` when a request issue is opened |
| `.github/workflows/lockdown.yml` | Runs `lockdown.cjs` every 10 minutes |
| `.github/scripts/invite.cjs` | Invites the issue author, replies, closes the issue |
| `.github/scripts/lockdown.cjs` | Makes repos private and adds the graders team |
| `test/scripts.test.mjs` | Tests against a fake GitHub API |
| `docs/diagram.py` | Draws `docs/how-it-works.png` and `.svg` (`python docs/diagram.py`, needs matplotlib) |

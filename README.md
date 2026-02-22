# Notipo

A self-hosted backend that publishes blog posts from Notion to WordPress automatically. It watches a Notion database for status changes, converts the content to Gutenberg blocks, generates featured images, handles inline image uploads, and applies Rank Math SEO metadata — all without touching WordPress manually.

---

## How it works

You write posts in Notion. When you change the status to your configured trigger value (e.g. "Post to Wordpress"), the app syncs the post to a WordPress draft. When you set it to "Publish", it goes live. To update content after syncing or publishing, use "Update Wordpress" — it re-syncs the content and only auto-publishes if the WP post is currently live. Drafts stay as drafts.

The app receives real-time Notion webhook events and also polls every 5 minutes as a safety net. WordPress categories and tags are automatically imported and pushed to your Notion database as dropdown options, so you never need to look up numeric IDs or type names manually. After each sync or publish, the WordPress post URL is written back to a `WordPress Link` property on the Notion page. All credentials are stored encrypted in the database — never in plain environment variables.

New users can sign up with email and password via the admin UI, which creates a tenant and returns an API key. An onboarding stepper guides them through connecting Notion and WordPress. Self-service signup can be disabled by setting `ALLOW_SIGNUP=false`.

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Development — native Node](#development--native-node)
- [Development — VS Code dev container](#development--vs-code-dev-container)
- [Development — local Docker (no Node required)](#development--local-docker-no-node-required)
- [Production — VPS self-hosted](#production--vps-self-hosted)
- [Production — Railway](#production--railway)
- [First-run setup](#first-run-setup)
- [Notion database setup](#notion-database-setup)
- [Admin UI](#admin-ui)

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 20 | Native dev only |
| Docker | 24 | All deployment modes |
| Docker Compose | v2 (`docker compose`) | Not v1 (`docker-compose`) |

---

## Environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

**Required for all environments:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 64-char hex string — `openssl rand -hex 32` |
| `API_KEY` | Admin API key for `/api/admin/*` routes — `openssl rand -hex 16` |
| `ALLOW_SIGNUP` | Set to `false` to disable self-service registration (default: `true`) |

**Notion OAuth** (optional — enables "Connect to Notion" button):

| Variable | Description |
|----------|-------------|
| `NOTION_OAUTH_CLIENT_ID` | From your Notion public integration |
| `NOTION_OAUTH_CLIENT_SECRET` | From your Notion public integration |
| `NOTION_OAUTH_REDIRECT_URI` | `https://yourdomain.com/api/notion/oauth/callback` |

**Required for VPS deployment only:**

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your public domain, e.g. `api.yourdomain.com` |
| `ACME_EMAIL` | Email for Let's Encrypt certificate notifications |
| `DB_PASSWORD` | Postgres password — `openssl rand -hex 16` |

**Seed variables** (configure your first tenant on startup):

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_TENANT_NAME` | `Dev Tenant` | Display name for your blog |
| `SEED_TENANT_SLUG` | `dev` | URL-safe identifier |
| `SEED_OWNER_EMAIL` | `dev@notipo.local` | Your login email |
| `SEED_API_KEY` | falls back to `API_KEY` | Tenant API key for calling the API |
| `SEED_NOTION_TRIGGER_STATUS` | `Ready to Publish` | Notion status that triggers sync |

The seed runs automatically on startup and is idempotent — safe to re-run. Categories and tags are imported automatically from WordPress once you connect your WP credentials — no manual configuration needed.

---

## Development — native Node

The fastest dev loop. Postgres runs in Docker; the app runs locally with hot reload.

**1. Start Postgres:**

```bash
docker compose up -d
```

**2. Install dependencies and generate Prisma client:**

```bash
npm install
npx prisma generate
```

**3. Copy and edit env:**

```bash
cp .env.example .env
# DATABASE_URL defaults to localhost:5432 — correct for this mode
```

**4. Run migrations and seed:**

```bash
npx prisma migrate dev
npx prisma db seed
```

**5. Start the app:**

```bash
npm run dev
```

The API is available at `http://localhost:3000`.
The admin UI is at `http://localhost:3000/admin`.

---

## Development — VS Code dev container

The dev container runs the app and Postgres together inside Docker. No local Node installation needed.

**Requirements:** VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.

**1. Copy env file:**

```bash
cp .env.example .env
```

**2. Open in container:**

Press `F1` and run `Dev Containers: Reopen in Container`, or click the popup that appears when you open the workspace.

VS Code will build the container, run `npm install && npx prisma generate`, and then on each start run `npx prisma migrate dev`.

**3. Start the app (inside the container terminal):**

```bash
npm run dev
```

Ports 3000 and 5432 are forwarded to your host automatically.

The API is at `http://localhost:3000`.
The admin UI is at `http://localhost:3000/admin`.

---

## Development — local Docker (no Node required)

Runs the full production image locally. No Node, npm, or Prisma CLI needed on your machine.

**1. Copy and edit env:**

```bash
cp .env.example .env
# Fill in ENCRYPTION_KEY and API_KEY at minimum
```

**2. Build and start:**

```bash
docker compose --profile full up --build
```

The app runs at `http://localhost:3000`.
The admin UI is at `http://localhost:3000/admin`.

On first start the container runs migrations and seed automatically.

---

## Production — VPS self-hosted

Uses `docker-compose.prod.yml` with Traefik as a reverse proxy. TLS certificates are issued automatically via Let's Encrypt.

**Requirements:**
- A Linux VPS with Docker and Docker Compose installed
- A domain name with an A record pointing to the VPS IP
- Port 80 and 443 open in the firewall

**1. Clone the repo on the VPS:**

```bash
git clone <repo-url>
cd notipo
```

**2. Create and configure `.env`:**

```bash
cp .env.example .env
```

Set at minimum:

```
ENCRYPTION_KEY=<openssl rand -hex 32>
API_KEY=<openssl rand -hex 16>
DB_PASSWORD=<openssl rand -hex 16>
DOMAIN=api.yourdomain.com
ACME_EMAIL=you@example.com

SEED_TENANT_NAME=My Blog
SEED_TENANT_SLUG=myblog
SEED_OWNER_EMAIL=you@example.com
SEED_API_KEY=<openssl rand -hex 16>
```

**3. Start the stack:**

```bash
docker compose -f docker-compose.prod.yml up -d
```

On first start, the app container runs `prisma migrate deploy` and `prisma db seed` before the server starts. Check the logs if the health check fails:

```bash
docker logs notipo-app
```

The app is available at `https://api.yourdomain.com`.
The admin UI is at `https://api.yourdomain.com/admin`.

**Updating to a new version:**

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Production — Railway

Railway builds and deploys the app automatically from your repository. You will need to create two services: the Node.js app and a PostgreSQL database.

**1. Create a new Railway project** and add a PostgreSQL plugin. Copy the `DATABASE_URL` Railway provides.

**2. Deploy the app service** by connecting your GitHub repo. Railway will detect `railway.toml` and build using the `production` Dockerfile target.

**3. Set environment variables** in the Railway dashboard:

```
DATABASE_URL=<from Railway Postgres plugin>
ENCRYPTION_KEY=<openssl rand -hex 32>
API_KEY=<openssl rand -hex 16>

SEED_TENANT_NAME=My Blog
SEED_TENANT_SLUG=myblog
SEED_OWNER_EMAIL=you@example.com
SEED_API_KEY=<openssl rand -hex 16>
SEED_NOTION_TRIGGER_STATUS=Post to Wordpress
```

The start command in `railway.toml` runs `prisma migrate deploy` before the app starts. The seed runs on first deploy via the Dockerfile CMD. After the first deploy, Railway uses the start command directly and skips the seed.

> Note: Railway uses the `startCommand` from `railway.toml`, which does not re-run the seed on redeploy. The seed only runs during the initial Docker build on first deploy.

**4. Add a custom domain** in Railway's networking settings if desired.

---

## First-run setup

After the app starts for the first time, the seed has created your tenant and owner user. You now need to connect Notion and WordPress credentials.

Open the admin UI (`/admin`) and either sign up with email and password (creates a new tenant) or enter your API key (the value of `SEED_API_KEY` or `API_KEY`). An onboarding stepper guides you through the remaining setup. Go to **Settings** and connect:

**Notion** (choose one):
- **OAuth** (recommended): Click "Connect to Notion" → authorize in Notion's consent screen → select which database to share. Credentials and database ID are configured automatically. Requires OAuth env vars to be set.
- **Manual token**: Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), copy the token, and paste it in Settings along with the database ID.

**WordPress:**
- Site URL (e.g. `https://yourblog.com`)
- Username
- Application password (WP Admin → Users → Application Passwords)

When you save WordPress credentials, all your WP categories and tags are automatically imported into Notipo and pushed to your Notion database as `Category` select and `Tags` multi-select options. They stay in sync — new categories or tags you create in WordPress are picked up every 5 minutes and appear in Notion automatically. You can also trigger a manual sync from the **Categories & Tags** page.

---

## Notion database setup

Start by duplicating the [Notipo Blog Template](https://free-dentist-6b2.notion.site/30d842af972f8091a104eb8773fbf390?v=30d842af972f8091a104eb8773fbf390) — it has all required properties pre-configured.

Your Notion database needs these properties:

| Property | Type | Notes |
|----------|------|-------|
| Name | Title | Post title (default Notion title column) |
| Status | Select | Options: `Post to Wordpress`, `Publish`, `Update Wordpress`, `Ready to Review`, `Published` |
| Category | Select | Auto-populated from WordPress categories |
| Tags | Multi-select | Auto-populated from WordPress tags |
| Slug | Text | URL slug for the WordPress post |
| SEO Keyword | Text | Rank Math focus keyword |
| WordPress Link | URL | Auto-filled with the WP post URL after sync/publish |

The `Status` options are configurable per tenant — the names above are defaults. `Category` and `Tags` options are automatically synced from your WordPress site once you connect WP credentials. After syncing or publishing a post, the `WordPress Link` property is updated with a direct link to the post in WordPress.

---

## Admin UI

The admin UI is a single-page app served at `/admin`. Sign up with email and password, or enter an existing API key on first visit. The key is stored in `localStorage` and auto-detected as admin or tenant-level by probing the tenants endpoint. The current page persists across browser refreshes via URL hash.

New tenants see an onboarding stepper that guides them through connecting Notion (with a link to the Notion database template) and WordPress. The stepper disappears once both services are configured.

Pages available:

- **Dashboard** — post status counts, recent jobs with live step progress, config health check. Updates in real-time via Server-Sent Events.
- **Posts** — full post list with status badges, WordPress links, expandable detail rows
- **Categories & Tags** — auto-imported from WordPress, synced every 5 minutes. Manual sync available via button.
- **Jobs** — background job activity log with error display, status filtering, and clickable WP links
- **Settings** — Notion connection (OAuth or manual token, with disconnect button), WordPress credentials (with disconnect button), trigger statuses, code highlighter
- **Tenants** — admin-only page for creating and managing tenants (API key shown once on creation)


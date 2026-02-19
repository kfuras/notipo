# Pressflow

A self-hosted backend that publishes blog posts from Notion to WordPress automatically. It watches a Notion database for status changes, converts the content to Gutenberg blocks, generates featured images, handles inline image uploads, and applies Rank Math SEO metadata — all without touching WordPress manually.

---

## How it works

You write posts in Notion. When you change the status to your configured trigger value (e.g. "Post to Wordpress"), the app syncs the post to a WordPress draft. When you set it to "Publish", it goes live. Updates to already-published posts are handled by a third status ("Update Wordpress").

The app polls your Notion database every 15 seconds. All credentials are stored encrypted in the database — never in plain environment variables.

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
- [Admin UI](#admin-ui)
- [Adding categories](#adding-categories)

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
| `SEED_OWNER_EMAIL` | `dev@pressflow.local` | Your login email |
| `SEED_API_KEY` | falls back to `API_KEY` | Tenant API key for calling the API |
| `SEED_NOTION_TRIGGER_STATUS` | `Ready to Publish` | Notion status that triggers sync |
| `SEED_WP_TAGS` | `{}` | JSON map of tag name to WP tag ID |
| `SEED_CAT_1` ... `SEED_CAT_N` | — | Category definitions (see below) |

The seed runs automatically on startup and is idempotent — safe to re-run.

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
cd pressflow
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
docker logs pressflow-app
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

Open the admin UI (`/admin`) and enter your API key (the value of `SEED_API_KEY` or `API_KEY`). Then go to **Settings** and fill in:

**Notion:**
- Integration token (from [notion.so/my-integrations](https://www.notion.so/my-integrations))
- Database ID (the long ID from your Notion database URL)
- Trigger status value (e.g. `Post to Wordpress`)

**WordPress:**
- Site URL (e.g. `https://yourblog.com`)
- Username
- Application password (WP Admin → Users → Application Passwords)


---

## Admin UI

The admin UI is a single-page app served at `/admin`. No login page — enter your API key on first visit and it is stored in `localStorage`. The key is auto-detected as admin or tenant-level by probing the tenants endpoint.

Pages available:

- **Dashboard** — post status counts, recent jobs, config health check
- **Posts** — full post list with status badges, WordPress links, expandable detail rows
- **Jobs** — background job activity log with error display and status filtering
- **Settings** — Notion credentials, WordPress credentials, trigger statuses, code highlighter
- **Tenants** — admin-only page for creating and managing tenants (API key shown once on creation)

---

## Adding categories

Categories map Notion category names to WordPress category IDs and optional tag IDs. They also hold the background image used for featured image generation.

Configure them in `.env` before first deploy using `SEED_CAT_1`, `SEED_CAT_2`, etc. See `.env.example` for the format. The seed runs automatically on startup and is idempotent, so you can update the values and restart to apply changes.

Background images are plain filenames (e.g. `automation.png`) stored in `public/category-images/`, or full `https://` URLs.

To find WordPress category and tag IDs: **WP Admin → Posts → Categories / Tags** — check the URL when editing an item, the `tag_ID` query parameter is the ID you need.

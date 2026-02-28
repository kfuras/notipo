# Notipo

A self-hosted backend that publishes blog posts from Notion to WordPress automatically. It watches a Notion database for status changes, converts the content to Gutenberg blocks, generates featured images, handles inline image uploads, and applies Rank Math SEO metadata — all without touching WordPress manually.

---

## How it works

You write posts in Notion. When you change the status to your configured trigger value (e.g. "Post to Wordpress"), the app syncs the post to a WordPress draft. When you set it to "Publish", it goes live. To update content after syncing or publishing, use "Update Wordpress" — it re-syncs the content and only auto-publishes if the WP post is currently live. Drafts stay as drafts.

Notion webhooks (configured on the public integration) are the primary trigger — events are delivered automatically for all OAuth users. A safety-net poll runs every 5 minutes by default (`POLL_INTERVAL_SECONDS`) to catch any missed events. WordPress categories and tags are automatically imported and pushed to your Notion database as dropdown options, so you never need to look up numeric IDs or type names manually. After syncing, the wp-admin edit URL is written back to the `WordPress Link` property on the Notion page (published posts get the live frontend URL instead). Rank Math SEO metadata (focus keyword, title, description) is applied during sync so it's ready for review in the WordPress editor. All credentials are stored encrypted in the database — never in plain environment variables. A "Sync Now" button on the dashboard lets you trigger an instant poll without waiting for the 60-second interval.

If a sync or publish job fails, the Notion status is automatically reset so you can retry. Jobs stuck in a running state for more than 5 minutes are auto-failed. You can configure a Slack or Discord webhook URL in Settings to receive push notifications when jobs fail. WordPress credentials are validated on save — the app tests the connection before storing them.

New users can sign up with email and password via the admin UI. A verification email is sent — clicking the link verifies the email and logs the user in automatically. An onboarding stepper then guides them through connecting Notion and WordPress. Self-service signup can be disabled by setting `ALLOW_SIGNUP=false`. Set `ADMIN_NOTIFY_EMAIL` to receive an email when new users sign up.

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
| `NOTION_WEBHOOK_SECRET` | HMAC secret for webhook verification (from Notion integration settings) |
| `POLL_INTERVAL_SECONDS` | Safety-net poll interval in seconds (default: `300`) |

**Email (Resend)** (required for email verification and password reset):

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) |
| `RESEND_FROM_EMAIL` | Sender address (default: `noreply@notipo.com`) — verify your domain in Resend |
| `ADMIN_NOTIFY_EMAIL` | (Optional) Email address to notify when new users sign up |

**Stripe billing** (optional — enables subscription upgrades):

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for the Pro plan (`price_...`) |

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

The fastest dev loop. Postgres runs in Docker; the app and web frontend run locally with hot reload.

**1. Start Postgres:**

```bash
docker compose up -d
```

**2. Install dependencies (from monorepo root):**

```bash
npm install
```

**3. Copy and edit env:**

```bash
cp apps/api/.env.example apps/api/.env
# DATABASE_URL defaults to localhost:5432 — correct for this mode
```

**4. Run migrations and seed:**

```bash
npm run migrate -w @notipo/api
npm run seed -w @notipo/api
```

**5. Start all apps:**

```bash
turbo dev
```

Or start individually:

```bash
npm run dev -w @notipo/api    # API at http://localhost:3000
npm run dev -w @notipo/web    # Web at http://localhost:3001
```

The API is available at `http://localhost:3000`.
The admin UI is at `http://localhost:3001/admin`.

---

## Development — VS Code dev container

The dev container runs the app and Postgres together inside Docker. No local Node installation needed.

**Requirements:** VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.

**1. Copy env file:**

```bash
cp apps/api/.env.example apps/api/.env
```

**2. Open in container:**

Press `F1` and run `Dev Containers: Reopen in Container`, or click the popup that appears when you open the workspace.

VS Code will build the container, run `npm install`, and then on each start run migrations.

**3. Start the apps (inside the container terminal):**

```bash
turbo dev
```

Ports 3000 (API), 3001 (web), and 5432 (Postgres) are forwarded to your host automatically.

The API is at `http://localhost:3000`.
The admin UI is at `http://localhost:3001/admin`.

---

## Development — local Docker (no Node required)

Runs the full production images locally. No Node, npm, or Prisma CLI needed on your machine.

**1. Copy and edit env:**

```bash
cp apps/api/.env.example apps/api/.env
# Fill in ENCRYPTION_KEY and API_KEY at minimum
```

**2. Build and start:**

```bash
docker compose --profile full up --build
```

The API runs at `http://localhost:3000`.
The admin UI is at `http://localhost:80/admin` (served by nginx).

On first start the API container runs migrations and seed automatically.

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
DOMAIN=yourdomain.com
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

The API is available at `https://yourdomain.com/api`.
The admin UI is at `https://yourdomain.com/admin`.

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

Open the admin UI at `/admin` and either sign up with email and password (creates a new tenant) or enter your API key (the value of `SEED_API_KEY` or `API_KEY`). An inline onboarding stepper on the dashboard guides you through three steps:

**Step 1 — Duplicate the Notion template:**
Open the [Notipo Blog Template](https://free-dentist-6b2.notion.site/30d842af972f8091a104eb8773fbf390?v=30d842af972f8091a104eb8773fbf390) and duplicate it to your workspace. This gives you a database with all required properties pre-configured. Confirm in the stepper once done.

**Step 2 — Connect Notion** (choose one):
- **OAuth** (recommended): Click "Connect to Notion" → authorize in Notion's consent screen → select the database you just duplicated. Credentials and database ID are configured automatically. Requires OAuth env vars to be set.
- **Manual token**: Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), copy the token, and paste it in the inline form.

**Step 3 — Connect WordPress:**
- Site URL (e.g. `https://yourblog.com`)
- Username (your WordPress admin username, found under Users in WP admin)
- Application password (WP admin → Users → Profile → scroll to Application Passwords → enter a name like "Notipo" → click "Add New Application Password")

When you save WordPress credentials, all your WP categories and tags are automatically imported into Notipo and pushed to your Notion database as `Category` select and `Tags` multi-select options. They stay in sync — new categories or tags you create in WordPress are picked up every 60 seconds and appear in Notion automatically. You can also trigger a manual sync from the **Categories & Tags** page.

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

The `Status` options are configurable per tenant — the names above are defaults. `Category` and `Tags` options are automatically synced from your WordPress site once you connect WP credentials. After syncing, the `WordPress Link` property is updated with the wp-admin edit URL for drafts, or the live frontend URL for published posts. If you delete a WP post and re-trigger "Post to Wordpress", a fresh draft is created automatically.

---

## Billing & Plans

New tenants start on a **7-day Pro trial** (no credit card required). After the trial expires, they drop to the Free plan. Users can upgrade to Pro at any time via Stripe Checkout.

| Feature | Free | Pro ($19/mo) |
|---------|------|--------------|
| Posts per month | 5 | Unlimited |
| Featured images | No | Yes |
| Webhooks + instant sync | No | Yes |
| Poll interval | 5 min | 5 min |
| Code highlighting + SEO | Yes | Yes |

Billing requires three Stripe env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRO_PRICE_ID`. Without them, the billing page shows "Billing is not configured" and all features remain unlocked.

**Stripe webhook setup:** Create a webhook endpoint in the Stripe dashboard pointing to `https://yourdomain.com/api/billing/webhook`. Subscribe to these events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

**Customer Portal:** Enable "Cancel subscriptions" in Stripe Dashboard → Settings → Billing → Customer portal so users can manage their subscription.

---

## Admin UI

The admin UI is a Next.js app (shadcn/ui + Tailwind) served at `/admin`. The login page has three tabs: **Sign in** (email + password), **Register** (creates a new tenant with a 7-day Pro trial — only shown when `ALLOW_SIGNUP=true`), and **API Key** (direct key entry). Registration requires email verification — a verification link is sent, and clicking it verifies the email and logs the user in automatically. Unverified login attempts show a "verify your email" message with a resend option. The key is stored in `localStorage` and auto-detected as admin or tenant-level by probing the tenants endpoint.

New tenants see an inline onboarding stepper on the dashboard that guides them through three steps: duplicating the Notion template, connecting Notion (OAuth or manual token), and connecting WordPress. Each step expands inline with its own form — no bouncing to the settings page. The stepper shows a progress bar and disappears once all steps are complete. OAuth redirects return to the dashboard with a toast notification.

The admin uses a dark theme. The landing page has a light/dark theme toggle (sun/moon icon) — preference is stored in `localStorage`.

The UI is mobile-optimized — on phones, the sidebar is replaced by a fixed bottom navigation bar, tables switch to stacked card layouts, and padding is adjusted for smaller screens.

Pages available:

- **Dashboard** — post status counts, recent jobs with live step progress, config health check, "Sync Now" button for instant Notion polling. Updates in real-time via Server-Sent Events.
- **Posts** — full post list with status badges, WordPress links, category display
- **Categories & Tags** — auto-imported from WordPress, synced every 60 seconds. Manual sync available via button. Upload custom background images per category for featured image generation (supports PNG, JPEG, WebP up to 5 MB). Click a thumbnail to preview, replace, or remove the image.
- **Jobs** — background job activity log with error display, status filtering, and clickable WP links
- **Settings** — Notion connection (OAuth or manual token, with disconnect button), WordPress credentials (validated on save, with disconnect button), trigger statuses, code highlighter (radio buttons), webhook notifications (Slack/Discord URL with test button)
- **Billing** — current plan badge (Free/Pro/Trial with days remaining), upgrade button (→ Stripe Checkout), manage subscription button (→ Stripe Customer Portal), usage stats (posts, featured images, webhooks)
- **Account** — user profile (email, role, organization), change password, delete account (OWNER deletion removes the entire tenant and all data)
- **Tenants** — admin-only page for creating and managing tenants (API key shown once on creation). Click "View" on any tenant to impersonate them — browse their dashboard, posts, categories, settings, and jobs as if you were that customer. An amber banner shows which tenant you're viewing with an "Exit" button to return to the tenant list.

The marketing site also includes a **Blog** section (`/blog`) with SEO-optimized posts (JSON-LD structured data, per-post OG images, RSS feed at `/blog/feed.xml`), a **Feedback** page (`/feedback`) using Web3Forms, and a custom 404 page.


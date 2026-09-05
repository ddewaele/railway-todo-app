# Manual steps

Everything that could not be automated, as copy-pasteable commands. Run from the repo root.
Values for this deployment: repo `ddewaele/railway-todo-app`, Railway project
`c06b4c12-bb3c-4512-a194-94d89405df5b` (workspace "Davy De Waele's Projects"), region `ams`,
domain `app-production-71fb5.up.railway.app`. Replace them when using this repo as a template.

## 0. Preflight

```bash
scripts/preflight.sh --repo ddewaele/railway-todo-app     # ❌ rows are interactive steps below
```

## 1. One-time tooling

```bash
brew install gh railway                 # GitHub CLI + Railway CLI
corepack enable                         # pnpm from package.json#packageManager
gh auth login                           # log in with the account that owns the repo
gh auth refresh -s workflow             # needed to merge PRs touching .github/workflows from the CLI
railway login                           # browser device login (interactive, once per machine)
```

## 2. Git identity when you have several GitHub accounts

The SSH key on this machine belongs to another GitHub account, so the remote is HTTPS and the
identity is repo-local.

```bash
git config user.name  "Davy De Waele"
git config user.email "ddewaele@gmail.com"                                # repo-local, not --global
git config credential.helper '!gh auth git-credential'                     # repo-local; pushes use gh's token
git remote set-url origin https://github.com/ddewaele/railway-todo-app.git
gh auth status                                                             # confirm the active account
```

## 3. Link this directory to the Railway project

```bash
railway link -p c06b4c12-bb3c-4512-a194-94d89405df5b -e production
railway status                                                        # verify project + environment
```

Alternative without login (project token from step 6): `export RAILWAY_TOKEN=<token>`.

## 4. Google OAuth client (required for real sign-in)

Google has no API for this; use the console. Until this is done the app answers
`503 Google sign-in is not configured` on `/api/auth/google`.

1. https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID → Web application**.
2. Authorised redirect URIs:
   ```
   http://localhost:5174/api/auth/google/callback
   https://app-production-71fb5.up.railway.app/api/auth/google/callback
   ```
3. Local `.env`:
   ```bash
   cp -n .env.example .env
   # edit GOOGLE_CLIENT_ID=... and GOOGLE_CLIENT_SECRET=...
   ```
4. Railway (reads the values from `.env`; the secret goes through stdin so it stays out of shell history):
   ```bash
   set -a; source .env; set +a
   railway variable set "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" --service app --skip-deploys
   printf '%s' "$GOOGLE_CLIENT_SECRET" | railway variable set GOOGLE_CLIENT_SECRET --stdin --service app
   railway variable list --service app        # names + values: do not paste the output anywhere
   ```
   Or: Railway dashboard → project `railway-todo-app` → `app` service → **Variables**.
5. Verify: `curl -sI https://app-production-71fb5.up.railway.app/api/auth/google | head -3` → `302` with `location: https://accounts.google.com/...`.

## 5. Other Railway variables (already set for this project; needed for a fresh copy)

```bash
railway config apply --yes                                          # Postgres + app from .railway/railway.ts
railway variable set "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')" --service app --skip-deploys
railway domain --service app                                        # generate the public domain
railway variable set "APP_URL=https://<domain>" --service app       # triggers a redeploy
railway variable list --service app --json | jq -r .APP_URL         # must contain exactly one "https://"
```

`railway domain --service app --json` returns `{"domain":"https://..."}` **with** the scheme. Do not
prefix it again: a doubled `https://https://` makes Google reject the login with
`Error 400: invalid_request` ("doesn't comply with Google's OAuth 2.0 policy"), because the
`redirect_uri` is malformed.

`NODE_ENV` and `DATABASE_URL` come from the IaC file.

## 6. Railway project token → GitHub secret (enables the IaC workflow)

1. Railway dashboard → project → **Settings → Tokens** → create a token for environment `production`.
2. Store it (prompts for the value):
   ```bash
   gh secret set RAILWAY_TOKEN --repo ddewaele/railway-todo-app
   ```
3. Verify the IaC file matches the live environment:
   ```bash
   railway config plan            # expect: "Your Railway configuration is already up to date."
   ```

## 7. GitHub repo settings (done by scripts/bootstrap.sh; here for reference)

```bash
gh repo create ddewaele/railway-todo-app --public --source . --remote origin --push
gh api -X PATCH repos/ddewaele/railway-todo-app -f allow_auto_merge=true -f delete_branch_on_merge=true \
  -f allow_merge_commit=false -f allow_rebase_merge=false -f allow_squash_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY -F is_template=true
gh api -X POST repos/ddewaele/railway-todo-app/rulesets --input - <<'JSON'
{"name":"protect-main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["squash"]}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci"}]}}],
 "bypass_actors":[]}
JSON
```

The ruleset also blocks the very first push to an empty repo. Disable it for that one push and
re-enable it: `gh api -X PUT repos/<owner/repo>/rulesets/<id> -f enforcement=disabled`, push,
then `-f enforcement=active`. Merge queues are unavailable on user-owned repos, hence
`strict_required_status_checks_policy: false`.

## 8. Daily workflow

```bash
git checkout -b feat/<name>
pnpm check && pnpm e2e                                   # what CI runs
git push -u origin feat/<name>
N=$(gh pr create --fill --json number --jq .number)      # capture the number, never assume it
gh pr merge "$N" --auto --squash                         # merges when the `ci` check passes; Railway deploys main
```

Dependabot PRs: `gh pr merge <n> --auto --squash` (workflow-file bumps need the `workflow` scope from step 1).

## 9. Claude Code MCP servers (optional, per developer machine)

Not used to build this repo (everything went through the `gh`, `railway` and `playwright` CLIs),
but useful for interactive sessions:

```bash
claude mcp add railway --transport http https://mcp.railway.com          # then /mcp -> authenticate
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp add postgres -- npx -y @bytebase/dbhub --dsn "postgres://app:app@localhost:5434/app"
claude mcp add github --transport http https://api.githubcopilot.com/mcp/ --header 'Authorization: Bearer ${GH_TOKEN}'
echo 'export GH_TOKEN="$(gh auth token)"' >> ~/.zshrc     # GitHub MCP has no OAuth handshake; needs a token
```

Restart `claude` after adding servers.

## 10. Local services

```bash
docker compose up -d          # Postgres on :5434 with app + app_test databases
pnpm db:migrate
pnpm dev                      # server :3001, web :5174
```

## Known gotchas

- Railway region ids are short codes (`ams`, `iad`, `sin`, `us-west2`). `europe-west4` is the legacy name.
- `postgres(...)` in the IaC file **ignores `region` at creation** in the current SDK/CLI: the database
  was created in `us-west2` and moved to `ams` with a second `railway config apply --confirm-destructive`
  while it was still empty. Check `railway config plan` right after the first apply and move before
  any data exists.
- Railway Hobby allows one region per service. Moving recreates the volume (data loss); adding a region
  without removing the old one is rejected as multi-region.
- A deploy that starts while the database is being moved fails in pre-deploy with
  `getaddrinfo ENOTFOUND postgres.railway.internal`; the next push (or a redeploy) succeeds.
- `.env` is git-ignored and only loaded outside production; Railway reads service variables exclusively.

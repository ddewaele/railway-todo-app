# Workflow retrospective

How this repo was built in one agent-driven session (2026-09-05) from the
[railway-fullstack-template](https://github.com/ddewaele/railway-fullstack-template): what went
wrong, what it cost, and what would have prevented it. The template's own retrospective was the
input; this file records what changed on the second run.

Scale: 7 feature PRs, 1 bootstrap commit, ~15 minutes of wall clock from first commit to the live
SPA, zero force merges, every PR merged by auto-merge on a green `ci` run.

## 1. What the previous retrospective fixed (confirmed this run)

| Lesson from the template                                | Outcome this run                                                                                                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight auth state, not tool presence                 | `railway whoami`, `gh auth status` scopes (`repo`, `workflow`), SSH identity, ports, Docker checked before planning. No interactive logins were needed. Provisioning went through the CLI (IaC) as planned. |
| Capture PR numbers from `gh pr create`                  | Done for all 7 PRs; auto-merge armed on the right PR every time.                                                                                                                                            |
| Non-strict `ci` check, no merge queue on personal repos | Set in the ruleset from the start; no `BEHIND` loops even with stacked branches.                                                                                                                            |
| Dependabot last                                         | Added in the docs PR; no bot PRs interleaved.                                                                                                                                                               |
| Secret-dependent workflow guarded from day one          | `railway-config.yml` shipped with the skip-with-notice guard; it skipped cleanly on PR 6.                                                                                                                   |
| SPA fallback tested against a real `dist`               | A fixture `dist` is part of the server test setup, and CI runs a production smoke test after `pnpm build`.                                                                                                  |
| Provision as soon as `/api/health` exists               | Railway project created and applied right after PR 1; deploy feedback for PRs 2–4 arrived while later slices were being written.                                                                            |
| No `cd`, `mkdir -p`, `git status` before commits        | Followed; no misplaced files, no accidental commits.                                                                                                                                                        |

## 2. Incidents this run

Ordered by cost. **Cost** = wasted round trips.

| #   | Incident                                                                                                                                                                               | Root cause                                                                                                                             | Cost   | Prevention                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Postgres created in `us-west2`** although `railway.ts` said `region: "ams"`. `railway config plan` right after apply showed "Move database Postgres to ams" as a destructive change. | The `postgres()` template deploy ignores `region` on creation in the current CLI/SDK; the app service honoured `replicas: { ams: 1 }`. | Medium | Run `railway config plan` immediately after the first apply and apply the move **before any data exists** (done here; the DB was empty). Track the SDK behaviour; consider creating the database from the dashboard in-region.  |
| 2   | **One Railway deploy failed** (todos merge): pre-deploy migration died with `getaddrinfo ENOTFOUND postgres.railway.internal`.                                                         | The deploy ran while the database was being moved to `ams` (incident 1). The next merge redeployed successfully.                       | Low    | Do region moves before connecting the source, or pause auto-deploys during the move. Nothing to fix in code: the healthcheck gate kept the previous version serving.                                                            |
| 3   | **First push to `main` rejected** by the freshly created ruleset (PR required), then `gh repo create --push` had used SSH (wrong account).                                             | Ruleset created before the initial push; `gh` git protocol is `ssh` on this machine.                                                   | Low    | Bootstrap order: create repo → push initial commit over HTTPS → then add the ruleset. Set `credential.helper '!gh auth git-credential'` repo-locally. `bootstrap.sh` already pushes before the ruleset; the manual run did not. |
| 4   | **`railway config plan` needs the `railway` npm package** next to the IaC file; the first plan from a scratch directory failed with "SDK is not installed".                            | The CLI evaluates `railway.ts` with the SDK from `node_modules`.                                                                       | Low    | Install `railway` as a dev dependency in slice 1 (or in the scratch dir used for provisioning) before the first plan.                                                                                                           |
| 5   | **`git rebase --onto` refused** once because the next slice's files were still uncommitted in the working tree.                                                                        | Started the next slice on a stacked branch before its predecessor merged, then rebased with a dirty tree.                              | Low    | Commit (or `git stash -u`) before rebasing a stacked branch; the stash dance worked the second time.                                                                                                                            |
| 6   | **A pre-existing Docker volume** (`railwayapptest2_pgdata`) from an earlier project in a directory of the same name was reused by `docker compose up`.                                 | Compose project name derives from the directory name.                                                                                  | Low    | Preflight lists `docker volume ls` matches for the project name; it was empty this time, otherwise `docker compose down -v` first.                                                                                              |
| 7   | **The named skills (`preflight`, `ship-feature`, `railway-provision`) were not installed** in the session; they live in the template repo only.                                        | Skills are per-repo `.claude/skills`; an empty directory has none.                                                                     | Low    | Clone the template first (or copy `.claude/skills`) so the skills are available as skills, not just as text to follow. They are now in this repo too.                                                                           |

## 3. Patterns

1. **Verify remote state right after every state-changing apply** (`railway config plan`, `gh pr view --json autoMergeRequest`, `railway status`). Incident 1 was caught within a minute because of this.
2. **Stacked branches are fine when each PR is small and CI is fast** (about 2 minutes here), but every merge costs one `rebase --onto`. With a 2-minute CI it was often faster to just wait.
3. **Secrets never touched the transcript**: `SESSION_SECRET` came from `openssl rand` inside the CLI call; Google credentials remain a user step with commands in `MANUAL_STEPS.md`.

## 4. What would make the next run faster

- Add `railway` to root devDependencies in the foundation slice so the IaC file can be planned from the repo from minute one.
- Create the Postgres service **and check its region** before connecting the app source; move it while empty.
- Bootstrap order: push the initial commit **before** creating the ruleset.
- Start each stacked branch only after committing the previous one, or wait for the merge when CI is under 3 minutes.
- Keep the production smoke test in CI (it caught nothing this time, but it is cheap and it is what found the SPA-fallback bug last time).

## 5. Checklist for the next project

- [ ] Run `scripts/preflight.sh`; hand the user the interactive logins first.
- [ ] Decide repo name, region, merge-message policy before planning (they were placeholders in the brief this time and needed one round trip).
- [ ] Bootstrap: init → initial commit → `gh repo create` (HTTPS) → settings → ruleset.
- [ ] Slice 1 includes CI, health, JSON 404, SPA fallback test, smoke test, and the `railway` dev dependency.
- [ ] Provision right after slice 1; `railway config plan` immediately; fix region while empty; set `SESSION_SECRET`, domain, `APP_URL`.
- [ ] Each PR: `pnpm check`, build + smoke, e2e when UI changed, PR body as release notes, auto-merge with the returned number, background wait.
- [ ] Dependabot and docs last; verify `railway config plan` is clean before the final report.

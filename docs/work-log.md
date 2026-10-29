# Work log

## 2026-10-29 18:12 - Main branch

- **What:** Created `main` and merged `feat/standalone-mail-merge` and `feat/charantra-shell` into it. The shell commit already contained the standalone commit, so the merge is that one line of history.
- **Why:** The GitHub repo had no `main` branch. The two feature branches were the only heads.
- **Files:** `docs/work-log.md`
- **Check:** On GitHub, `main` shows both commits, and it is the default branch.

## 2026-10-29 17:40 - Sender list

- **What:** Env updated. Values not recorded.
- **Why:** Two more Outlook From addresses need to appear in the mail merge sender list.
- **Files:** `.env.local`
- **Check:** Reload the mail merge page and open the From list. Both new addresses should be choices. This file is local only, so the live server needs the same env edit by hand, then a restart.

## 2026-10-29 17:35 - Charantra shell

- **What:** Login, the merge wizard, and the tracker share one navy and orange shell, the Charantra logo, and a New merge / Tracker nav. The logo is public so it shows before sign-in.
- **Why:** The standalone app still looked like a plain form, and the wordmark has to load on the login page.
- **Files:** `mail-merge/ui/Shell.tsx`, `app/login/page.tsx`, `app/mail-merge/page.tsx`, `app/mail-merge/tracker/page.tsx`, `mail-merge/ui/*.tsx`, `tailwind.config.ts`, `app/globals.css`, `middleware.ts`, `public/brand/charantra-logo.png`
- **Check:** Open `/login`. After sign-in, open `/mail-merge` and `/mail-merge/tracker` and confirm the same header on both.

## 2026-10-29 14:50 - Public login stays on the domain

- **What:** Caddy rewrites redirect locations from `https://localhost:3000` to `https://mailmerge.charantra.ai`.
- **Why:** The app listens on `127.0.0.1:3000`. Next was sending the browser to `https://localhost:3000/login`.
- **Files:** `/etc/caddy/Caddyfile` on the EC2 instance
- **Check:** Open `https://mailmerge.charantra.ai` and confirm the address bar stays on that host at `/login`.

## 2026-10-29 12:46 - GitHub repo

- **What:** Started version control and pushed the app to a private repo on the Charantra GitHub account.
- **Why:** The app needs a remote before it can be deployed.
- **Files:** repository `Charantra/mail-merge`, branch `feat/standalone-mail-merge`
- **Check:** Open the private repo on GitHub and confirm `.env.local` is not in the tree.

## 2026-10-28 16:44 — Sender list

- **What:** Env updated. Values not recorded.
- **Why:** Three more Outlook From addresses need to appear in the mail merge sender list.
- **Files:** `.env.local`
- **Check:** Reload the mail merge page and open the From list.

## 2026-10-28 14:32 — Env file

- **What:** Env updated. Values not recorded.
- **Why:** The app needs local secrets to sign in, reach Postgres, and send through Outlook.
- **Files:** `.env.local`
- **Check:** Restart `npm run dev` and open `/login`.

## 2026-10-28 14:35 — Standalone mail merge app

- **What:** Copied the server modules mail merge calls into this folder and added the Next.js shell: login, layout, home redirect, migrations for send and audit tables, and a small send-request helper. Investor outreach files were not moved or deleted.
- **Why:** This folder was a source copy and could not run. Mail merge should live on its own, apart from the outreach product.
- **Files:** `lib/sendRequests.ts`, `lib/*` copies, `app/layout.tsx`, `app/page.tsx`, `app/login/`, `app/api/auth/`, `middleware.ts`, `scripts/migrations/0001_send_and_audit.sql`, `package.json`, `README.md`
- **Check:** `npm run check:mailmerge`, then `npm run dev` and open `/login`.

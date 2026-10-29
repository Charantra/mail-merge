# Work log

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

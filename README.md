# Mail merge

Standalone Next.js app. The investor outreach project is unchanged. Files this app needs were copied from there.

## Folders

- `mail-merge/core`: template, merge, spreadsheet, and .eml output
- `mail-merge/ui`: Data, Recipients, Compose, Preview, Finish
- `app/mail-merge`: wizard and tracker pages
- `app/api/mail-merge`: send one batch, list runs, check replies
- `app/mm`: public open pixel and click redirect
- `app/login` and `app/api/auth`: sign-in
- `lib`: database, Outlook, tracking, and send idempotency, copied from outreach
- `scripts/migrations`: `0001` support tables, `0008` mail merge runs and messages

## Run

```
npm install
```

Create `.env.local` in this folder (it is gitignored). Do not commit it. Keys:

- `DATABASE_URL`
- `AUTH_SECRET` (32 characters or more)
- `AUTH_PASSWORD`
- `AUTH_ALLOWED_DOMAIN` (defaults to `charantra.ai`)
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- `OUTLOOK_USER_EMAIL`
- `MAIL_MERGE_SENDERS` (optional extra From addresses)
- `APP_PUBLIC_URL` (public https address, required for open and click links)

Then:

```
npm run db:migrate
npm run dev
```

Open `/login`, then `/mail-merge`.

`npm run check:mailmerge` checks the core module and does not need a database.

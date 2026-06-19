# ProfPing

A small Next.js 14 (App Router, TypeScript) app for cold-emailing business school
professors about research positions. Three tabs:

1. **Source** — populate professors by scraping a faculty directory URL (free, no
   Firecrawl) or pasting a CSV.
2. **Review & Hooks** — filter, verify emails, and generate an editable one-sentence
   AI "hook" per professor.
3. **Compose & Send** — edit the email template, live-preview a merged email, attach a
   resume PDF, set a throttle, and send selected "ready" emails sequentially via the
   Gmail API.

Built to deploy on Vercel. Sends from your own Gmail account using a Gmail API refresh
token.

---

## Quick start (local)

```bash
npm install
cp .env.local.example .env.local   # then fill in values (see below)
npm run dev                        # http://localhost:3000
```

You can run and explore the UI immediately. Scraping/hooks need
`ANTHROPIC_API_KEY`; sending needs the Google/Gmail variables.

### The exact env vars to fill in

| Variable | Required? | What it's for |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **Yes** (scrape + hooks) | Claude calls for extraction and hook generation |
| `GOOGLE_CLIENT_ID` | **Yes** (sending) | OAuth client |
| `GOOGLE_CLIENT_SECRET` | **Yes** (sending) | OAuth client |
| `GOOGLE_REDIRECT_URI` | **Yes** (sending) | Must match the OAuth client's redirect URI exactly |
| `GMAIL_REFRESH_TOKEN` | **Yes** (sending) | Minted once via `/api/auth` (see below) |
| `SENDER_EMAIL` | **Yes** (sending) | The Gmail address you send from (e.g. `hzisow@gmail.com`) |
| `MAILEROO_API_KEY` | Optional | Richer email verification; without it, verification falls back to a local syntax + DNS-MX check |
| `SCRAPINGBEE_API_KEY` | Optional | JS-rendered directory fallback; without it, only a plain server-side fetch is used |

Copy `.env.local.example` to `.env.local` and fill these in.

---

## Getting the API keys

### Anthropic (required for scraping + hooks)

1. Go to <https://console.anthropic.com/> → **API Keys** → create a key.
2. Put it in `.env.local` as `ANTHROPIC_API_KEY`.

The app uses model `claude-sonnet-4-6`. The scrape prompt forbids inventing emails — a
professor is skipped unless their real address appears verbatim on the page.

### Maileroo (optional — email verification)

1. Sign up free at <https://maileroo.com/> and grab an Email Verification API key.
2. Set `MAILEROO_API_KEY`.

If you skip this, verification still works for free: ProfPing falls back to an
RFC-style syntax check plus a DNS **MX** lookup. You just won't get the SMTP /
catch-all signals — which is fine, because university servers are usually catch-all
anyway (see below).

### ScrapingBee (optional — JS-heavy directories)

1. Free key at <https://www.scrapingbee.com/>.
2. Set `SCRAPINGBEE_API_KEY`.

The scraper first tries a plain server-side `fetch()`. Only if that returns too little
text (under ~500 characters, suggesting a JavaScript-rendered page) **and** a
ScrapingBee key is present does it retry through ScrapingBee. No key → it just uses the
plain fetch result. (Firecrawl is not used anywhere.)

---

## Google Cloud OAuth client (required for sending)

The app sends mail through the Gmail API as your account. Set up an OAuth client once:

1. **Create / pick a project** at <https://console.cloud.google.com/>.
2. **Enable the Gmail API**: APIs & Services → Library → search "Gmail API" → Enable.
3. **OAuth consent screen**: APIs & Services → OAuth consent screen.
   - User type: **External**.
   - Keep it in **Testing** mode.
   - Under **Test users**, add the Gmail address you'll send from (e.g.
     `hzisow@gmail.com`). Testing mode + a listed test user is all you need — no
     verification/review.
4. **Create credentials**: APIs & Services → Credentials → **Create credentials** →
   **OAuth client ID** → Application type **Web application**.
   - **Authorized redirect URIs** — add both:
     - `http://localhost:3000/api/auth/callback` (local)
     - `https://YOUR-APP.vercel.app/api/auth/callback` (production, once deployed)
   - Copy the **Client ID** and **Client secret** into `.env.local` as
     `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Set `GOOGLE_REDIRECT_URI` to the redirect URI for the environment you're running in.
   It must **exactly** match one of the Authorized redirect URIs above.

### Mint the refresh token (run `/api/auth` once)

With the four Google vars set and the dev server running:

1. Visit <http://localhost:3000/api/auth>. You'll be redirected to Google's consent
   screen (`access_type=offline`, `prompt=consent`, scope `gmail.send`).
2. Approve. You'll land on `/api/auth/callback`, which shows your **refresh token** on a
   simple page.
3. Copy it into `.env.local` as `GMAIL_REFRESH_TOKEN`, and restart `npm run dev`.

If Google doesn't return a refresh token (it can omit it if you've authorized before),
revoke ProfPing at <https://myaccount.google.com/permissions> and visit `/api/auth`
again — the app always requests `prompt=consent`, so a fresh token is issued.

You can also do this from the deployed app (visit `https://YOUR-APP.vercel.app/api/auth`)
and paste the token into your Vercel env vars.

---

## Send ONE real test before a batch (confirm the attachment opens)

Do this first, to your own address, so you can confirm the PDF arrives as a normal
attachment:

1. Make sure `ANTHROPIC_API_KEY` and all Gmail vars (incl. `GMAIL_REFRESH_TOKEN`) are
   set, and restart the dev server.
2. **Tab 01 — Source**: paste a CSV with just yourself, e.g.

   ```
   name,email,university,department,area,researchDetail
   Test Me,YOUR_EMAIL@gmail.com,Test University,Finance,Asset Pricing,Works on ML for portfolio risk
   ```

   Click **Parse & add**.
3. **Tab 02 — Review & Hooks**: the row auto-verifies (badge turns green/amber). Click
   **Generate hooks for selected** (or **Generate hook** on the card) so the status pill
   reads **ready**. Edit the hook if you like.
4. **Tab 03 — Compose & Send**:
   - Under **Resume attachment**, click **Choose PDF** and pick a sample resume. A
     green chip shows **Attached: <filename>.pdf**.
   - Check the **Live preview** looks right for your test row.
   - Leave **Throttle** at its default.
   - Click **Send 1 ready email**.
5. Open the email in Gmail and confirm the PDF appears with a **paperclip** and opens as
   a normal downloadable file (not a Drive link, not inline).

Once that looks right, go back to tab 01 and load your real list.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import** the repo (framework auto-detected as Next.js).
3. **Project Settings → Environment Variables** — add every variable you use:
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` → `https://YOUR-APP.vercel.app/api/auth/callback`
   - `GMAIL_REFRESH_TOKEN`, `SENDER_EMAIL`
   - `MAILEROO_API_KEY` (optional), `SCRAPINGBEE_API_KEY` (optional)
4. Add `https://YOUR-APP.vercel.app/api/auth/callback` to the OAuth client's Authorized
   redirect URIs (step 4 above).
5. Deploy. If you minted the refresh token locally with a different redirect URI, that's
   fine — the token isn't tied to the redirect URI; just make sure the production
   `GOOGLE_REDIRECT_URI` matches a registered URI so `/api/auth` works in prod too.

All API routes set `export const maxDuration = 60` for Vercel's serverless timeout.

---

## Email verification & the amber badge

After professors are added they're auto-verified and each card gets a badge:

- 🟢 **valid** — deliverable.
- 🟠 **risky / catch-all** — a caution, **not** a failure. University (.edu) mail
  servers are commonly catch-all and can't confirm a specific mailbox, so amber is
  expected and fine to send to. It never blocks or deselects.
- 🔴 **invalid** — bad syntax or no MX record. This auto-deselects the professor so you
  don't email a dead address.

Without `MAILEROO_API_KEY`, verification uses a local syntax + DNS-MX check only
(no SMTP/catch-all signals), so you'll mostly see green/red.

---

## Project layout

```
app/
  layout.tsx, globals.css         # shell + design tokens
  page.tsx, page.module.css       # the three-tab console (client)
  api/
    scrape/route.ts               # fetch + Claude extraction (no Firecrawl)
    verify/route.ts               # Maileroo or local MX fallback
    generate-hook/route.ts        # one-sentence hook via Claude
    send/route.ts                 # send one email via Gmail API
    auth/route.ts                 # redirect to Google consent
    auth/callback/route.ts        # show refresh token to copy
lib/
  types.ts  template.ts  merge.ts  gmail.ts  scrape.ts  verify.ts
```

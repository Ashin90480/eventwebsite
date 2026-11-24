# EventQR

College event management with QR attendance. Coordinators create events, import registered students from a Google Forms sheet (CSV/Excel), give every student a personal QR code, scan attendance from a phone, and download reports.

**New:** every event also gets a public registration page. Students sign up themselves (no login), get their personal QR ticket by e-mail and on a ticket page, and coordinators can set a seat limit, a waiting list, a deadline, approval and extra questions. See [Online registration](#online-registration--e-mail-tickets).

Stack: React + Vite + Tailwind v4 · Node + Express 5 · MongoDB Atlas (Mongoose) · JWT · `qrcode` · `html5-qrcode` · `xlsx` + `json2csv`.

## Project structure

```
eventqr/
├── backend/
│   ├── src/
│   │   ├── app.js, server.js
│   │   ├── config/        env.js (validation), db.js
│   │   ├── models/        index.js (Coordinator, Event, Student, EventRegistration, Attendance, AuditLog)
│   │   ├── middleware/    auth.js (JWT + event ownership), limiters.js, error.js
│   │   ├── services/      roster.js (one query used by tables, reports, exports), registrations.js (seats, waitlist, approval), mailer.js (QR ticket e-mail), eventView.js
│   │   ├── routes/        auth, events, registrations (+QR, import), attendance, reports, dashboard, public (student form + tickets), qr
│   │   └── utils/         qrToken.js (token crypto), helpers.js
│   ├── scripts/           seed.js (dev only), createCoordinator.js
│   └── tests/             api.test.js (node:test + supertest + mongodb-memory-server)
└── frontend/
    ├── src/
    │   ├── pages/         Login, Dashboard, Events, EventDetail, Students, QRCodes, Scanner, Reports, Settings, Register (public), Ticket (public)
    │   ├── components/    ui.jsx (design system), Layout, EventGate, EventForm, ImportWizard, QrImage, toast
    │   └── api.js, auth.jsx, eventContext.jsx, format.js
    └── vercel.json
```

## Local setup

Prerequisites: Node 20+, a MongoDB Atlas cluster (free tier is fine) or a local MongoDB.

```bash
# Backend
cd backend
cp .env.example .env        # then fill in MONGODB_URI, JWT_SECRET, QR_ENCRYPTION_KEY
npm install
npm run seed                # optional: demo data, clearly labelled [DEMO]
npm run dev                 # http://localhost:5000

# Frontend (second terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:5000
npm install
npm run dev                 # http://localhost:5173
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # QR_ENCRYPTION_KEY
```

Demo login: with `ENABLE_DEMO_LOGIN=true` and `NODE_ENV` not `production`, the login page shows "Use demo account" (demo@eventqr.local, password from `DEMO_PASSWORD`). The `/api/auth/demo-login` route is not registered at all in production.

### Creating the first real coordinator

Nothing is hardcoded. Run this against your production database (with the production `.env`):

```bash
cd backend
npm run create-coordinator -- --name "Dr. A. Rao" --email rao@college.edu
# add  --role admin  for an admin who can see all events
```

The password is typed at a hidden prompt (min. 10 characters), hashed with bcrypt (cost 12) and never written to disk or shell history. Running it again for the same email resets that password.

### Camera / HTTPS

Browsers only allow camera access on `https://` pages (or `localhost`). Vercel and Render both serve HTTPS by default. To test on a phone during development, use a tunnel (e.g. `ngrok http 5173`) rather than your LAN IP.

## Online registration & e-mail tickets

1. Create an event. Its **Online registration** settings (in the event form) control: accepting sign-ups, deadline, seat limit, waiting list, per-registration approval, a message for the ticket e-mail, and up to 10 extra questions (text, long text, choice, checkbox).
2. Open the event page and copy the **registration link** (`/register/<slug>`) or print its QR for a poster.
3. A student fills the form → gets a confirmation, a QR ticket on screen, a ticket link (`/ticket/<code>`) and an e-mail with the QR attached. The ticket page also offers *Add to calendar*, *Save QR image*, the WhatsApp group (confirmed only) and *Cancel my registration*.
4. Coordinators see everything on **Participants**: tabs for Confirmed / Pending / Waitlisted / Rejected / Cancelled, one-click approve and reject, bulk approve, "approve anyway" when full, and re-send ticket.

Rules that are enforced on the server (not just in the UI):

* **Capacity** uses an atomic counter on the event, so concurrent sign-ups can never exceed the seat limit.
* **Waiting list:** when the event is full, new sign-ups queue. A cancelled, rejected or removed participant (or a raised seat limit) promotes the next person automatically and e-mails their ticket.
* **Approval:** with approval on, sign-ups are *Pending* and hold a seat; the QR is only scannable once *Confirmed*. Pending, waitlisted, rejected and cancelled people are rejected at the scanner (`NOT_CONFIRMED`).
* **Deadline / open switch / draft / cancelled / ended** all close the form with a clear message.
* One registration per e-mail per event. The public form has a honeypot field and its own rate limit.
* "Lost your ticket?" always answers the same way, so it cannot be used to find out who is registered.
* Coordinator additions and imports always get a seat (the limit only gates public sign-ups).

**E-mail setup.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (any SMTP provider: Gmail app password, Brevo, SES, Mailgun…) and `PUBLIC_APP_URL` (your Vercel URL, used in the ticket link). Without `SMTP_HOST` nothing is sent, registration still works, and the ticket page shows the QR. E-mail runs in the background; each participant's `emailStatus` (sent / failed / not e-mailed) is visible and can be re-sent.

## Testing

```bash
cd backend && npm test
```

Also covers online registration: public form, duplicate/bad-input/draft handling, honeypot, deadline and open switch, custom-field validation, capacity → waitlist → automatic promotion, capacity under 10 concurrent sign-ups, approval flow with seat limits and override, non-enumerating ticket re-send, and ticket cancel rules.

Starts an in-memory MongoDB and covers: authentication, event create/edit/status/delete, cross-coordinator authorization, import preview + duplicate detection, QR token uniqueness and no-PII, successful scan, duplicate scan, **8 simultaneous scans → exactly one record**, invalid/tampered/wrong-event/revoked/closed QR rejection, manual attendance and corrections with audit log, report counts matching the attendance table, CSV and 5-sheet Excel exports, and duplicate-registration prevention.

`mongodb-memory-server` downloads a MongoDB binary on first run, so it needs internet access.

## Deployment

**Database (MongoDB Atlas):** create a cluster → Database Access: add a user → Network Access: allow Render's outbound IPs (or `0.0.0.0/0` with a strong password) → copy the connection string into `MONGODB_URI`.

**Backend (Render):** New Web Service from the repo, root directory `backend`, build `npm install`, start `npm start`. Environment variables: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `QR_ENCRYPTION_KEY`, `CLIENT_ORIGIN=https://your-app.vercel.app`, `PUBLIC_APP_URL=https://your-app.vercel.app`, `EVENT_TZ_OFFSET`, `EVENT_TIMEZONE`, and the `SMTP_*` / `MAIL_FROM` values for ticket e-mails. Leave `ENABLE_DEMO_LOGIN` unset. Health check path: `/api/health`.

**Frontend (Vercel):** import the repo, root directory `frontend`, framework Vite. Set `VITE_API_URL=https://your-api.onrender.com`. `vercel.json` already rewrites all paths to `index.html`.

Then run `create-coordinator` once against the production database.

**Back up your `QR_ENCRYPTION_KEY`.** If it is lost, existing QR images can no longer be re-rendered (scanning still works, but you would need to regenerate every code).

## API

All routes except `/api/auth/*`, `/api/public/*` and `/api/health` need `Authorization: Bearer <jwt>`. Errors: `{ "error": { "code", "message", "details?" } }`. An event you don't own returns `404`, identical to a missing event.

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` | Email + password → `{token, user}` (rate-limited) |
| `POST /api/auth/logout`, `GET /api/auth/me` | Sign out, current user |
| `GET /api/auth/config` | `{demoLogin}` |
| `GET /api/dashboard` | Totals, upcoming, recent, recent check-ins |
| `GET/POST /api/events` | List (search, status, paging) / create |
| `GET/PUT/DELETE /api/events/:eventId` | Detail / edit / delete (cascades registrations + attendance) |
| `GET /api/events/:eventId/audit` | Last 100 audit entries |
| `GET/POST /api/events/:eventId/registrations` | Roster (search, department, academicYear, status, sort, page) / add participant |
| `GET /api/events/:eventId/registrations/meta` | Distinct departments and years |
| `GET/PUT/DELETE /api/events/:eventId/registrations/:rid` | Detail / edit / remove |
| `POST /api/events/:eventId/import` | `{rows, commit}` — `commit:false` previews, `true` saves valid rows |
| `GET /api/events/:eventId/registrations/:rid/qr` | QR as PNG (`?download=1` to attach) |
| `POST …/registrations/:rid/qr/regenerate` · `…/revoke` | New token (old dies instantly) / revoke |
| `GET /api/events/:eventId/qr-codes` | QR payloads for the grid (paged) |
| `GET /api/events/:eventId/qr-codes.zip` | All active QR PNGs |
| `PUT /api/events/:eventId/attendance/state` | `{open}` open/close scanning |
| `POST /api/events/:eventId/attendance/scan` | `{token}` → `201 success`, `409 ALREADY_PRESENT`, or `400 INVALID_QR` / `409 WRONG_EVENT` / `403 QR_REVOKED` / `403 ATTENDANCE_CLOSED` |
| `POST /api/events/:eventId/attendance/manual` | `{registrationDbId \| registrationId, reason?}` |
| `GET /api/events/:eventId/attendance` · `/summary` | Live table (with check-in, method, marked-by) / counts |
| `PATCH /api/events/:eventId/attendance/:attendanceId` | `{status, reason}` — reason required |
| `PATCH /api/events/:eventId/registrations/:rid/status` | `{status, force?}` approve / reject / waitlist / cancel; seat counter and waitlist stay consistent; `409 EVENT_FULL` unless `force` |
| `POST /api/events/:eventId/registrations/bulk-status` | `{ids, status}` → `{changed, skipped}` |
| `POST /api/events/:eventId/registrations/:rid/resend` | Re-send the QR ticket e-mail |
| `PUT /api/auth/password` | Change own password |
| `GET /api/public/events/:slug` | Public event info + registration state (no private data) |
| `POST /api/public/events/:slug/register` | Student sign-up → `{status: registered\|pending\|waitlisted, ticketCode, …}` (rate-limited) |
| `POST /api/public/events/:slug/resend` | "Lost my ticket" by e-mail (same answer for every address) |
| `GET /api/public/tickets/:code` · `/calendar.ics` · `POST …/cancel` | Ticket page data (unguessable code), calendar file, self-cancel |
| `GET /api/events/:eventId/reports/summary` | Counts + department breakdown (filters supported) |
| `GET /api/events/:eventId/reports/export` | `format=csv\|xlsx`, `type=participants\|attendance\|present\|absent`, plus filters |

## Data model

`Coordinator` · `Event` (+ `attendanceOpen`, `posterUrl`, `slug`, `registrationDeadline`, `seatsTaken`, `registration` settings: open / capacity / waitlist / requireApproval / custom fields) · `Student` (+ `coordinatorId`; unique per coordinator + email, so one person is never duplicated across that coordinator's events) · `EventRegistration` (+ `qrTokenCipher`, `status` registered/pending/waitlisted/rejected/cancelled, `source`, `answers`, `ticketCode`, `emailStatus`) · `Attendance` · `AuditLog` (+ `meta`).

Integrity is enforced by unique indexes, not UI checks: `{eventId, studentId}`, `{eventId, registrationId}`, `{qrTokenHash}` on registrations, and `{eventRegistrationId}` on attendance.

## How QR security works

* Each QR encodes `EVENTQR1:` + 32 random bytes (base64url). No name, email, phone or event ID.
* The database stores only `sha256(token)` for validation, plus an AES-256-GCM encrypted copy so QR images can be re-rendered. A database leak alone does not yield usable tokens.
* Scanning looks up the hash, then checks event match, revoked status and attendance-open state on the server.
* Regenerating replaces the hash, so the old printed code stops working immediately.

## Implemented

Auth (bcrypt, JWT, rate limits, helmet, CORS allow-list) · dashboard · event CRUD with automatic status (Draft/Cancelled respected) · CSV/Excel import with column mapping, preview, inline fixing, skip, duplicate and existing detection · participant CRUD, search, filters, sorting, pagination · QR generation, PNG download, printable A4 cards, ZIP · camera scanner with camera switching, cooldown, manual lookup fallback · attendance table with corrections, reasons and audit log · reports with CSV and 5-sheet Excel (formula-injection safe) · WhatsApp group button and per-student click-to-chat · seed data · tests · **public self-registration with e-mailed QR tickets, ticket page, seat limit, waiting list with auto-promotion, deadline, approval workflow with bulk actions, custom questions, calendar file, self-cancel, resend, registration-link QR for posters, per-hour check-in chart, route-level code splitting and a refreshed UI.**

## Known limitations

* **Google Sheets API / OAuth sync is not built.** The supported route is: download the Google Forms response sheet as CSV/XLSX and import it. Re-importing is safe (already-registered students are skipped, no duplicate QR codes). A direct sync would need a Google Cloud OAuth client, the `spreadsheets.readonly` scope, and a token-storage design; it is the natural next stage.
* **Backend tests have not been executed in the build environment** (it could not download the MongoDB binary). Run `npm test` locally. The frontend production build and a no-database smoke test of the API did pass.
* **No multi-document transactions.** Races are handled with unique indexes and atomic single-document writes; deletes remove children first so a partial failure leaves no orphans. Atlas supports transactions if you want to add them.
* **Poster is a URL, not an upload.** This avoids file-upload attack surface; Import files are parsed in the browser and only validated JSON rows reach the server (2 MB body limit).
* **JWT is kept in `localStorage`** (needed for the cross-domain Vercel + Render split) and logout is client-side. For stricter setups, move to httpOnly cookies on a shared parent domain.
* **`xlsx` (SheetJS) 0.18.5 from npm has known advisories for parsing hostile files.** It is used to parse files the coordinator chooses themselves and to write exports. For untrusted sources, switch to the SheetJS CDN build or `exceljs`.
* `bcryptjs` (pure-JS bcrypt) is used instead of native `bcrypt` to avoid build problems on Render.
* Pages are now lazy-loaded per route; the `xlsx` library is still the largest chunk (used by the import wizard).
* Printable cards are produced by the browser print dialog; the ZIP contains plain QR PNGs, not composed cards.
* The registration deadline now closes the **public** form; coordinators can still add or import participants after it.
* Ticket e-mails are sent in-process in the background (no queue). If the server restarts mid-send, use *Re-send ticket*. The public ticket page is protected only by its unguessable link, so treat ticket links like the QR itself.
* The registration form has no CAPTCHA or e-mail verification, only a honeypot, rate limiting and one-per-e-mail. Turn on *Approve each registration* if you need to vet sign-ups.
* **The frontend build and the new test cases were not run in the authoring environment** (package installs were unavailable). All files pass a syntax check and import/export cross-check; run `npm test` in `backend` and `npm run build` in `frontend` after `npm install`.

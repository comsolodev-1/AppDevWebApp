# Bantay Barangay

A Web-Based Report Monitoring and Compliance System for the DILG Municipal Office of Talisay, Camarines Norte.

Barangays submit their required reports online. The DILG office confirms or denies each report, scores compliance, ranks the 15 barangays, and generates official reports. Team: CTRL ALT WIN.

> **Language change:** the system is now written only in **HTML, CSS, JavaScript and MySQL**. All ASP.NET / VB.NET / .NET code was removed. The look, pages, rules, scoring, security checks and database are unchanged; only the language they are written in changed.

## Tech Stack

| Layer | Technology |
|---|---|
| Pages | HTML (`public/**/*.html`) |
| Design | CSS (`public/Content/site.css`, unchanged) |
| Browser logic | JavaScript (`public/js`) |
| Server logic | JavaScript on Node.js + Express (`server.js`, `server/`) |
| Database | MySQL 8 (`database/schema.sql`, `database/seed.sql`, unchanged) |
| Data access | `mysql2`, prepared (parameterized) queries only |
| Password hashing | BCrypt (`bcryptjs`, reads the existing hashes) |
| PDF reports | PDFKit |
| Sessions | `express-session` (HttpOnly cookie, 20 minute sliding timeout) |

A web page in the browser cannot talk to MySQL directly (it would expose the database password), so a small JavaScript server sits in between. It replaces IIS / ASP.NET and runs on Windows, Linux or any normal Node.js host.

## Project Structure

```
BantayBarangay/
|-- server.js                  Starts the web server, security headers, sessions, page guards
|-- package.json               Dependencies
|-- server/
|   |-- config.js              Database settings, session timeout (was web.config)
|   |-- db.js                  MySQL helper (was Db.vb)
|   |-- auth.js                Login, lockout, roles (was Auth.vb)
|   |-- uploads.js             Upload validation and storage (was Uploads.vb)
|   |-- scoring.js             Score rules and ranking (was Scoring.vb)
|   |-- assignments.js         Activities assigned to a barangay (was Assignments.vb)
|   |-- periodHelper.js        Period names and date ranges (was PeriodHelper.vb)
|   |-- calendarData.js        Calendar events (was CalendarData.vb)
|   |-- reportBuilder.js       The 10 reports (was ReportBuilder.vb)
|   |-- pdfExport.js           PDF output (was PdfExport.vb)
|   |-- ui.js, util.js         Text formatting and helpers (was Ui.vb)
|   `-- routes/                public, account, barangay, super, download (was the .aspx.vb code-behind and Download.aspx)
|-- public/                    Everything the browser loads
|   |-- index.html             Public dashboard (was Default.aspx)
|   |-- login.html, logout.html, error.html
|   |-- Viewer/ Barangay/ Super/   One .html page per old .aspx page
|   |-- Content/               site.css and logos
|   `-- js/
|       |-- common.js          Site/Public layouts (was the master pages), helpers, Rankings / Announcements / Password controls
|       `-- pages/             One script per page
|-- App_Data/uploads/          Uploaded files (never served directly)
`-- database/                  schema.sql, seed.sql
```

## Getting Started

Requirements: Node.js 18 or newer, MySQL 8 (or MariaDB 10.x).

1. Create the database: run `database/schema.sql`, then `database/seed.sql` (drop the `bantay_barangay` database first if you ran an older version).
2. Install the packages: `npm install`
3. Set the database login. Either edit the defaults in `server/config.js` or set environment variables:
   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `SESSION_SECRET` (use a long random text).
4. Start: `npm start`, then open http://localhost:3000 (change the port with `PORT`).

Staff sign in through the "Admin Login" button (`/login.html`).

## Default Accounts

Change these passwords right after the first login (Settings page).

| Role | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `Admin@12345` |
| Barangay Admin | `brgy_poblacion`, `brgy_gabon`, ... (one per barangay) | `Barangay@123` |

## How It Works

Unchanged from the ASP.NET version.

1. The Super Admin creates an activity (title, frequency, deadline, requirements, optional template, Public / Private, assigned barangays). A reporting period is created automatically; recurring activities get new periods with "Add Period".
2. Each assigned Barangay Admin sees it under My Activities and uploads a report file.
3. A submission is marked late automatically if uploaded after the deadline.
4. The Super Admin reviews it: Confirm (on time = 1.0, late = 0.5, with a Good / Needs Improvement / Bad remark) or Deny (reason required, optional attachment; the barangay can resubmit).
5. Rankings add up confirmed scores per barangay (ties share a rank). The 10 PDF reports and the report card use the same data.
6. Activity status is automatic: Active until the deadline, then Closed. Late submissions are accepted until the activity is archived.

## Security

| Risk | How it is handled |
|---|---|
| SQL injection | Every query is a prepared statement (`server/db.js`) |
| Weak passwords | BCrypt, minimum 8 characters with letters and numbers |
| Brute force login | 5 failed attempts lock that username + IP for 15 minutes; honeypot field on login |
| Session theft / idle sessions | HttpOnly cookie, 20 minute sliding timeout, no-store on protected pages |
| CSRF | A per-session token is required on every POST / PUT / DELETE (replaces ViewStateUserKey) |
| Reading another barangay's data | Role check on every protected page and API route; queries and downloads also filter by the user's barangay |
| Malicious uploads | Extension whitelist, 10 MB limit, file signature check, random stored names, kept outside `public/`, served only through `/download` |
| XSS | All output is HTML-escaped (`BB.H`) |
| Clickjacking / sniffing | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` headers |

## Testing

Checked against MariaDB 10.11 with the unchanged `schema.sql` and `seed.sql`:
- 60+ automated API checks: logins, lockout, CSRF, role guards (including a Barangay Admin opening Super pages), upload rejection (fake PDF, `.exe`), cross-barangay download blocked, submit / late / confirm / deny / resubmit, scoring (1.0 on time, 0.5 late), ranking ties, announcement visibility, calendar, accounts, periods, archive-on-delete, and all 10 reports as preview and valid PDF.
- Every HTML page loaded in a simulated browser for all three roles with no script errors.

Run the manual checklist below on your own machine and a real browser before the defense or go-live.

| # | Test | Expected result |
|---|---|---|
| 1 | Open `/` without logging in | Public dashboard, no admin links |
| 2 | Open `/Super/Dashboard.html` while logged out | Redirected to Login |
| 3 | Log in as a Barangay Admin, then open `/Super/Dashboard.html` | Signed out and sent to Login |
| 4 | Wrong password 5 times | Account locked message for 15 minutes |
| 5 | Super Admin creates an activity for 3 barangays | Only those 3 see it |
| 6 | Barangay uploads a PDF before the deadline | Status Pending, not late |
| 7 | Upload a `.exe` renamed to `.pdf` | Rejected |
| 8 | Upload a file over 10 MB | Rejected |
| 9 | Super Admin confirms | Confirmed, 1.0 point, ranking updates |
| 10 | Activity with a past deadline, then submit | Marked Late, 0.5 point when confirmed |
| 11 | Super Admin denies with a reason | Barangay sees the reason and can Resubmit |
| 12 | Barangay removes a Pending submission | Row deleted, file removed, can submit again |
| 13 | Barangay A opens `/download?t=submission&id=` of Barangay B | File not found |
| 14 | Open a private activity template link while logged out | File not found |
| 15 | Generate each of the 10 reports and download the PDF | PDF opens with title, filters and table |
| 16 | Announcement for one barangay | Only that barangay (and Super Admin) sees it |
| 17 | Calendar page, change month | Important dates and public deadlines show on the right days |
| 18 | Change password in Settings, log in again | New password works, old one fails |

## Deployment

Any host that runs Node.js 18+ and offers MySQL (VPS, or Node.js hosting with MySQL).

1. Create the MySQL database and run `database/schema.sql` and `database/seed.sql` (remove the `CREATE DATABASE` and `USE` lines if the host gives you a ready-made database name).
2. Upload the project (without `node_modules`) and run `npm install --omit=dev`.
3. Set the environment variables: `DB_*`, `SESSION_SECRET`, `PORT`. Put the site behind HTTPS and set `REQUIRE_SSL=true` (and `TRUST_PROXY=true` when behind a reverse proxy such as Nginx).
4. Run `npm start` under a process manager (for example PM2 or systemd) so it restarts automatically.
5. Make sure the app can write to `App_Data/uploads`.
6. Sign in as `superadmin`, change the default passwords, then create or reset the barangay accounts under Accounts.
7. Back up the database and `App_Data/uploads` regularly.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Access denied" / cannot connect to MySQL | Check the `DB_*` settings, that MySQL is running, and the user's permissions |
| Upload fails | Give the app write access to `App_Data/uploads` |
| Everyone is signed out quickly | Session timeout is 20 minutes; change `sessionMinutes` in `server/config.js` |
| Signed out after every server restart | Sessions are kept in memory (like the old InProc sessions); this is expected |
| Dates look wrong | Check the server time zone; deadlines use the database clock |

## Known Limitations and Assumptions

- The Super Admin cannot yet edit barangay profile details (captain, secretary, office address).
- Frequencies are Weekly, Monthly, Quarterly, Annual and General.
- Passwords reset by the Super Admin are set directly (no email reset).
- Barangay codes in `seed.sql` (`TAL-01` ...) are placeholders; replace them with the official codes before going live.
- Run the manual checklist in a real browser before go-live.

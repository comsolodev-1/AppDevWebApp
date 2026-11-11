# Bantay Barangay

A Web-Based Report Monitoring and Compliance System for the DILG Municipal Office of Talisay, Camarines Norte.

Barangays submit their required reports online. The DILG office confirms or denies each report, scores compliance, ranks the 15 barangays, and generates official reports. Team: CTRL ALT WIN.

> **Languages:** HTML, CSS, JavaScript and a SQL database only. All ASP.NET / VB.NET / .NET code was removed. The database is now **PostgreSQL** (Neon) and the app is set up to run free on **Vercel**. The pages, design, rules, scoring and security checks are unchanged.

## Tech Stack

| Layer | Technology |
|---|---|
| Pages | HTML (`public/`, `pages/`) |
| Design | CSS (`public/Content/site.css`, unchanged) |
| Browser logic | JavaScript (`public/js`) |
| Server logic | JavaScript, Node.js + Express (`server/`) running as one Vercel serverless function |
| Database | PostgreSQL 14+ (Neon free tier) - `database/schema.sql`, `database/seed.sql` |
| Data access | `pg`, parameterized queries only |
| Password hashing | BCrypt (`bcryptjs`, reads the existing hashes) |
| PDF reports | PDFKit |

A browser page cannot talk to the database directly (that would expose the database password), so a small JavaScript server sits in between. On Vercel it runs as a serverless function.

## Project Structure

```
BantayBarangay/
|-- api/index.js            Vercel entry point (serverless function)
|-- vercel.json             Routes /api, /download, /Super and /Barangay to the function
|-- server.js               Local runner (npm start)
|-- server/
|   |-- app.js              Express app: headers, CSRF, page guards, routes
|   |-- config.js           Settings from environment variables
|   |-- db.js               PostgreSQL helper (was Db.vb)
|   |-- session.js          Signed-cookie session (serverless workaround)
|   |-- auth.js             Login, lockout, roles (was Auth.vb)
|   |-- uploads.js          Upload validation + storage in the database (was Uploads.vb)
|   |-- scoring.js, assignments.js, periodHelper.js, calendarData.js, reportBuilder.js, pdfExport.js, ui.js, util.js
|   `-- routes/             public, account, barangay, super, download
|-- public/                 Public files served directly: index, login, error, Viewer/, Content/, js/
|-- pages/                  Protected pages (Super/, Barangay/) - served only after the role check
`-- database/               schema.sql, seed.sql (PostgreSQL)
```

## Run Locally

Requirements: Node.js 18+ and PostgreSQL 14+.

1. Create an empty database, then run `database/schema.sql` and `database/seed.sql` in it (for example `psql -d bantay_barangay -f database/schema.sql`).
2. `npm install`
3. Set the connection and a secret, then start:
   - Windows PowerShell: `$env:DATABASE_URL="postgres://user:password@localhost:5432/bantay_barangay"; $env:SESSION_SECRET="long-random-text"; npm start`
   - macOS / Linux: `DATABASE_URL=postgres://user:password@localhost:5432/bantay_barangay SESSION_SECRET=long-random-text npm start`
4. Open http://localhost:3000. Staff sign in through "Admin Login".

## Deploy Free: Neon + Vercel

1. **Database (Neon).** Create a free project at neon.tech. Open the SQL Editor, paste and run `database/schema.sql`, then `database/seed.sql`. Copy the connection string (it looks like `postgres://...neon.tech/neondb?sslmode=require`; the pooled one is best).
2. **Code.** Push this folder to a GitHub repository.
3. **Vercel.** Import the repository at vercel.com (Framework Preset: **Other**, no build command). Add two environment variables:
   - `DATABASE_URL` = the Neon connection string
   - `SESSION_SECRET` = a long random text (keep it private; changing it signs everyone out)
4. Deploy, open the URL, and sign in as `superadmin`. **Change the default passwords** under Settings, then create or reset the barangay accounts.

Free-tier notes: Neon's free database has limited storage (uploaded files count toward it) and may take a moment to wake after being idle. Vercel's free Hobby plan is meant for non-commercial use.

## Default Accounts

| Role | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `Admin@12345` |
| Barangay Admin | `brgy_poblacion`, `brgy_gabon`, ... (one per barangay) | `Barangay@123` |

Usernames are not case sensitive.

## How It Works

Unchanged from before.

1. The Super Admin creates an activity (title, frequency, deadline, requirements, optional template, Public / Private, assigned barangays). A reporting period is created automatically; recurring activities get new periods with "Add Period".
2. Each assigned Barangay Admin sees it under My Activities and uploads a report file.
3. A submission is marked late automatically if uploaded after the deadline.
4. The Super Admin reviews it: Confirm (on time = 1.0, late = 0.5, with a Good / Needs Improvement / Bad remark) or Deny (reason required, optional attachment; the barangay can resubmit).
5. Rankings add up confirmed scores per barangay (ties share a rank). The 10 PDF reports and the report card use the same data.
6. Activity status is automatic: Active until the deadline, then Closed. All times use Philippine time (Asia/Manila), whatever the server's time zone.

## Serverless Workarounds (what changed for Vercel)

Vercel runs the app as short-lived functions that share no memory and no disk, so four things work differently. Behaviour for users is the same.

| Before | Now |
|---|---|
| Session kept in server memory | Session kept in a signed, HttpOnly cookie (tamper-proof, 20 minute sliding timeout). Trade-off: after Sign Out or after an account is deactivated, an already-copied cookie stays valid until it expires (max 20 minutes). |
| Login lockout counter in memory | Stored in the `login_attempts` table (5 failures lock a username + IP for 15 minutes) |
| Uploaded files on disk (`App_Data`) | Stored in the `file_store` table; only `/download` can read them, with the same permission checks |
| 10 MB upload limit | **4 MB**, because Vercel limits a request to about 4.5 MB |

## Security

| Risk | How it is handled |
|---|---|
| SQL injection | Every query is parameterized (`server/db.js`) |
| Weak passwords | BCrypt, minimum 8 characters with letters and numbers |
| Brute force login | 5 failed attempts lock the account + IP for 15 minutes; honeypot field on login |
| Forged sessions | Cookie is signed with `SESSION_SECRET`; any change is rejected |
| CSRF | A per-session token is required on every POST / PUT / DELETE |
| Reading another barangay's data | Role check on every protected page and API route; queries and downloads also filter by the user's barangay |
| Malicious uploads | Extension whitelist, 4 MB limit, file signature check, random keys, stored in the database, served only through `/download` |
| XSS | All output is HTML-escaped (`BB.H`) |
| Clickjacking / sniffing | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` headers |
| Secrets | Database password and session secret live only in environment variables |

## Testing

Checked locally against PostgreSQL 16 with the project's `schema.sql` and `seed.sql`:
- 66 automated API checks: logins (case-insensitive), lockout, CSRF, role guards (including a Barangay Admin opening Super pages), upload rejection (fake PDF, `.exe`, 5 MB file), cross-barangay download blocked, submit / late / confirm / deny / resubmit, scoring, ranking ties, announcement visibility, calendar, accounts, periods, archive-on-delete, and all 10 reports as preview and valid PDF.
- A login cookie keeps working after a server restart, and tampered or forged cookies are rejected.
- Every HTML page loaded in a simulated browser for all three roles with no script errors.

**Not yet verified on Vercel itself.** After the first deployment, run the checklist below. If `/Super/...` or `/download` ever shows a 404 or a Vercel error page, check the Functions log and `vercel.json`.

| # | Test | Expected result |
|---|---|---|
| 1 | Open `/` without logging in | Public dashboard, no admin links |
| 2 | Open `/Super/Dashboard.html` while logged out | Redirected to Login |
| 3 | Log in as a Barangay Admin, then open `/Super/Dashboard.html` | Signed out and sent to Login |
| 4 | Wrong password 5 times | Account locked message for 15 minutes |
| 5 | Super Admin creates an activity for 3 barangays | Only those 3 see it |
| 6 | Barangay uploads a PDF before the deadline | Status Pending, not late |
| 7 | Upload a `.exe` renamed to `.pdf` | Rejected |
| 8 | Upload a file over 4 MB | Rejected |
| 9 | Super Admin confirms | Confirmed, 1.0 point, ranking updates |
| 10 | Activity with a past deadline, then submit | Marked Late, 0.5 point when confirmed |
| 11 | Super Admin denies with a reason | Barangay sees the reason and can Resubmit |
| 12 | Barangay removes a Pending submission | Row deleted, can submit again |
| 13 | Barangay A opens `/download?t=submission&id=` of Barangay B | File not found |
| 14 | Generate each of the 10 reports and download the PDF | PDF opens with title, filters and table |
| 15 | Announcement for one barangay | Only that barangay (and Super Admin) sees it |
| 16 | Calendar page, change month | Events show on the right days |
| 17 | Change password in Settings, log in again | New password works, old one fails |

## Troubleshooting

| Problem | Fix |
|---|---|
| Pages work but data/login fails | Check `DATABASE_URL` in Vercel, that `schema.sql` and `seed.sql` were run in Neon, and the function logs |
| Everyone gets signed out | `SESSION_SECRET` changed or the 20 minute timeout passed |
| First request after idle is slow | Neon and Vercel wake up from sleep; normal on free tiers |
| Upload rejected as too large | The limit is 4 MB on Vercel |
| Deadlines off by hours | Times use Asia/Manila; check the deadline date you entered |

## Known Limitations and Assumptions

- The Super Admin cannot yet edit barangay profile details (captain, secretary, office address).
- Frequencies are Weekly, Monthly, Quarterly, Annual and General.
- Passwords reset by the Super Admin are set directly (no email reset).
- Barangay codes in `seed.sql` (`TAL-01` ...) are placeholders; replace them with the official codes before going live.
- Files live in the database, so heavy use can fill the free Neon storage; for lots of files, move them to object storage.

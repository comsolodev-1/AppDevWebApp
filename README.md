# Bantay Barangay

A Web-Based Report Monitoring and Compliance System for the DILG Municipal Office of Talisay, Camarines Norte.

Barangays send in their required reports online. The DILG office confirms or denies each report, gives compliance scores, ranks the 15 barangays, and prints official reports as PDF. Team: CTRL ALT WIN.

**What it is made of:** HTML, CSS and JavaScript for the website, and a PostgreSQL database (Neon). It runs for free on Vercel.

**Contents**
1. [What you need](#1-what-you-need)
2. [Step-by-step setup on Vercel](#2-step-by-step-setup-on-vercel)
3. [Check that everything works](#3-check-that-everything-works)
4. [First things to do after setup](#4-first-things-to-do-after-setup)
5. [Updating the website later](#5-updating-the-website-later)
6. [If something goes wrong](#6-if-something-goes-wrong)
7. [Free plan limits](#7-free-plan-limits-good-to-know)
8. [Default accounts](#8-default-accounts)
9. [How the system works](#9-how-the-system-works)
10. [For developers](#10-for-developers)

---

## 1. What you need

- A computer with internet. No programming tools are needed to put the site online.
- The project folder from the zip file. Unzip it first (right-click the zip, then "Extract All").
- Three free accounts. You can sign up for each with your email or Google account:
  - **GitHub** (github.com) keeps your files.
  - **Neon** (neon.tech) is the database. It stores the barangays, users, reports and uploaded files.
  - **Vercel** (vercel.com) is the web host. It makes your site available on the internet.

Set aside about 30 minutes. The website screens of GitHub, Neon and Vercel change from time to time, so a button may look a little different. Look for the same words.

---

## 2. Step-by-step setup on Vercel

Do the steps in order. Do not skip Step B: the website cannot sign anyone in until the database is filled.

### Step A. Put the files on GitHub

1. Go to **github.com** and sign in.
2. Click the **+** at the top right, then **New repository**.
3. In "Repository name" type `bantay-barangay`.
4. Choose **Private**. (Private means only you can see the files.)
5. Click **Create repository**.
6. On the next page click the link **uploading an existing file**.
7. Open the unzipped project folder on your computer. Go **inside** the folder `BantayBarangay` so you can see the files `package.json`, `vercel.json`, and the folders `api`, `database`, `public` and `server`.
8. Select **everything inside** that folder (Ctrl + A) and drag it into the GitHub page.
   - Important: drag the contents, not the `BantayBarangay` folder itself. When you are done, `package.json` must be visible on the first page of your repository, not inside another folder.
9. Wait until all files finish uploading. Scroll down and click **Commit changes**.
10. Check the repository page. You should see `api`, `database`, `public`, `server`, `package.json` and `vercel.json` listed. Open the `api` folder and check that it holds `[s1].js` and a folder `[s1]`.

If GitHub says there are too many files, upload in two or three rounds (for example the `public` folder first, then the rest). Keep the folder names exactly the same.

### Step B. Create the database on Neon

1. Go to **neon.tech** and sign up or sign in.
2. Click **Create project**. For the name type `bantay-barangay`. Pick the region nearest to you (Singapore is closest to the Philippines). Click **Create**.
3. In the menu on the left, click **SQL Editor**.
4. On your computer open the file `database/schema.sql` with Notepad (right-click, Open with, Notepad). Press **Ctrl + A** to select everything and **Ctrl + C** to copy.
5. Go back to the Neon SQL Editor, click in the big box, press **Ctrl + V** to paste, then click **Run**. Wait for a success message. It should not show any red error.
6. Clear the box (Ctrl + A, then Delete).
7. Now do the same with the file `database/seed.sql`: open it in Notepad, select all, copy, paste into the SQL Editor, click **Run**. This fills the database with the 15 barangays and the starting accounts.
8. To confirm it worked, clear the box, type `SELECT COUNT(*) FROM barangays;` and click **Run**. The answer should be **15**.

**Get your database address (you need it in Step C):**

1. On the Neon project page click the **Connect** button.
2. Make sure the connection type shows the **pooled connection** (a switch or drop-down named "Pooled connection" is on).
3. You will see a long text starting with `postgresql://`. Click **Show password** if it is hidden, then click **Copy**.
4. Paste it into Notepad and keep it for the next step. This text contains your database password, so never post it publicly or send it to anyone.

### Step C. Put the website online with Vercel

1. Go to **vercel.com** and choose **Continue with GitHub**. Allow it to connect to your GitHub account.
2. Click **Add New...**, then **Project**.
3. Find `bantay-barangay` in the list and click **Import**. If you do not see it, click **Adjust GitHub App Permissions** and allow access to this repository.
4. On the "Configure Project" page:
   - **Framework Preset:** choose **Other**.
   - Leave **Build Command**, **Output Directory** and **Install Command** as they are (empty or default). Do not change them.
5. Open the section **Environment Variables**. Add these two, one at a time. Type the name in the first box, the value in the second box, then click **Add**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Paste the long `postgresql://...` text you copied from Neon |
   | `SESSION_SECRET` | A long secret phrase that you make up: at least 40 letters and numbers, with no spaces. Example style: `kD93hs82LqPz71vXbT05mNcA64wRjEy28ZtGu39H`. Do not use this exact example. |

   Write the `SESSION_SECRET` down somewhere safe. If you ever change it, everybody is signed out (nothing is lost).
6. Click **Deploy**. Wait one to two minutes until you see "Congratulations".
7. Click the picture of your site, or the link shown (it looks like `bantay-barangay-xxxx.vercel.app`). Your website is now online. That link is the address to share.

---

## 3. Check that everything works

1. Open your site address followed by `/diagnose.html`, for example `https://bantay-barangay-xxxx.vercel.app/diagnose.html`.
2. Wait a few seconds. You will see a small table. Every row should show **200** in the HTTP column.
   - The row "Database + seed data" should say `"barangays":15`.
3. Go to your site address and click **Admin Login**. Sign in with `superadmin` and `Admin@12345`.
4. After signing in, open `/diagnose.html` again. Now it also tests the admin data. All rows should show **200**.
5. Click through the menu: Dashboard, Activities, Submissions, Reports. On Reports, the "Report" box should list 10 reports.

If a row shows another number such as 404 or 500, go to [section 6](#6-if-something-goes-wrong).

**Tip:** if the first load is slow, wait and try again. The free database goes to sleep when nobody uses it, and the first visit after a break can take 5 to 10 seconds.

---

## 4. First things to do after setup

1. **Change the Super Admin password.** Sign in as `superadmin`, click **Settings** in the left menu, and set a new password (at least 8 characters, with letters and numbers).
2. **Give each barangay its own login.** Every barangay already has an account with the same starting password. Go to **Accounts**, click **Reset Password** on each barangay, and set a different password. Give each barangay its username and new password. Ask them to change it in **Settings**.
3. **Create the first activity.** Go to **Activities**, click **+ New Activity**, fill in the title, how often it repeats, the deadline and the barangays that must report. Click **Save Activity**.
4. **Try it as a barangay.** Open a private (incognito) browser window, sign in as one barangay, open **My Activities** and submit a small PDF. Then go back to the Super Admin window, open **Submissions** and confirm it.
5. **Replace the barangay codes** (`TAL-01`, `TAL-02` and so on) with your official codes before real use if you need to. Ask the developer team for help with this.

---

## 5. Updating the website later

- **To change a file:** open your repository on GitHub, click the file, click the pencil icon, make the change and click **Commit changes**. Vercel notices and puts the new version online by itself in about a minute. You can watch it under **Deployments** in Vercel.
- **To add or replace several files:** on the repository page click **Add file**, then **Upload files**, drag the files in and commit.
- **To change the database address or the secret phrase:** in Vercel open your project, then **Settings**, then **Environment Variables**. Edit the value, save, then go to **Deployments**, open the latest one, click the three dots and choose **Redeploy**.
- **Database changes** (new tables and so on) are done in the Neon **SQL Editor**.

---

## 6. If something goes wrong

Always begin with `/diagnose.html` on your site. If a page cannot load its data, a red message also appears at the top of that page.

| What you see | What to do |
|---|---|
| The diagnostics show `"barangays":0` | The database is empty. Repeat Step B and run `seed.sql` in the Neon SQL Editor. |
| The diagnostics show `"ok":false` | The site cannot reach the database. In Vercel open Settings, Environment Variables and check `DATABASE_URL`: it must be the full text copied from Neon, with nothing missing. Then Redeploy. |
| Rows with several parts in the address (like `/api/super/meta`) show **404 NOT_FOUND** | The `api` folder on GitHub is incomplete. It must contain the file `[s1].js` and the folder `[s1]` with the files inside, exactly as in the zip. Upload them again, then redeploy. Do not keep an old file named `[...path].js`. |
| The first page after a break is slow | Normal on the free plan. Wait a few seconds. |
| "Invalid username or password" | Check the username (it is not case sensitive) and the password (it is case sensitive). After 5 wrong tries the account is locked for 15 minutes. |
| You are signed out often | The system signs you out after 20 minutes without activity. Sign in again. |
| Signed in on one browser but not on another | Sign-in is remembered per browser. Sign in again on the other one. |
| A file will not upload | Files must be PDF, DOC, DOCX, XLS, XLSX, JPG or PNG and no bigger than **4 MB**. |
| Dropdowns or tables are empty | Read the red message at the top of the page and check `/diagnose.html`. |
| The deploy failed in Vercel | Open the failed deployment, click **Build Logs**, and send a screenshot to the developer team. |
| A page shows the wrong dates | Dates and times use Philippine time. Check the deadline date you typed. |

---

## 7. Free plan limits (good to know)

- **Neon (database):** the free plan has limited storage, about half a gigabyte, and it sleeps when not used. Uploaded reports are stored in the database, so many large files will fill it. Delete test submissions and keep files small.
- **Vercel:** the free "Hobby" plan is meant for personal or school projects, not for business use. Check Vercel's current terms before the DILG office uses the site officially. A paid plan or a different host may be needed then.
- **Upload size:** 4 MB per file, because of a Vercel limit.
- **Backups:** the free plan has only a short history. Ask the developer team to export the database now and then (Neon has a backup and export option in the project settings).
- **Shared computers:** always click **Sign Out** when you are done, so the next person cannot use your account.

---

## 8. Default accounts

Change these passwords right after the first sign-in (see section 4).

| Role | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `Admin@12345` |
| Barangay Admin | `brgy_poblacion`, `brgy_gabon` ... (one for each barangay; see the Accounts page) | `Barangay@123` |

---

## 9. How the system works

1. The Super Admin creates an activity: title, how often it repeats (weekly, monthly, quarterly, annual or one-time), deadline, requirements, an optional template file, public or private, and the barangays that must report.
2. Each chosen barangay sees it under **My Activities** and uploads its report file.
3. If a report is uploaded after the deadline, it is marked **Late** automatically.
4. The Super Admin reviews it under **Submissions**:
   - **Confirm** gives **1.0** point (on time) or **0.5** point (late), with a remark: Good, Needs Improvement or Bad.
   - **Deny** needs a reason (a file can be attached). The barangay can then upload a new file.
5. **Rankings** add up the confirmed points for each barangay. Equal points share the same rank.
6. **Reports** has 10 reports that can be previewed and downloaded as PDF, including a report card for each barangay.
7. Activities close by themselves after the deadline. Late reports are still accepted until the activity is archived.

Visitors who are not signed in can see the public dashboard, rankings, announcements, the list of officials and the calendar.

---

## 10. For developers

### Tech stack

| Part | Technology |
|---|---|
| Pages | HTML in `public/` |
| Design | CSS in `public/Content/site.css` |
| Browser logic | JavaScript in `public/js` (one script per page, shared code in `common.js`) |
| Server logic | JavaScript (Node.js + Express) in `server/`, run as Vercel serverless functions |
| Database | PostgreSQL 14+ (Neon): `database/schema.sql`, `database/seed.sql` |
| Data access | `pg`, parameterized queries only |
| Passwords | BCrypt (`bcryptjs`) |
| PDF | PDFKit |

### Project structure

```
BantayBarangay/
|-- api/                    Vercel entry points: [s1].js, [s1]/[s2].js, [s1]/[s2]/[s3].js, [s1]/[s2]/[s3]/[s4].js
|-- vercel.json             Function settings (PDF fonts, time limit)
|-- local.js                Local runner (npm start)
|-- server/
|   |-- app.js              Express app: security headers, housekeeping, routes
|   |-- vercelHandler.js    Rebuilds the original URL from Vercel's s1..s4 parameters
|   |-- config.js           Settings from environment variables
|   |-- db.js               PostgreSQL helper
|   |-- session.js          Signed-token session (no cookies)
|   |-- auth.js             Login, lockout, roles
|   |-- uploads.js          Upload checks + storage in the database
|   |-- scoring.js, assignments.js, periodHelper.js, calendarData.js, reportBuilder.js, pdfExport.js, ui.js, util.js
|   `-- routes/             public, account, barangay, super, download
|-- public/                 Everything the browser loads
|   |-- index.html, login.html, diagnose.html, error.html, logout.html
|   |-- Viewer/ Barangay/ Super/    One page per screen
|   |-- Content/            site.css and logos
|   `-- js/                 common.js (layout, navigation, helpers) and pages/
`-- database/               schema.sql, seed.sql
```

### Run on your own computer

Requirements: Node.js 18+ and PostgreSQL 14+.

1. Create an empty database and run `database/schema.sql`, then `database/seed.sql` in it (for example with `psql`).
2. `npm install`
3. Set the connection and a secret, then start:
   - Windows PowerShell: `$env:DATABASE_URL="postgres://user:password@localhost:5432/bantay_barangay"; $env:SESSION_SECRET="long-random-text"; npm start`
   - macOS / Linux: `DATABASE_URL=postgres://user:password@localhost:5432/bantay_barangay SESSION_SECRET=long-random-text npm start`
4. Open http://localhost:3000.

### Because it runs on Vercel (serverless)

Vercel runs short-lived functions with no shared memory and no disk, so these parts work differently from a normal server:

| Normal server | This version |
|---|---|
| Session in memory or a cookie | **No cookies.** A signed token is kept in the browser (`localStorage`) and sent in the `Authorization` header. Every response refreshes it (20 minute sliding timeout). After sign-out or after an account is deactivated, an already-copied token stays valid until it expires (at most 20 minutes). |
| Login lockout counter in memory | Stored in the `login_attempts` table (5 failures lock a username + IP for 15 minutes). |
| Files on disk | Stored in the `file_store` table and served only through `/api/download` with permission checks. |
| 10 MB uploads | 4 MB, because Vercel limits a request to about 4.5 MB. |
| Server guards the pages | Pages are static files. Each page checks the role when it loads, and the API enforces the role on every request. |
| Every click loads a new page | The sidebar and top bar are built once. Menu clicks swap only the content area, with working Back and Forward. Menu pages are preloaded and lists such as barangays are cached. Anything unexpected falls back to a normal page load. |
| Times in the server's time zone | All times use Philippine time (Asia/Manila). |

### Security

| Risk | How it is handled |
|---|---|
| SQL injection | Every query is parameterized (`server/db.js`) |
| Weak passwords | BCrypt, at least 8 characters with letters and numbers |
| Brute force | 5 failed sign-ins lock the account + IP for 15 minutes; hidden honeypot field on the login form |
| Forged sessions | The token is signed with `SESSION_SECRET`; any change is rejected |
| CSRF | Not applicable: no cookies, and the token is sent only by the page's own script |
| Reading another barangay's data | Role check on every API route; queries and downloads also filter by the user's barangay |
| Bad uploads | File type list, 4 MB limit, file signature check, random keys, stored in the database, served only through `/api/download` |
| XSS | All output is HTML-escaped (`BB.H`), which also protects the token stored in the browser |
| Headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |
| Secrets | Database address and session secret live only in Vercel environment variables |

### Testing done

Checked locally against PostgreSQL with the project's `schema.sql` and `seed.sql`:
- 64 automated API checks: sign-in (not case sensitive), lockout, role guards (including a Barangay Admin trying Super Admin data), upload rejection (fake PDF, `.exe`, 5 MB file), cross-barangay download blocked, submit / late / confirm / deny / resubmit, scoring, ranking ties, announcement visibility, calendar, accounts, periods, archive-on-delete, and all 10 reports as preview and valid PDF.
- The Vercel entry files tested with a simulated Vercel in both ways it can pass the URL, at 1 to 4 segments.
- All 21 pages loaded in a simulated browser for all three roles, plus in-place navigation (menu clicks, Back and Forward, active menu item, page title).
- The login token keeps working after a restart, and altered or forged tokens are rejected.

Run the checks below on the live site after the first deployment.

| # | Test | Expected result |
|---|---|---|
| 1 | Open the site without signing in | Public dashboard, no admin menu |
| 2 | Open `/Super/Dashboard.html` while signed out | Sent to the login page, no data shown |
| 3 | Sign in as a barangay, then open `/Super/Dashboard.html` | Signed out and sent to the login page |
| 4 | Wrong password 5 times | Locked for 15 minutes |
| 5 | Super Admin creates an activity for 3 barangays | Only those 3 see it |
| 6 | Barangay uploads a PDF before the deadline | Status Pending, not late |
| 7 | Upload a `.exe` renamed to `.pdf` | Rejected |
| 8 | Upload a file over 4 MB | Rejected |
| 9 | Super Admin confirms | Confirmed, 1.0 point, ranking updates |
| 10 | Activity with a past deadline, then submit | Marked Late, 0.5 point when confirmed |
| 11 | Super Admin denies with a reason | Barangay sees the reason and can resubmit |
| 12 | Barangay removes a Pending submission | Row removed, can submit again |
| 13 | Barangay A opens a download link of Barangay B | File not found |
| 14 | Generate each of the 10 reports and download the PDF | PDF opens with title, filters and table |
| 15 | Announcement for one barangay | Only that barangay (and Super Admin) sees it |
| 16 | Calendar page, change month | Events appear on the right days |
| 17 | Change password in Settings, sign in again | New password works, old one fails |

### Known limitations and assumptions

- The Super Admin cannot yet edit barangay profile details (captain, secretary, office address).
- Frequencies are Weekly, Monthly, Quarterly, Annual and General.
- Passwords reset by the Super Admin are set directly (no email reset).
- Barangay codes in `seed.sql` (`TAL-01` ...) are placeholders; replace them with the official codes before going live.
- Files live in the database, so heavy use can fill the free Neon storage. For many files, move them to object storage.

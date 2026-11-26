# Romford Office Booking Portal

Hosted production site: **https://romford-office-portal.vercel.app/signin.html** (Vercel project `romford-office-portal`, RMF team). Published directly from the `deploy/` package; GitHub is not linked. Rebuild the package with `python tools/build_hosted.py`. `romford-office-portal.zip` contains the deployable files for a future repository import.

The hosted package excludes the local one-time reset, legacy app, tests, source generators and reference PDF. Fresh hosted storage starts with Shahinsha only. Local file records are not uploaded. Hosting does not add shared storage or server authentication: accounts, passwords, approvals and bookings remain browser-local. Production readiness for multiple staff computers requires a shared backend; the current frontend credentials and permissions are not a security boundary.

Live verification: `python tests/test_hosted.py https://romford-office-portal.vercel.app` passed registration, pending-account blocking, admin approval and repeat login in an isolated browser context. No page errors were observed. The Vercel runtime error scan returned no logs; this is a static site, and no monitoring drains are configured.

Open **signin.html** to sign in. Opening **index.html** without an authorized session also shows sign-in. Keep all HTML, JavaScript and CSS files together. No build step is required.

For a dedicated local web address, double-click **START_ROMFORD.cmd** (requires Python). It opens **http://127.0.0.1:8765/signin.html**. Keep the launcher window open while using the site. This serves files on your computer only; it does not provide shared authentication or a shared database.

When double-clicking an HTML file, `signin.html` uses the sign-in screen at `index.html#signin` so existing records remain at their original file URL. The `file:` location and `http://127.0.0.1:8765` have separate browser storage; records are not automatically moved between them. Continue using the original file location for existing file-based bookings.

`OPEN_ROMFORD_BOOKINGS.html` now opens sign-in too. Its previous source is preserved unchanged in `OPEN_ROMFORD_BOOKINGS.legacy.html`; its old local-storage records have not been deleted. That backup is an obsolete application, not a route into the maintained portal. Restoring the original source at its original URL may be needed to access old file-specific records. The old Python generators write `generated_legacy_basic.html` and `generated_legacy_full.html` and cannot overwrite the maintained portal.

## Registration and login

Choose **Sign in / New user** to register with full name, username, department, password and password confirmation. Admin is not a registration department. Registration creates a pending account; it does not give access to the portal.

Admin reviews **Employee Approvals** and approves or rejects the account once. Approved employees use **Login**, with just their username and password, on future visits. Login has no department selector and requires no repeated approval. Existing staff accounts without a registration status remain approved for compatibility. Administrators can disable an account later using Users & Access Matrix.

The administrator logs in directly as `shahinsha` with password `shahinsha@123`. The original default `admin` account is migrated once to this identity. Subsequent administrator password changes are preserved.

This remains a browser-local implementation: admin and employee tabs need the same site address and browser profile. Different computers require a shared backend.

## Administration

1. Open **Login** and enter the administrator username and password.
2. Open **Users & Access Matrix**.
3. Set department permissions for Sales, Operations & Costing, and Accounts & Management, then click **Save Department Permissions**.
4. Use **Add User** or **Edit** to manage names, departments, passwords, account status, and individual permission overrides.

On a fresh browser database, the default administrator is `shahinsha` / `shahinsha@123`. Previously changed credentials remain unchanged. Admin sign-in does not need another administrator's approval.

An individual Allow/Deny overrides the department setting. Admin accounts always have full access. The current administrator cannot disable or demote their own account. New/reset passwords must contain at least eight characters; existing passwords remain compatible.

Booking ownership, drafts, editing, submitted prices, supplier costs, ticketing, receipts, verification, approvals, payouts, invoices, directories, history, printing and exports are checked independently. Financial reports require the related cost/supplier visibility permissions, as explained beside the matrix. Bookings and exports use the same ownership scope. Disabled staff cannot sign in or continue actions in an existing session.

The existing browser database and user-account storage keys are retained. Old sales rules migrate into the department matrix. Legacy booking ownership continues to work; new bookings also store a stable username.

## Flight documents

Group-ticket imports no longer stop at nine passengers. All detected names are displayed and saved; importing into an existing form adds missing names while preserving manual entries. Reimporting the same list does not repeatedly append it. Unrecognised document layouts still need review.

Admin can use **Users & Access Matrix → Reset All Data (Keep Shahinsha)** to delete the maintained portal's bookings, receipts, suppliers, logs, department policies, approval records, and all other user accounts. The Shahinsha account and its current password are preserved. Reset signs out existing sessions. This affects only the current site's browser storage; it does not delete project files or data stored at other addresses/profiles.

Upload a text-based e-ticket PDF or TXT file from a flight booking. Confidently identified names, routes, travel dates, airline, PNR, ticket numbers, mobile and INR client totals fill empty fields. Review the result, then save. The import does not save records automatically or replace manual passenger entries.

Issue dates and dates of birth are not used as travel dates. Net fares, balances and foreign-currency totals are not copied into the INR client price. Invalid dates and ambiguous matches remain blank. PDF text is grouped by its position on the page before parsing. Files are limited to 20 MB and PDFs to 20 pages; scanned documents need OCR outside this app. Arbitrary airline layouts may still require manual entry.

Airport suggestions support mouse selection, Arrow Up/Down, Enter and Escape. Flight supplier/portal and net fare fields now persist. Paid supplier costs are locked; changing an unpaid cost resets its approval.

## Verification

Run `python tests/test_app.py` and `python tests/test_signin.py` with Python Playwright and its Chromium browser installed.

The isolated browser regression test covers:

- Required department selection, blank credentials, logout and disabled accounts.
- Dedicated HTTP sign-in, two-tab admin approval/rejection/revocation, request expiry, credential/department matching, account-change invalidation, dashboard URL gating and the old launch filename.
- Admin staff creation, department permissions and individual overrides.
- Booking ownership, denied actions, protected price fields and scoped exports.
- Flight TXT upload through the UI, passenger preservation, price decimals, flight cost and receipt persistence.
- Operations approval, accounts verification, payout dates and invoice saving.
- Parser false positives, calendar validation, return routes and currency handling.
- PDF text-item row reconstruction using a mocked PDF.js document (not a real airline-PDF integration test).
- Airport keyboard selection, unique IDs after numbering gaps, discarding edits, stale-form protection, reload persistence and rendering assigned pages.

Screenshots are written to `test-results/`. Test data stays inside a temporary browser context and does not modify your existing browser records. The core test blocks external CDN requests; real PDF loading and Excel/PDF downloads still depend on the existing CDN libraries and require a connection.

## Deployment boundary

This is a browser-local application, not a shared multi-user server. Accounts, passwords, approval requests and business data remain in local storage, and application permission checks can be bypassed by someone controlling that browser or its files. Tabs in the same browser origin/profile can share changes; separate computers do not share records automatically. Approved sessions survive reloads in the same tab until expiry or logout. Signing out requires a fresh login, but approval remains on the employee account.

For production access across staff computers, add server-side authentication, password hashing, authorization for every data operation, a shared database and backups. The current matrix provides the application workflow and policy structure for that integration; it is not a server security boundary.

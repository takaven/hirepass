# HirePass Deployment And Handover Runbook

This runbook covers a normal HirePass customer installation. It is intentionally bounded: no generic ATS rollout, no HRIS implementation, no invented SLA and no new product scope. `README.md` is the canonical product definition; this runbook governs production installation and handover.

## Product Boundary

HirePass is a focused, flexible hiring portal and candidate database with Candidate Pass, Manager/Hiring Stakeholder Pass and Internal Pass Control. It helps candidates and internal hiring users see what happened, who owns the next action, what happens next and the expected movement. Internal users need not belong to an HR department.

Do not sell it as sourcing, job-board distribution, recruitment CRM, generic ATS, HRIS, payroll, employee onboarding or background-check software.

## Infrastructure

A normal customer installation requires:

- application hosting capable of running the built Node/Vite app;
- PostgreSQL database;
- persistent filesystem or mounted storage directory for candidate documents;
- HTTPS and the customer's chosen domain or subdomain;
- an agreed backup owner for the database and upload storage.

Customer infrastructure should be customer-paid and customer-controlled where practical.

## Configuration

Required production variables:

- `NODE_ENV=production`
- `DATABASE_URL`
- `HIREPASS_ADMIN_USERNAME`
- `HIREPASS_ADMIN_PASSWORD_HASH`
- `HIREPASS_SESSION_SECRET`
- `HIREPASS_UPLOAD_DIR`

Production also uses the PostgreSQL-backed `rate_limit_counters` table. `HIREPASS_RATE_LIMIT_SECRET` may supply a separate 32+ character HMAC secret; otherwise the session secret is used. Set `HIREPASS_TRUST_PROXY_HOPS` only to the exact number of trusted proxies in front of HirePass. A wrong value permits client-IP spoofing or incorrectly groups users.

Optional:

- `HIREPASS_PASS_ID_PREFIX`, defaulting to `HP`.

Do not use `HIREPASS_ADMIN_PASSWORD` in production. It is available for local or disposable development only.

Legacy `/api/ai/*` routes and onboarding-token routes are disabled in production and are not part of the current production offer. The supported AI-assisted review launch surface uses `/api/intelligence/*`, requires explicit `HIREPASS_AI_ENABLED=true`, `ANTHROPIC_API_KEY`, provider/privacy approval and release verification. Core HirePass must continue operating when AI is disabled or unavailable.

## Database

Apply the committed schema before handover:

```bash
npm run db:push
```

Use a new customer database. Do not point a customer installation at demo, founder-review or disposable verification data.

## Storage

Create the upload directory before starting production:

```bash
mkdir -p "$HIREPASS_UPLOAD_DIR"
```

The directory must be readable and writable by the application process, must not be served as a public/static directory, and must be included in the agreed backup responsibility. CV intake is PDF-only for the controlled launch. HirePass validates the signature and basic PDF structure, rejects active/embedded-content markers, generates storage names and forces authenticated downloads with `nosniff`, sandbox and no-store headers. DOC/DOCX are deliberately unsupported; adding DOCX requires bounded ZIP structure and decompression-limit validation.

Files remain untrusted even after validation. HirePass does not execute or inline-preview them. A full antivirus service is not required for the controlled first release because files are PDF-only, non-public and forced to download; endpoint/device protection remains an operational requirement for authorised reviewers. Reassess malware scanning before broader unsupervised internet intake or inline preview support.

## Admin Bootstrap

Configure the first internal hiring-administrator identity through `HIREPASS_ADMIN_USERNAME` and `HIREPASS_ADMIN_PASSWORD_HASH`.

After deployment, sign in through the internal admin login and verify Internal Pass Control (currently labelled HR Pass Control) is available.

The current production model provides one configured `owner_admin` identity. Use it only for a controlled deployment with one accountable operator. Do not share the credential among multiple people; implement individual accounts before the customer requires independent access or user-level accountability.

Do not leave temporary/plaintext bootstrap credentials in shared notes, repository files or deployment logs.

## Standard Workflow Setup

For a standard setup, agree the starting hiring workflow and configure only the fields needed for:

- hiring positions/passes;
- candidate records;
- internal hiring-stakeholder assignments;
- Candidate Pass issue/expiry expectations;
- Manager/Hiring Stakeholder Pass issue/expiry expectations;
- interview slots where used;
- document requests where used;
- assessment or offer steps where used.

Complex workflow tailoring, candidate/data migration, integrations, custom reporting or product changes are separately scoped work.

Do not represent arbitrary workflow design, reminder rules, recruiting assistant chat or multiple named internal accounts as configuration that exists. Bounded stages, general CV submission, transactional email outbox, evidence-backed AI review, Candidate Library matching and comparison from existing AI evidence are current capabilities; confirm the exact release behavior against the current source.

## AI-Assisted Review

Leave AI disabled unless the customer has approved provider use, privacy wording and operational handling for candidate CV processing.

Required variables when enabling the add-on:

- `HIREPASS_AI_ENABLED=true`
- `ANTHROPIC_API_KEY`
- `HIREPASS_AI_MODEL`, default `claude-sonnet-5`
- `HIREPASS_AI_MAX_BATCH`, default `25`
- `HIREPASS_AI_TIMEOUT_MS`, default `30000`

AI review operates only after human-confirmed criteria exist for the exact vacancy or vacancy position. Public intake discloses AI-assisted review when `HIREPASS_AI_ENABLED=true`. New vacancy applications are queued after submission commits; AI failure must not block public submission or the hiring workflow.

Before real candidate data is reviewed by AI, run a fictional-data AI smoke test covering:

- manual criteria confirmation;
- optional provider-generated criteria suggestion where configured;
- successful PDF extraction;
- queued application review;
- source-linked evidence in the review output;
- provider failure/timeout handling;
- continued manual review when AI is unavailable.

Do not use AI output as an automatic reject/select decision. Hiring decisions remain human-owned.

## Transactional Email

Transactional email is a launch capability for meaningful human updates only: application/CV receipt, Candidate Pass issue/reissue and Stakeholder Pass issue/reissue. Configure it at deployment level with `HIREPASS_EMAIL_ENABLED=true`, `HIREPASS_EMAIL_FROM`, `HIREPASS_SMTP_HOST`, `HIREPASS_SMTP_PORT`, optional `HIREPASS_SMTP_SECURE`, `HIREPASS_SMTP_USER` and `HIREPASS_SMTP_PASSWORD`. Delivery uses a small database outbox with bounded retry. Email failure must not roll back hiring workflow changes.

## Mandatory Pre-Data Security And Privacy Gate

Do not admit real candidate or employer data until all applicable items below are closed and recorded:

- **Pass-token log safety:** Candidate and Manager Pass bearer-token segments must resolve to safe route templates in application logs. Run the regression suite and ensure infrastructure/access logs also redact these URL segments.
- **Credential and abuse protection:** use a production password hash, strong session secret and HTTPS. HirePass applies PostgreSQL-backed limits to login, public submission/upload and external Pass mutations before request-body parsing; readiness fails if the counter table is absent. Configure and verify the exact trusted-proxy hop count.
- **Candidate privacy:** record the lawful basis and candidate notice for vacancy applications and any general talent-pool submission.
- **Public intake configuration:** set `HIREPASS_COMPANY_NAME`, `HIREPASS_PRIVACY_NOTICE_URL` and `HIREPASS_PRIVACY_NOTICE_VERSION`. Optionally set `HIREPASS_COMPANY_LOCATION` and `HIREPASS_CAREERS_CONTACT_EMAIL` for public display. Publish `/talent-pool` for general submissions and `/apply/<numeric vacancy id>` for a direct vacancy application.
- **Retention and deletion:** name the responsible owner and define retention duration, export/access procedure and backup expiry. Talent-pool removal does not erase a candidate. Candidate privacy erasure removes files and direct messages, revokes Candidate Passes, sanitises candidate-linked notifications, clears candidate PII/free text and preserves non-identifying workflow/audit integrity. Application hard-deletion is disabled for launch: use workflow status to withdraw/archive an application, never as a privacy-erasure shortcut.
- **External link operation:** define finite expiry defaults, secure delivery, revocation and reissue handling for bearer links.
- **Data minimisation:** request only documents and candidate attributes required for the hiring process.

## Demo And Production Separation

Use only fictional data for demos and smoke verification. The included seed path creates fictional HirePass demo data.

Do not mix demo candidates, managers or links into a customer production database.

## Smoke Verification

Before handover, verify:

```bash
npm run check
npm test
npm run build
```

Then in the deployed environment verify:

- internal hiring-administrator login works;
- readiness/liveness routes respond as expected;
- a hiring pass can be viewed internally;
- Manager/Hiring Stakeholder Pass can be issued and opened with scoped data;
- Candidate Pass can be issued and opened with scoped data;
- candidate document upload accepts supported files and rejects unsupported files;
- pass revocation/expiry blocks access;
- no Candidate or Manager Pass token appears in application, proxy, access, analytics or error logs;
- interview availability creates the expected candidate-selectable slots if that workflow is enabled;
- evaluation records contain only values actually supplied by the evaluator;
- Settings shows deployment identity as read-only and does not advertise email, reminder, automated retention or bulk-export controls;
- logout works.

## Handover

Provide the customer:

- application URL;
- first internal hiring-administrator access details through a secure channel;
- infrastructure owner and backup responsibility;
- database/storage location summary without secrets;
- brief operating walkthrough for Internal Pass Control, Candidate Pass and Manager/Hiring Stakeholder Pass;
- support/change-request boundary.

## Rollback And Recovery Basics

Before production data import, take a database backup and confirm how uploaded documents are backed up.

If a deployment fails before handover, return to the previous known-good application build and restore the latest valid database/upload backup if data was changed.

Do not manually patch production data unless a specific recovery decision is made and recorded.

## Post-Handover Responsibilities

Core software is a one-off purchase. Included setup, handover and correction of defects within agreed delivery scope are part of the delivery.

After handover, support, maintenance, workflow changes, integrations, custom reports and substantial data work are optional and quoted separately. No monthly software subscription or mandatory maintenance package is approved.

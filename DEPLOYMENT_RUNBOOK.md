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

Optional:

- `HIREPASS_PASS_ID_PREFIX`, defaulting to `HP`.

Do not use `HIREPASS_ADMIN_PASSWORD` in production. It is available for local or disposable development only.

Legacy AI and onboarding-token routes are disabled in production and are not part of the current production offer. The intended AI-assisted CV review add-on requires separate production implementation, human-decision safeguards and release verification; setting `ANTHROPIC_API_KEY` does not make legacy routes a supported production capability.

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

The directory must be readable and writable by the application process and included in the agreed backup responsibility.

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

Do not represent fixed pipeline stages, general CV submission, production AI review, outbound email/reminders or multiple named internal accounts as configuration that already exists. Confirm the exact release capability against the current source.

## Mandatory Pre-Data Security And Privacy Gate

Do not admit real candidate or employer data until all applicable items below are closed and recorded:

- **Pass-token log redaction:** Candidate and Manager Pass tokens are bearer credentials embedded in API paths. The current global request logger records `req.path` and therefore exposes those tokens. Deploy only a release that redacts token segments or logs safe route templates, with a regression test proving token values are absent from log output.
- **Credential and abuse protection:** use a production password hash, strong session secret, HTTPS and login/request throttling at the application or trusted edge.
- **Candidate privacy:** record the lawful basis and candidate notice for vacancy applications and any general talent-pool submission.
- **Retention and deletion:** name the responsible owner and define retention duration, deletion/export procedure and how deletion propagates to backups.
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

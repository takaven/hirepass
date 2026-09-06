# HirePass Deployment And Handover Runbook

This runbook covers a normal HirePass customer installation. It is intentionally bounded: no generic ATS rollout, no HRIS implementation, no invented SLA and no new product scope.

## Product Boundary

HirePass is sold as a focused hiring workflow around Candidate Pass, Manager Pass and HR Pass Control. It helps candidates, hiring managers and HR see what happened, who owns the next action, what happens next and the expected movement.

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

Legacy AI and onboarding-token routes are disabled in production and are not part of the HirePass V1 offer.

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

Configure the first HR/admin identity through `HIREPASS_ADMIN_USERNAME` and `HIREPASS_ADMIN_PASSWORD_HASH`.

After deployment, sign in through the internal admin login and verify HR Pass Control is available.

Do not leave temporary/plaintext bootstrap credentials in shared notes, repository files or deployment logs.

## Standard Workflow Setup

For a standard setup, agree the starting hiring workflow and configure only the fields needed for:

- hiring positions/passes;
- candidate records;
- manager assignments;
- Candidate Pass issue/expiry expectations;
- Manager Pass issue/expiry expectations;
- interview slots where used;
- document requests where used;
- assessment or offer steps where used.

Complex workflow tailoring, candidate/data migration, integrations, custom reporting or product changes are separately scoped work.

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

- internal HR/admin login works;
- readiness/liveness routes respond as expected;
- a hiring pass can be viewed internally;
- Manager Pass can be issued and opened with scoped data;
- Candidate Pass can be issued and opened with scoped data;
- candidate document upload accepts supported files and rejects unsupported files;
- pass revocation/expiry blocks access;
- logout works.

## Handover

Provide the customer:

- application URL;
- first HR/admin access details through a secure channel;
- infrastructure owner and backup responsibility;
- database/storage location summary without secrets;
- brief operating walkthrough for HR Pass Control, Candidate Pass and Manager Pass;
- support/change-request boundary.

## Rollback And Recovery Basics

Before production data import, take a database backup and confirm how uploaded documents are backed up.

If a deployment fails before handover, return to the previous known-good application build and restore the latest valid database/upload backup if data was changed.

Do not manually patch production data unless a specific recovery decision is made and recorded.

## Post-Handover Responsibilities

Core software is a one-off purchase. Included setup, handover and correction of defects within agreed delivery scope are part of the delivery.

After handover, support, maintenance, workflow changes, integrations, custom reports and substantial data work are optional and quoted separately. No monthly software subscription or mandatory maintenance package is approved.

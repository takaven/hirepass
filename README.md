# HirePass

HirePass is a focused hiring workflow product centred on Candidate Pass, Manager Pass and HR Pass Control. It shows what happened, who owns the next action, what happens next and the expected movement through a hiring process.

The current source baseline is complete for commercial launch preparation. Production release and customer deployment remain separate founder-controlled actions.

## Product Boundary

HirePass supports:

- Candidate Pass for secure candidate-facing status, actions, messages, documents, interviews, assessments and offers.
- Manager Pass for scoped hiring-manager decisions and evidence.
- HR Pass Control for issuing, extending, revoking and monitoring Pass links.
- Clear ownership and handoff states across Candidate, Hiring Manager and HR.
- Customer-specific deployment with customer-controlled infrastructure where practical.

HirePass is not a generic ATS, sourcing platform, job-board distributor, recruitment CRM, HRIS, payroll system or employee onboarding product.

Legacy AI and onboarding-token routes are disabled in production and must not be sold as HirePass V1 capabilities.

## Commercial Model

The approved Takaven offer is `HirePass + Setup` at `US$3,450` one-off.

Customer infrastructure is customer-paid and preferably customer-controlled. Post-handover support, workflow changes, integrations, reporting changes and other custom work are optional and quoted separately. No monthly software subscription, mandatory maintenance or annual software licence is approved.

## Local Development

Install dependencies:

```bash
npm ci
```

Copy `.env.example` to `.env` for local or disposable development and fill only non-production values.

Run locally:

```bash
npm run dev
```

Seeded development/demo data is fictional and must not be mixed with customer production data.

## Required Configuration

Core environment variables:

- `DATABASE_URL`
- `HIREPASS_ADMIN_USERNAME`
- `HIREPASS_SESSION_SECRET`
- `HIREPASS_UPLOAD_DIR`

Authentication:

- Production requires `HIREPASS_ADMIN_PASSWORD_HASH`.
- Local or disposable development may use `HIREPASS_ADMIN_PASSWORD` or `HIREPASS_ADMIN_PASSWORD_HASH`.
- `HIREPASS_SESSION_SECRET` must be a strong value of at least 32 characters.

Optional:

- `HIREPASS_PASS_ID_PREFIX`, defaulting to `HP`.
- `ANTHROPIC_API_KEY` only if legacy AI code is deliberately exercised outside production. It is not part of the HirePass V1 production offer.

## Production Deployment Notes

A customer deployment requires:

- a production PostgreSQL database;
- schema application with `npm run db:push`;
- a strong session secret;
- a production admin username and password hash;
- persistent upload storage via `HIREPASS_UPLOAD_DIR`;
- HTTPS/domain/runtime configuration;
- backup responsibility agreed with the customer or infrastructure owner;
- final production smoke verification using fictional data before real candidate or employer data is entered.

Production mode does not provide safe fallback storage if required production configuration is absent.

## Verification

Before a customer deployment decision, run:

```bash
npm run check
npm test
npm run build
```

The GitHub `HirePass Foundation Validation` workflow runs the accepted source validation path.

## Deployment And Handover

Use `DEPLOYMENT_RUNBOOK.md` for customer installation, smoke verification, credential handover, backup responsibility and post-handover support boundaries.

## Handover

A normal handover should include:

- the deployed customer URL;
- first HR/admin account details;
- production environment and storage notes;
- backup and support boundaries;
- a walkthrough of Candidate Pass, Manager Pass and HR Pass Control;
- confirmation that optional post-delivery support and custom work are quoted separately.

# HirePass

HirePass is a flexible company hiring portal and persistent candidate database with an out-of-the-box Pass system that keeps candidates and hiring stakeholders clear on what they need to do next.

> Candidates -> Vacancies -> Applications -> AI-assisted review -> Hiring workflow -> Passes

The underlying system manages candidate records, vacancies, applications, interviews and decisions. The Pass system is HirePass's principal differentiator: each participant gets a secure, focused view of the evidence and action relevant to them, while internal users retain control.

HirePass is substantially built. The launch principle is **reuse first, correct second, and build only what is genuinely missing**. This target definition does not authorise a rewrite or parallel architecture.

## Purpose And Buyers

HirePass is for organisations that need a clear hiring process without a large enterprise applicant-tracking suite. The buyer or owner may be a People/HR lead, founder, operations lead, hiring administrator or department manager.

HirePass must not assume that every customer has an HR department. Its generic responsibility model is:

> Internal Hiring Users <-> Candidates

An internal user may act as Hiring Administrator, Hiring Manager, Reviewer, Interviewer or Approver, and one person may hold several responsibilities. Permissions should remain bounded and understandable rather than becoming an enterprise policy engine.

The current interface and code use `Manager Pass` and `HR Pass Control`. Until labels change, interpret them by responsibility:

- **Manager Pass** means a scoped Hiring Stakeholder Pass; the user need not have the job title “manager”.
- **HR Pass Control** means Internal Pass Control; the administrator need not belong to HR.

## Core Hiring System

### Candidate Database And Talent Pool

Each customer deployment maintains a persistent candidate database. A candidate record can contain contact details, CV information, skills, experience, current role/company, location, availability-related information, source, talent-pool state, tags and notes.

Candidates can enter through two bounded routes:

1. **General CV submission:** a public “Submit your CV”, “Join our talent pool” or speculative-application link that does not require an active vacancy. This is part of the intended target and is not complete in the current production product.
2. **Vacancy application:** a public link for a specific HirePass vacancy. The company may publish it on its website, social media, LinkedIn, email or an external advertisement. HirePass is the application destination, not the advertising marketplace.

A vacancy applicant becomes both an application for that vacancy and a member of the central candidate database. Existing candidates should be reused rather than duplicated, with previous applications and outcomes available to authorised users.

The Candidate Library is limited to retained profiles, CVs, searchable evidence, application history, outcomes, compact talent-pool tagging, useful availability state and reuse in a future vacancy. It does not include prospecting, campaigns, automated nurture or recruiter relationship management.

Retention is not “forever by default” as a product rule. Records may remain until specifically deleted only within the customer's documented lawful basis, notice, retention period, deletion process and backup policy. Those controls must be established before real candidate data is admitted.

### Vacancies And Applications

Internal users can create vacancies containing job title, department/business area, location, employment type, openings, job description, responsibilities, qualifications, skills, experience, salary information where applicable, responsible stakeholder, interview process and target hire date.

HirePass provides a public application destination for an open vacancy. It does not distribute jobs, sell advertising or operate a job-board marketplace.

The current implementation calls a hiring request a **Pass** and can hold multiple position records under it. Reuse this model. Product language may present the record as a vacancy or hiring request while retaining the underlying structure to avoid unnecessary migration.

### Hiring Lifecycle

A sensible default lifecycle is:

> Applied -> Review -> Shortlisted -> Interview -> Offer/Selected -> Hired

with outcomes such as:

> Rejected / Talent Pool

Customers need controlled variation. Launch configurability should use a small ordered set of supported stages, optional stage activation and clear ownership. HirePass should not implement arbitrary workflow graphs, customer-authored automation code or an unrestricted workflow builder.

The current pipeline is fixed. Bounded stage configuration is an intended improvement, not an existing capability.

### AI-Assisted CV Review

AI-assisted CV review is an optional HirePass capability for vacancy-linked applications. It should reduce repetitive review work and help a human prioritise candidates.

The launch-safe output should favour explainable evidence over a falsely precise universal ranking. It may include:

- required criteria matched and missing;
- relevant experience, skills and qualifications;
- strengths and material gaps;
- evidence linked to the CV and vacancy criteria;
- a coarse match band or score only when its meaning is defined and visible.

AI is decision support. It must not automatically reject, select or silently disadvantage a candidate. An authorised person remains accountable for shortlist, rejection and selection. The system should preserve vacancy criteria, analysis, model/configuration provenance where practical, and the human decision needed for audit.

The repository contains legacy AI routes and scoring fields, but those routes are disabled in production. AI-assisted CV review is therefore an intended add-on requiring production implementation and governance; it is not a current production capability.

### Interviews And Decisions

Authorised users should be able to review applicants, shortlist or reject them, move them through allowed stages, schedule interviews, assign interviewers, communicate details, capture feedback, record evaluations, make decisions, retain appropriate candidates in the talent pool and progress successful candidates toward offer/hire.

Scheduling should support dates, times, duration, format, location/meeting link, interviewer assignment, candidate confirmation and bounded rescheduling. Candidate-selectable slots are useful where enabled. Calendar integration, conflict optimisation and complex automation are deferred until demand justifies them.

The existing data model and server routes support interviews, slots, booking, rounds, panel records, evaluation and decisions. The Manager Pass does not collect the dates/slots accepted by its endpoint, direct interview creation does not reliably persist interviewer assignment, and its evaluation UI submits fixed category scores. Correct these paths instead of creating a second subsystem.

## Pass Coordination Layer

### Candidate Pass

Candidate Pass is a secure candidate-facing experience showing relevant application/vacancy information, current status, current action, waiting owner, expected next step, interviews, document requests, assessments, messages and offer/decision actions. Its purpose is to reduce uncertainty and recruitment silence.

### Hiring Stakeholder Pass

The currently named Manager Pass is a secure, scoped view for an internal stakeholder. Depending on responsibility, it can show the vacancy/requisition, candidates requiring attention, relevant CV evidence, decisions, interviews, evaluations, current action and next owner. It must expose only information needed for that responsibility.

### Internal Pass Control

The currently named HR Pass Control gives the hiring administrator visibility over vacancies, candidates, applications, Pass links, next owner, outstanding actions, stalled items, expiry/revocation, interview progress and decisions.

Candidate and Hiring Stakeholder Pass links are bearer credentials. They require finite expiry, revocation, safe reissue, scoped payloads and handling that never exposes tokens through analytics, telemetry or request logs.

## Current Implementation Status

| Capability | Current status | Launch interpretation |
| --- | --- | --- |
| Candidate records and profiles | Exists | Reuse current model and CRUD experience. |
| Vacancy-linked applications | Exists | Reuse public application and Pass relationships. |
| Candidate reuse across vacancies | Exists | Improve discoverability/history after real usage. |
| Candidate search and talent-pool data | Partial | Tags, outcome/history, availability and CV retrieval need bounded UX work. |
| General CV submission without vacancy | Missing | Build a small intake path into the existing candidate model. |
| Vacancy records and multiple positions | Exists | Preserve current Pass/position structures. |
| Public vacancy application URL | Exists | Preserve; clarify operational link handling. |
| Flexible hiring stages | Partial | Current stages are fixed; add bounded configuration only. |
| Candidate Pass | Exists | Preserve; correct security/incomplete action flows. |
| Manager/Hiring Stakeholder Pass | Exists | Preserve scoped access and use responsibility-neutral documentation. |
| Internal/HR Pass Control | Exists | Preserve; administrator need not belong to HR. |
| Pass issue, expiry, revoke, extend, reissue | Exists | Preserve and regression-test. |
| Messages and documents | Partial | In-product flows exist; outbound delivery and some review/configuration do not. |
| Interviews and decisions | Partial | Correct availability, assignment, rescheduling and fixed evaluation inputs. |
| Assessments and offers | Partial | Data/routes exist; production workflows are not uniformly complete. |
| AI-assisted CV review | Missing in production | Implement as optional, human-controlled, evidence-based add-on. |
| Multiple internal responsibilities | Partial | Production auth has one `owner_admin`; managers use scoped Pass links. Extend minimally. |
| Branding/company configuration | Partial | Settings storage exists; visible UI is not wired consistently. |
| Notifications | Partial | In-app records exist; email, reminders and recipient mapping are incomplete. |
| Privacy and retention enforcement | Missing | Policy is required before real data; automate only what operation cannot safely handle. |

## Launch Gates And Known Corrections

Do not admit real customer candidate data until applicable launch gates are closed:

1. **Pass-token logging:** Candidate and Manager Pass bearer-token segments are replaced by matched route templates before request logs are emitted. The regression suite covers successful, invalid, expired and revoked outcomes on top-level and nested Pass routes.
2. **Production verification:** run type checking, tests, build and fictional-data smoke verification against the exact release commit.
3. **Privacy and retention:** candidate records carry optional customer-selected retention review and privacy-notice evidence. Removing talent-pool membership is a profile update; removing an application is separate from privacy erasure. Privacy erasure deletes stored candidate files and direct communications, revokes Candidate Passes and anonymises candidate PII/free text while retaining non-identifying application status, evaluation scores, decisions and audit timing. The customer must still agree lawful basis, retention duration, export/access ownership and backup treatment.
4. **Authentication and abuse protection:** decide whether one controlled administrator is acceptable; use individual accounts when accountability requires them, and apply login/request throttling in-app or at a trusted edge.
5. **Manager interview workflow:** correct availability capture before relying on manager-proposed scheduling.
6. **Evaluation integrity:** do not record fixed scores as evaluator-supplied; collect criteria or use a simpler recommendation-and-notes form.
7. **Customer isolation:** use a separate deployment, PostgreSQL database, upload store and secret set for each customer.

## Product Boundary

HirePass owns pre-employment hiring. TeamFrame owns ongoing employee and people operations after employment.

HirePass does not currently include:

- external candidate sourcing databases or scraping;
- recruiter prospecting or automated nurture campaigns;
- recruitment-agency CRM;
- job-board marketplace or paid advertising network;
- arbitrary enterprise workflow builders;
- autonomous AI hiring decisions;
- payroll, leave or performance management;
- broad HRIS functionality;
- employee onboarding as a production capability.

Legacy onboarding structures remain in the repository, but onboarding-token routes are disabled in production and must not be reactivated for HirePass launch.

## Commercial Model

The approved Takaven offer is `HirePass + Setup` at `US$3,450` one-off.

Customer infrastructure is customer-paid and preferably customer-controlled. Post-handover support, workflow changes, integrations, reporting changes and other custom work are optional and quoted separately. No monthly software subscription, mandatory maintenance or annual software licence is approved.

## Local Development

Install dependencies:

```bash
npm ci
```

Copy `.env.example` to `.env` for local or disposable development and fill only non-production values. Run locally with `npm run dev`. Seeded data is fictional and must not be mixed with production data.

## Required Configuration

Core variables are `DATABASE_URL`, `HIREPASS_ADMIN_USERNAME`, `HIREPASS_SESSION_SECRET` and `HIREPASS_UPLOAD_DIR`. Production also requires `HIREPASS_ADMIN_PASSWORD_HASH`; plaintext `HIREPASS_ADMIN_PASSWORD` is local/disposable only. The session secret must be at least 32 characters.

`HIREPASS_PASS_ID_PREFIX` is optional and defaults to `HP`. `ANTHROPIC_API_KEY` may exercise legacy AI outside production but does not enable the intended production review capability.

## Production And Verification

A customer deployment requires PostgreSQL, `npm run db:push`, persistent upload storage, secure production credentials, HTTPS, agreed backup ownership, closure of the launch gates above and a fictional-data smoke test before real data.

Run against the exact release commit:

```bash
npm run check
npm test
npm run build
```

Passing existing checks does not supersede the token-logging regression requirement. Use `DEPLOYMENT_RUNBOOK.md` for installation, verification, handover and support boundaries.

Handover includes the deployed URL, first hiring-administrator credentials through a secure channel, infrastructure/storage notes, privacy/retention/backup ownership, a Pass workflow walkthrough and the support/change boundary.

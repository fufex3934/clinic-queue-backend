# Clinic Queue SaaS — Feature Specification

**Document version:** 1.0  
**Last updated:** 2026-07-07  
**Audience:** Product, engineering, stakeholders, and implementation partners  

This document describes the **intended** capabilities of the Clinic Queue SaaS platform for clinics, hospitals, and other health institutions. Each feature is tagged with implementation status:

| Tag | Meaning |
|-----|---------|
| ✅ **Implemented** | Available in the current codebase |
| 🟡 **Partial** | Core flow exists; gaps or optional config remain |
| 📋 **Planned** | Designed intent; not yet built |
| 🔮 **Future** | Longer-term / optional expansion |

---

## 1. Product vision

Clinic Queue SaaS is a **multi-tenant** cloud platform that helps health institutions run day-to-day operations: patient registration, appointment scheduling, waiting-room queue management, staff administration, and (over time) clinical billing and inventory.

### 1.1 Target customers

- Private clinics and polyclinics  
- Hospitals and health centers (single or multi-site)  
- Specialty practices (dental, ophthalmology, laboratory, pharmacy-attached clinics)  
- Any health institution that schedules visits and serves patients in a queue  

### 1.2 Core value propositions

| Value | Description | Status |
|-------|-------------|--------|
| Reduce front-desk chaos | Real-time queue, token numbers, public display board | ✅ |
| Structured appointments | Slot-based booking tied to clinic working hours | ✅ |
| Multi-clinic SaaS | One platform operator; many isolated clinic tenants | ✅ |
| Role-based access | Staff see only what their role allows | ✅ 🟡 (3 roles today; more planned) |
| Operational insight | Dashboards, trends, utilization | ✅ |
| Subscription monetization | Plans, trials, payment approval, renewals | ✅ |
| End-to-end practice management | Billing per service, inventory, clinical workflows | 📋 🔮 |

### 1.3 Technology baseline (current)

- **Backend:** NestJS, MongoDB, JWT auth, Socket.IO (`/realtime`)  
- **Frontend:** Next.js App Router, role-based navigation, i18n (English, Amharic, Oromo)  
- **Tenancy:** Every operational record is scoped by `clinicId`; platform admins may select an active clinic context  

---

## 2. Tenancy and data model

### 2.1 Hierarchy

```text
Platform (SaaS operator)
└── Clinic (tenant)
    ├── Staff users (roles)
    ├── Patients
    ├── Appointments
    ├── Queue entries (per day)
    ├── Subscription (SaaS billing)
    └── [Planned] Departments, services, inventory, invoices
```

### 2.2 Tenant isolation

| Requirement | Status | Notes |
|-------------|--------|-------|
| All patient/queue/appointment data scoped to `clinicId` | ✅ | Enforced in services and queries |
| Staff JWT carries `clinicId`; cannot access other clinics | ✅ | Except `platform_admin` with explicit scope |
| WebSocket rooms per clinic (`clinic:{id}`) | ✅ | JWT + DB user validation on connect |
| Platform admin cross-clinic view via clinic selector | ✅ | `?clinicId=` on operational APIs |
| Hard delete / GDPR export per tenant | 📋 | Soft deactivate exists for clinics and users |

### 2.3 Clinic profile (tenant settings)

| Field / capability | Status | Notes |
|--------------------|--------|-------|
| Name, location, phone, email | ✅ | |
| Address (line, city, country) | ✅ | |
| Timezone | ✅ | Drives “today”, stats, slot boundaries |
| Working hours (start / end) | ✅ | e.g. `09:00`–`17:00` |
| Max appointments per time slot | ✅ | Default 5; validated on book |
| Logo / branding | 📋 | |
| Departments / service lines | 📋 | For doctor assignment, billing codes |
| Holiday / closure calendar | 📋 | Block booking on closed days |
| Multi-location (branch) per tenant | 🔮 | Single clinic entity today |

---

## 3. Roles and permissions

### 3.1 Role taxonomy

#### Platform level (system-wide)

| Role | API value | Scope | Status |
|------|-----------|-------|--------|
| **Platform administrator** | `platform_admin` | All clinics; SaaS billing approval; global user directory | ✅ |

Responsibilities:

- Create, edit, deactivate clinics  
- View platform KPIs and revenue (MRR)  
- Approve or reject clinic subscription payment requests  
- Configure platform payment instructions (QR, text)  
- Operate any clinic in “view clinic” mode (queue, patients, appointments)  
- List all non–platform-admin users across tenants  

#### Clinic level (per tenant)

| Role | API value | Status | Intended scope |
|------|-----------|--------|----------------|
| **Clinic administrator** | `admin` | ✅ | Full clinic ops + staff + SaaS billing |
| **Receptionist** | `receptionist` | ✅ | Patients, queue, appointments (no staff admin / SaaS billing) |
| **Doctor / clinician** | `doctor` | 📋 | Own schedule, serve patients, clinical notes, orders |
| **Nurse** | `nurse` | 📋 | Triage, vitals, assist queue/serve workflow |
| **Cashier / billing clerk** | `cashier` | 📋 | Patient invoices, payments, receipts |
| **Pharmacist** | `pharmacist` | 📋 | Dispensing, inventory depletion, Rx billing |
| **Laboratory technician** | `lab_technician` | 📋 | Lab orders, results entry, lab fee posting |
| **Inventory manager** | `inventory_manager` | 📋 | Stock across pharmacy / supplies |
| **Custom role** | configurable | 🔮 | Fine-grained permission sets per clinic |

### 3.2 Permission model (current vs target)

**Current:** Fixed role enum in backend + `FEATURE_ACCESS` map in frontend (`lib/permissions.ts`).

| Feature area | Platform admin | Clinic admin | Receptionist | Other roles |
|--------------|----------------|--------------|--------------|-------------|
| Overview / analytics | ✅ (platform) | ✅ | ✅ | 📋 |
| Patients CRUD | ✅ (scoped) | ✅ | ✅ | 📋 read-only variants |
| Queue operations | ✅ (scoped) | ✅ | ✅ | 📋 doctor “serve” view |
| Appointments | ✅ (scoped) | ✅ | ✅ | 📋 doctor calendar |
| Staff administration | ✅ | ✅ | ❌ | ❌ |
| SaaS billing (subscription) | approve | ✅ request | ❌ | ❌ |
| Patient billing (invoices) | 📋 | 📋 | 📋 | 📋 cashier |
| Inventory | 📋 | 📋 | ❌ | 📋 |
| Platform payments / MRR | ✅ | ❌ | ❌ | ❌ |
| Global user directory | ✅ | ❌ | ❌ | ❌ |

**Target:** Resource-action permissions (e.g. `patients:read`, `billing:write`, `inventory:adjust`) assignable to roles per clinic.

### 3.3 Authentication and account security

| Capability | Status | Notes |
|------------|--------|-------|
| Login (email or phone + password) | ✅ | |
| JWT session | ✅ | httpOnly cookie + token for API/WS |
| Staff registration (by admin) | ✅ | `POST /auth/register` (admin / platform_admin) |
| Forgot / reset password | ✅ | Token hashed, 1h TTL |
| Password reset email (SMTP) | 🟡 | Sends when `SMTP_*` configured; dev logs token |
| MFA / 2FA | 📋 | |
| SSO (SAML / OIDC) | 🔮 | Enterprise tier |
| Session revoke / force logout | 📋 | |
| Audit log of auth events | 📋 | |

---

## 4. Platform administration features

### 4.1 Clinic lifecycle

| Feature | Status | Details |
|---------|--------|---------|
| List all clinics | ✅ | `GET /clinics` |
| Create clinic | ✅ | Trial subscription auto-provisioned (Starter, 30 days) |
| View clinic detail | ✅ | |
| Edit clinic (profile, hours, slot cap) | ✅ | |
| Deactivate clinic | ✅ | `DELETE /clinics/:id` (soft) |
| Clinic onboarding wizard | 📋 | |
| Bulk import clinics | 🔮 | |

### 4.2 Platform analytics

| Metric / view | Status |
|---------------|--------|
| Total clinics (active / inactive) | ✅ |
| Total patients, appointments, queue volume (platform-wide) | ✅ |
| 7-day trends (appointments, queue) | ✅ |
| Per-clinic breakdown in selector context | ✅ |
| MRR / revenue chart | ✅ |
| Churn, trial conversion | 📋 |
| SLA / uptime dashboard | 📋 |

### 4.3 SaaS subscription and billing (tenant → platform)

This is **subscription billing** (clinic pays the SaaS operator), distinct from **patient billing** (Section 8).

| Feature | Status | Details |
|---------|--------|---------|
| Plans: Starter, Professional, Enterprise | ✅ | Enum in schema; marketing page uses Starter/Growth/Premium labels |
| 30-day subscription period on approval | ✅ | |
| 3-day grace after expiry | ✅ | Operational APIs blocked after grace |
| Auto Starter trial for new / legacy clinics | ✅ | |
| Payment request by clinic admin | ✅ | |
| Upload payment proof (local / S3) | ✅ | |
| Platform approve / reject | ✅ | |
| Payment QR + instructions (platform settings) | ✅ | |
| Renewal warning (7 days) | ✅ | In billing status API |
| Automated card / mobile money gateway | 📋 | Manual proof flow today |
| Plan limits (max users, features) | 📋 | Not enforced per plan yet |
| Invoicing PDF for subscription | 📋 | |

---

## 5. Clinic administration features

### 5.1 Staff management

| Feature | Status | Details |
|---------|--------|---------|
| Create staff (receptionist, clinic admin) | ✅ | |
| List staff per clinic | ✅ | |
| Enable / disable staff | ✅ | |
| View staff detail | ✅ | |
| Edit staff (name, role, contact) | ✅ | Self cannot change own role |
| Reset staff password (admin) | ✅ | Via user update flows |
| Assign doctor / specialty / department | 📋 | |
| Shift / duty roster | 📋 | |
| Staff activity log | 📋 | |

### 5.2 Clinic settings UI

| Feature | Status |
|---------|--------|
| Edit profile, hours, slot capacity | ✅ |
| Timezone selection | ✅ |
| Notification preferences | 📋 |
| Receipt / invoice header/footer | 📋 |
| Tax registration (TIN / VAT) | 📋 |

---

## 6. Patient management

### 6.1 Patient registry

| Feature | Status | Details |
|---------|--------|---------|
| Register patient | ✅ | Name, phone required |
| Optional DOB, gender, secondary phone, notes | ✅ | |
| List patients (paginated) | ✅ | |
| Search by name or phone (server-side) | ✅ | Debounced UI |
| View patient detail | ✅ | `/dashboard/patients/[id]` |
| Update patient | ✅ | |
| Delete / archive patient | 📋 | No delete endpoint today |
| Duplicate detection (phone) | 📋 | Index exists; merge UI not built |
| Medical record number (MRN) | 📋 | Auto-generated per clinic |
| Insurance / payer profile | 📋 | |
| Family / guarantor linkage | 🔮 | |
| Document attachments (ID, referral) | 📋 | |
| Consent and privacy flags | 📋 | |

### 6.2 Patient portal (optional product line)

| Feature | Status |
|---------|--------|
| Book own appointment | 🔮 |
| View queue position | 🔮 |
| Pay invoice online | 🔮 |
| SMS / WhatsApp reminders | 📋 |

---

## 7. Appointments

### 7.1 Scheduling

| Feature | Status | Details |
|---------|--------|---------|
| Book appointment (patient + date + slot) | ✅ | |
| Dynamic slots from clinic hours + slot duration | ✅ | |
| Per-slot capacity limit | ✅ | |
| List appointments by date | ✅ | |
| Filter by status | ✅ | |
| Assign to doctor / room | 📋 | Patient + slot only today |
| Appointment types (consultation, follow-up, lab) | 📋 | |
| Recurring appointments | ❌ | Explicitly out of scope |
| Waitlist when slot full | 📋 | |
| Overbooking rules (admin override) | 📋 | |

### 7.2 Appointment lifecycle

```text
scheduled → confirmed → arrived → [in queue] → completed
                ↓           ↓
            cancelled    no_show
```

| Transition | Status | Actor |
|------------|--------|-------|
| Book (scheduled) | ✅ | Receptionist, admin |
| Confirm | ✅ | |
| Cancel | ✅ | |
| Mark arrived | ✅ | Creates / links queue entry |
| Mark no-show | ✅ | |
| Complete | ✅ | Terminal state |
| Reschedule | 📋 | Cancel + rebook or dedicated flow |

### 7.3 Notifications

| Feature | Status |
|---------|--------|
| Real-time UI update on book/change | ✅ WebSocket `appointment.updated` |
| SMS / email reminder before visit | 📋 |
| Confirmation message on book | 📋 |

---

## 8. Queue management

### 8.1 Core queue

| Feature | Status | Details |
|---------|--------|---------|
| Daily token numbers (per clinic, per day) | ✅ | Unique per day |
| Add walk-in to queue | ✅ | |
| FIFO serve next | ✅ | |
| Tabs: Waiting / Serving / Done / Skipped | ✅ | |
| Skip entry | ✅ | |
| Remove entry | ✅ | |
| Force serve (admin) | ✅ | |
| Reorder waiting list (up/down) | ✅ | |
| Drag-and-drop reorder | ✅ | Admin UI (`@dnd-kit`) |
| Link queue entry to appointment | 🟡 | Arrive flow connects them |
| Priority queue (urgent / elderly / VIP) | 📋 | |
| Multi-queue (per doctor / department) | 📋 | Single clinic queue today |
| Estimated wait time | 📋 | |

### 8.2 Display and realtime

| Feature | Status | Details |
|---------|--------|---------|
| Public queue display board | ✅ | `/dashboard/queue/display` |
| Real-time updates (Socket.IO) | ✅ | `queue.updated`, `queue.added`, `queue.served` |
| TV / kiosk full-screen mode | 🟡 | Display page exists; dedicated kiosk UX 📋 |
| Audio call (“Token 12, Room 2”) | 📋 | |
| Print token slip | 📋 | |

### 8.3 Receptionist workflow

| Feature | Status |
|---------|--------|
| “Today” operations dashboard | ✅ |
| Quick actions: patients, queue, book | ✅ |
| Subscription gate with clear messaging | ✅ |

---

## 9. Billing and payments

Two billing domains must be kept separate:

| Domain | Who pays whom | Status |
|--------|---------------|--------|
| **A. SaaS subscription** | Clinic → platform operator | ✅ See Section 4.3 |
| **B. Patient / clinical billing** | Patient → clinic | 📋 Planned |

### 9.1 Patient billing (planned)

#### 9.1.1 Service catalog

| Item type | Examples | Status |
|-----------|----------|--------|
| Consultation fees | General, specialist, follow-up | 📋 |
| Procedure fees | Minor surgery, dressing | 📋 |
| Laboratory tests | CBC, urinalysis, imaging referral | 📋 |
| Pharmacy / medicine | Dispensed items with price | 📋 |
| Other fees | Registration, certificate, bed day | 📋 |
| Packages / bundles | Antenatal package | 🔮 |

#### 9.1.2 Pricing and charging

| Feature | Status |
|---------|--------|
| Price list per clinic (and per department) | 📋 |
| Charge capture at visit / checkout | 📋 |
| Link charges to appointment, queue visit, or standalone | 📋 |
| Discounts, waivers (admin approval) | 📋 |
| Tax / VAT line items | 📋 |
| Multi-currency | 🔮 |

#### 9.1.3 Invoicing and payments

| Feature | Status |
|---------|--------|
| Invoice generation (draft → issued → paid) | 📋 |
| Partial payments, deposits | 📋 |
| Payment methods: cash, card, mobile money, insurance | 📋 |
| Receipt printing / PDF | 📋 |
| Refunds and credit notes | 📋 |
| Outstanding balance / aging report | 📋 |
| Insurance claim stub (pre-auth, copay) | 🔮 |

#### 9.1.4 Role integration

| Role | Billing actions |
|------|-----------------|
| Receptionist | 📋 Collect copay, view balance |
| Cashier | 📋 Full checkout, receipts |
| Doctor | 📋 Order services (no payment) |
| Lab / pharmacy | 📋 Post billable items to visit |
| Clinic admin | 📋 Price lists, reports, waivers |

---

## 10. Inventory management (planned)

### 10.1 Scope

Pharmacy and medical supplies for clinics that dispense or consume stock during visits.

### 10.2 Item master

| Feature | Status |
|---------|--------|
| SKU / item code | 📋 |
| Name, category (medicine, consumable, equipment) | 📋 |
| Unit of measure (tablet, vial, box) | 📋 |
| Reorder level, preferred supplier | 📋 |
| Batch / expiry tracking (medicines) | 📋 |
| Controlled substance flag | 🔮 |

### 10.3 Stock operations

| Feature | Status |
|---------|--------|
| Receive stock (GRN) | 📋 |
| Adjust stock (damage, expiry write-off) | 📋 |
| Transfer between stores / departments | 📋 |
| Dispense to patient (links to billing) | 📋 |
| Internal consumption | 📋 |
| Stock valuation (FIFO / average) | 🔮 |

### 10.4 Pharmacy workflow

| Feature | Status |
|---------|--------|
| Prescription from doctor | 📋 |
| Dispensing queue | 📋 |
| Generic substitution | 🔮 |
| Interaction warnings | 🔮 |

### 10.5 Reporting

| Report | Status |
|--------|--------|
| Low stock alert | 📋 |
| Expiry within N days | 📋 |
| Movement history | 📋 |
| COGS tied to patient billing | 📋 |

---

## 11. Clinical and departmental modules (planned)

These extend the platform beyond front-desk operations.

### 11.1 Doctor / clinical

| Feature | Status |
|---------|--------|
| Doctor user role and login | 📋 |
| Personal appointment calendar | 📋 |
| “My patients in queue” view | 📋 |
| Consultation notes (SOAP) | 📋 |
| Diagnosis / ICD coding | 🔮 |
| Orders: lab, imaging, pharmacy | 📋 |
| e-Prescription | 📋 |

### 11.2 Laboratory

| Feature | Status |
|---------|--------|
| Lab order from reception / doctor | 📋 |
| Sample collection tracking | 📋 |
| Result entry and approval | 📋 |
| Result delivery to patient record | 📋 |
| Lab fee on invoice | 📋 |
| Equipment / reagent inventory link | 📋 |

### 11.3 Imaging / other departments

| Feature | Status |
|---------|--------|
| Department-specific queues | 📋 |
| Service-specific billing codes | 📋 |

---

## 12. Analytics and reporting

### 12.1 Clinic dashboard (implemented)

| Metric | Status |
|--------|--------|
| Today: patients served, in queue, appointments | ✅ |
| Queue status breakdown | ✅ |
| Appointment status breakdown | ✅ |
| 7-day queue and appointment series | ✅ |
| Slot utilization vs capacity | ✅ |
| Subscription / billing status banner | ✅ |

### 12.2 Platform dashboard (implemented)

| Metric | Status |
|--------|--------|
| Cross-clinic aggregates | ✅ |
| Clinic selector for scoped ops | ✅ |
| Revenue / MRR | ✅ |

### 12.3 Planned reports

| Report | Status |
|--------|--------|
| No-show rate | 📋 |
| Average wait time | 📋 |
| Revenue by service / doctor / day | 📋 |
| Inventory valuation | 📋 |
| Export CSV / PDF | 📋 |
| Scheduled email reports | 🔮 |

---

## 13. Realtime, notifications, and integrations

### 13.1 Realtime (implemented)

| Event | Status |
|-------|--------|
| `queue.updated`, `queue.added`, `queue.served` | ✅ |
| `appointment.updated` | ✅ |
| Tenant-isolated Socket.IO rooms | ✅ |

### 13.2 Notifications (planned)

| Channel | Use cases | Status |
|---------|-----------|--------|
| In-app | Renewal, low stock, payment approved | 🟡 partial (billing UI) |
| Email | Reset password, reminders | 🟡 SMTP optional |
| SMS | Appointment reminder, token ready | 📋 |
| WhatsApp / Telegram | Patient engagement | 🔮 |
| Push (mobile app) | 🔮 |

### 13.3 Integrations (future)

| Integration | Status |
|-------------|--------|
| HL7 / FHIR patient sync | 🔮 |
| National health ID | 🔮 |
| Accounting (QuickBooks, etc.) | 🔮 |
| Payment gateways (Chapa, Telebirr, Stripe) | 📋 |
| Laboratory instruments | 🔮 |

---

## 14. User experience and localization

| Feature | Status |
|---------|--------|
| Responsive web dashboard | ✅ |
| Role-based navigation | ✅ |
| English, Amharic (am), Oromo (om) UI strings | ✅ |
| Marketing landing (features, pricing, contact) | ✅ |
| Dark mode | 📋 |
| Mobile app (staff) | 🔮 |
| Offline-first queue | 🔮 |
| Accessibility (WCAG) | 📋 |

---

## 15. Security, compliance, and operations

| Area | Status | Notes |
|------|--------|-------|
| JWT auth on REST and WebSocket | ✅ | |
| Role guards on controllers | ✅ | |
| Subscription guard on operational APIs | ✅ | |
| Password hashing | ✅ | |
| Reset token not returned in production | ✅ | |
| Structured request / queue logging | ✅ | |
| Health check (`GET /health`) | ✅ | MongoDB ping |
| MongoDB replica set recommendation | ✅ | Documented for transactions |
| PHI encryption at rest | 📋 | |
| HIPAA / local health data compliance checklist | 📋 | |
| Rate limiting / brute-force protection | 📋 | |
| Backup and restore per tenant | 📋 | |
| Playwright smoke tests | 🟡 | `frontend/e2e/smoke.spec.ts` |
| Backend unit + e2e tests | ✅ | |

---

## 16. API surface (current reference)

Operational APIs are prefixed on the backend (e.g. port 4000); frontend proxies via `/api/backend/*`.

| Module | Key endpoints | Status |
|--------|---------------|--------|
| Auth | `login`, `register`, `forgot-password`, `reset-password`, `me` | ✅ |
| Clinics | CRUD + `me` | ✅ |
| Users | list, create, patch, `platform/all` | ✅ |
| Patients | CRUD + search | ✅ |
| Appointments | `book`, list, `arrive`, `confirm`, `cancel`, `complete`, `no-show` | ✅ |
| Queue | `add`, `today`, `serve-next`, `reorder`, `skip`, `serve`, delete | ✅ |
| Payments | subscription requests, billing, admin approval, revenue | ✅ |
| Stats | `dashboard` | ✅ |
| Health | `health` | ✅ |
| Inventory | — | 📋 |
| Patient invoices | — | 📋 |

Platform admins pass `?clinicId=` on operational list endpoints when acting on a specific tenant.

---

## 17. Implementation roadmap (suggested phases)

### Phase A — Foundation ✅ (complete)

Multi-tenant clinics, auth, patients, appointments, queue, realtime, SaaS billing, dashboards.

### Phase B — Staff and workflow expansion 📋

- Doctor role + calendar  
- Multi-queue per department  
- Appointment → doctor assignment  
- SMS reminders  

### Phase C — Patient billing 📋

- Service catalog and price list  
- Invoice and checkout  
- Cashier role  
- Basic revenue reports  

### Phase D — Inventory and pharmacy 📋

- Item master and stock movements  
- Dispensing linked to prescriptions and billing  
- Low-stock and expiry alerts  

### Phase E — Laboratory 📋

- Orders, results, lab billing integration  

### Phase F — Enterprise 🔮

- SSO, custom roles, branch sites, FHIR, advanced compliance  

---

## 18. Feature summary matrix

| Module | Implemented | Partial | Planned |
|--------|-------------|---------|---------|
| Platform admin / multi-tenant | ● | | |
| Clinic admin / settings | ● | | |
| Staff (receptionist, clinic admin) | ● | | |
| Staff (doctor, cashier, lab, pharmacy) | | | ○ |
| Patients | ● | | ○ extended record |
| Appointments | ● | | ○ doctor assign, reminders |
| Queue | ● | ○ display kiosk | ○ multi-queue |
| SaaS subscription billing | ● | ○ plan limits | ○ payment gateway |
| Patient / clinical billing | | | ○ |
| Inventory / pharmacy | | | ○ |
| Laboratory | | | ○ |
| Analytics | ● | | ○ financial reports |
| Realtime | ● | | |
| i18n | ● | | |
| Patient portal | | | ○ |

● = largely done · ○ = not yet built  

---

## 19. Related documents

| Document | Purpose |
|----------|---------|
| [FEATURE_AUDIT.md](../../docs/FEATURE_AUDIT.md) | Point-in-time audit of shipped features |
| [IMPLEMENTATION_SUMMARY.md](../../docs/IMPLEMENTATION_SUMMARY.md) | Engineering changelog by phase |
| [PRODUCTION_READINESS.md](../../docs/PRODUCTION_READINESS.md) | Deploy commands and env checklist |
| [MONGODB_PRODUCTION.md](./MONGODB_PRODUCTION.md) | Database production notes |
| [Frontend README](../../frontend/README.md) | Frontend routes and architecture |

---

## 20. Document maintenance

Update this specification when:

- A planned module moves to implementation (change status tags).  
- New roles or tenant types are introduced.  
- Billing or inventory scope is refined with stakeholders.  
- Regulatory requirements apply to a deployment region.  

For engineering-only deltas, continue to record release detail in `../../docs/IMPLEMENTATION_SUMMARY.md`; keep this file as the **single product-oriented feature reference**.

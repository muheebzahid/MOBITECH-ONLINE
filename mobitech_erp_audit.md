# Technical Audit Report: Mobitech Master ERP Architecture & AI Integration Assessment

**Generated on:** October 11, 2026  
**Audited System:** Mobitech Master ERP  
**Audit Type:** Read-Only Architectural & Technical Assessment  

---

## Executive Summary
This document provides a comprehensive technical audit of the **Mobitech Master ERP** platform. It covers the full technology stack, database architecture, multi-environment synchronization setup (Local Master vs. Online Cloud), complete business module inventory, and technical feasibility and security models for integrating an external **AI Executive Assistant**.

---

## 1. Technology Stack & Frameworks

| Architecture Layer | Technology & Version | Details / Role in System |
| :--- | :--- | :--- |
| **Programming Language** | **TypeScript (v5.x)** / JavaScript (ESNext) | Strictly typed frontend and backend implementation across all modules. |
| **Fullstack Framework** | **Next.js 16.2.10** | App Router architecture leveraging React Server Components (RSC), Next.js Server Actions, and Turbopack compiler. |
| **Frontend UI Library** | **React 19.2.4** | Modern component lifecycle, React Server Actions (`'use server'`), and hooks. |
| **Styling & Design System** | **Tailwind CSS v4** | Utility-first responsive design, dark/light design token variables. |
| **State & Data Fetching** | **TanStack React Query (`@tanstack/react-query`)** | Client-side cache synchronization, background refetching, and pagination state. |
| **Database Clients** | `@supabase/supabase-js`, `@supabase/ssr`, `pg` (Node Postgres) | Server-side and client-side database connectivity with Supabase session SSR handling. |
| **Data Ingestion & Export** | `xlsx` (SheetJS), `papaparse` | Parsing and generation of Excel/CSV formats for bulk inventory, deals, and accounting exports. |
| **Document Generation** | `jspdf` | Client-side and server-side PDF invoice compilation. |
| **PWA & Mobile Support** | `@ducanh2912/next-pwa` | Progressive Web App manifest and offline caching support. |
| **Local Hosting Setup** | Node.js Runtime | Hosted locally on `http://localhost:3000`, paired with a local Supabase Docker container stack (Port `54321` for REST/Auth/Kong API Gateway, Port `54322` for Direct PostgreSQL Connection). |

---

## 2. Database Architecture & Hosting

### Database Engine
- **PostgreSQL (v15+)** managed and provisioned through the Supabase ecosystem.

### Database Hosting & Connectivity
1. **Local Database (Master Instance):**
   - Hosted locally inside a Dockerized Supabase stack on the workstation.
   - **Kong REST / Auth API Gateway:** `http://127.0.0.1:54321`
   - **Direct PostgreSQL Connection:** `127.0.0.1:54322` (`postgres` database)
   - **Primary Function:** Serves as the primary data store for all daily business operations, purchases, inventory tracking, wholesale invoicing, and accounting entries.

2. **Cloud Database (Online Cloud Instance):**
   - **Provider:** Supabase Cloud (hosted on Amazon Web Services - AWS infrastructure).
   - **Primary Function:** Serves the public/remote deployment of the ERP for online viewing and cloud backups.

3. **Connection Decoupling:**
   - The local Master ERP reads and writes exclusively to the **local database**.
   - The local ERP holds secondary, isolated connection bindings to the cloud Supabase database specifically for the one-way Full-Mirror Sync engine.
   - Credentials and environment variables are strictly segregated in `.env.local`.

---

## 3. Local vs. Online ERP Relationship & Synchronization

```
┌────────────────────────────────────────────────────────┐
│                   LOCAL ENVIRONMENT                    │
│                                                        │
│  [Local Master ERP UI] ────► [Local Supabase DB]       │
│  (http://localhost:3000)     (127.0.0.1:54321/54322)   │
│                                      │                 │
└──────────────────────────────────────┼─────────────────┘
                                       │
                         One-Way Full-Mirror Sync
                       (/api/sync/admin/execute)
                                       │
                                       ▼
┌────────────────────────────────────────────────────────┐
│                   CLOUD ENVIRONMENT                    │
│                                                        │
│  [Online ERP UI]       ────► [Cloud Supabase DB]       │
│  (Deployed via GitHub)       (AWS Cloud Instance)      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Verified Findings:
1. **Decoupled Databases:** The local ERP and online ERP **do not share a single active database connection directly**. Local writes to local PostgreSQL; Online writes to cloud PostgreSQL.
2. **Master Source of Truth:** The **Local ERP is the Master Single Source of Truth**. All business transactions, inventory allocations, deals, and accounting records are created locally.
3. **One-Way Full-Mirror Sync Engine:**
   - Located at `src/lib/sync/executeFullSync.ts` and triggered via `/api/sync/admin/execute`.
   - Performs a 1-way transactional mirror from Local (Master) $\rightarrow$ Online (Cloud).
   - Upserts all local records in strict foreign-key dependency order (Clients $\rightarrow$ Deals $\rightarrow$ Shipments $\rightarrow$ Invoices $\rightarrow$ Inventory $\rightarrow$ Expenses $\rightarrow$ Treasury).
   - Deletes orphan cloud records that do not exist locally (in reverse FK order).
   - Strips PostgreSQL `GENERATED ALWAYS` columns (e.g. `total_logistics_cost`, `total_cost`, `total_price`) before upserting.
   - Sanitizes authentication user foreign keys across differing auth user pools.
4. **Codebase Parity:** Both local and online deployments run the same unified Next.js codebase (repository tracked on GitHub under branch `main`).

---

## 4. Business Modules Inventory

The ERP system contains **11 core business modules**:

| Module | Route | Core Functionality & Capabilities |
| :--- | :--- | :--- |
| **1. Purchases & Deals** | `/dashboard/deals` | Auction purchase management, batch commitments, multi-SKU lots, funding source split (AMEX / Cash Pool / Mixed), unit cost calculation, and deal status lifecycle (`WON` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `ARRIVED` $\rightarrow$ `IN_REPAIR` $\rightarrow$ `READY_TO_SELL` $\rightarrow$ `SOLD` $\rightarrow$ `CLOSED`). |
| **2. Sales & Invoicing** | `/dashboard/sales` | B2B wholesale invoice generation, line-item SKU mapping to deal inventory, partial/full payment tracking, balance due calculation, customer PDF invoice export. |
| **3. Logistics & Freight** | `/dashboard/logistics` | International freight shipment tracking, forwarder assignment, multi-deal shipment consolidation, automated landed cost & shipping cost per unit allocation, document uploads. |
| **4. Inventory & Refurbishment** | `/dashboard/inventory` | Individual device tracking via Serial Number / IMEI, 6-stage refurb lifecycle (`SEPARATED`, `HANDED_TO_REFURBISH`, `QC_DONE`, `READY_TO_SELL`, `ASSIGNED`, `SOLD`), device repair costs. |
| **5. Online Sales Channels** | `/dashboard/online-sales` | E-commerce multi-channel tracking for **Amazon FBA** and **Revibe**, channel profitability, repair cost absorption, gross/net margins, and per-SKU ROI analysis. |
| **6. Accounting & P&L** | `/dashboard/accounting` | Real-time GAAP Financial Statements: Consolidated P&L, Wholesale vs Online Gross Profit, AMEX Cashback Profit, categorized Operating Expenses (Payroll, Rent, Software, Marketing, Other), GAAP Balance Sheet (Assets, Liabilities, Equity), multi-currency toggle (USD / AED). |
| **7. Treasury & Capital Pool** | `/dashboard/finance` | Credit line monitoring ($500K AMEX limit, $300K Cash Pool), deployed vs available liquidity, wire transfer logs, monthly statement reconciliation. |
| **8. Partner Accounting** | `/dashboard/partners` | Partner capital contributions, profit distributions, equity balances, withdrawal requests, and audit approvals. |
| **9. Market Analytics** | `/dashboard/analytics` | AT&T Closing Prices tracking, auction benchmark trends, grade/storage valuation history. |
| **10. Clients & CRM** | `/dashboard/clients` | Customer and supplier profiles, lifetime billing history, collected payments, and real-time outstanding accounts receivable. |
| **11. Admin & Security** | `/dashboard/admin` | Role-Based Access Control (RBAC) with 6 permission levels (`SUPER_ADMIN`, `SALES`, `LOGISTICS`, `FINANCE`, `VIEW_ONLY`, `DENIED`) and audit trails. |

---

## 5. AI Integration Possibilities & Architecture

### Current API Status
- Internal API routes exist in `src/app/api/` for synchronization, backups, and data preflight.
- Business UI operations currently execute through Next.js Server Actions (`'use server'`).
- The underlying PostgreSQL database is fully compatible with instant automated API exposure via Supabase / PostgREST, direct read-only SQL querying, and custom executive API endpoints.

---

### Integration Architectures for AI Executive Assistant

```
                          ┌────────────────────────┐
                          │  AI Executive Agent    │
                          └───────────┬────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │ (Option 1: Recommended)    │ (Option 2: Direct REST)    │ (Option 3: Direct DB)
         ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Dedicated AI API │         │  Supabase API    │         │ PostgreSQL Direct│
│ / MCP Endpoint   │         │ (PostgREST JSON) │         │  Read-Only Role  │
│ (Custom Tools)   │         │ (Service / Anon) │         │  (Port 54322)    │
└────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ▼
                        ┌────────────────────────┐
                        │  Local PostgreSQL DB   │
                        │  (Master ERP Data)     │
                        └────────────────────────┘
```

#### Option 1: Dedicated AI Route Layer / Model Context Protocol (MCP) Server (Recommended)
- **Concept:** Expose a dedicated API route namespace (e.g. `/api/ai/v1/...`) or run a Model Context Protocol (MCP) server.
- **Functionality:** Provides curated executive functions (e.g., `get_company_pnl`, `get_cashflow_summary`, `get_inventory_health`, `get_unpaid_invoices_report`, `get_deal_roi_analysis`).
- **Advantage:** Pre-calculates complex accounting rules (COGS, freight allocation, refurb costs, AMEX profit multipliers) directly inside verified ERP business logic so the AI receives 100% accurate, reconciled financial numbers without executing raw multi-table joins.

#### Option 2: Native Supabase PostgREST JSON API
- **Concept:** Use the existing local Supabase PostgREST endpoint (`http://127.0.0.1:54321/rest/v1/`).
- **Functionality:** Standard RESTful JSON access across all tables with built-in filtering, pagination, and column selection.
- **Advantage:** Requires zero new backend code; instantly queryable with standard HTTP client or Supabase JS/Python SDK.

#### Option 3: Direct PostgreSQL Read-Only Connection
- **Concept:** Connect directly to the local PostgreSQL database on port `54322`.
- **Functionality:** Direct SQL execution using standard database connection drivers (`pg`, `psycopg2`, SQLAlchemy).
- **Advantage:** Enables ad-hoc analytical SQL queries, window functions, and time-series rollups.

---

### Security & Authentication Protocol for AI Assistant

1. **Dedicated Read-Only SQL Role:**
   Create a dedicated, strictly non-destructive database role:
   ```sql
   CREATE ROLE ai_executive_reader WITH LOGIN PASSWORD '...';
   GRANT USAGE ON SCHEMA public TO ai_executive_reader;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_executive_reader;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_executive_reader;
   
   -- Explicitly prevent any data modification
   REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public FROM ai_executive_reader;
   ```

2. **Bearer Token Authentication:**
   For HTTP/REST AI endpoints, require a secure `Bearer <AI_API_TOKEN>` validated in middleware against environment configuration.

3. **Network Isolation (Localhost Binding):**
   Restrict all AI listener ports and database connections to `127.0.0.1` (localhost) so external network traffic cannot access database ports directly.

4. **Audit Trail Logging:**
   Record all AI read inquiries and analytical queries with timestamps and queried data domains for complete visibility.

---

## 6. Recommended Next Steps

1. **Phase 1: Assistant Scope Definition**
   - Align on the specific executive questions, daily summaries, and decision-support metrics the AI should automate (e.g., daily cash flow alerts, profit margin alerts on auction bids, aging inventory summaries, customer credit risk).
2. **Phase 2: Read-Only Data Interface Setup**
   - Implement either the Dedicated AI API route layer (Option 1) or provision the dedicated read-only database role (Option 3).
3. **Phase 3: Sandbox Verification**
   - Test the AI Assistant against the live local ERP to verify that generated figures mathematically match the Accounting P&L and Deals ledger.

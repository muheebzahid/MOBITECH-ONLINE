# Mobitech Master ERP — Financial Intelligence Audit Report

**Document Title:** Financial Data Architecture, Calculation Logic & AI Executive Assistant Integration  
**Target System:** Mobitech Master Wholesale ERP  
**Audit Date:** October 11, 2026  
**Auditor:** Antigravity AI Engineering  
**Scope:** Read-Only Financial Intelligence & Mathematical Audit  

---

## Executive Summary
This report provides a comprehensive, ground-truth audit of how financial data is stored, calculated, reconciled, and reported within the **Mobitech Master Wholesale ERP**. 

The findings below establish the mathematical formulas, database schemas, cash flow constraints, and API architectures necessary to build an independent, real-time **AI Executive Assistant** capable of monitoring business health, forecasting cash flow, evaluating auction purchase bids, and issuing risk alerts.

---

## 1. Profit & Loss (P&L) Architecture & Calculations

### 1.1 Core Mathematical Model
The ERP maintains a consolidated multi-divisional P&L structure reconciling Wholesale B2B Deals and E-Commerce Online Sales (Amazon FBA & Revibe).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CONSOLIDATED P&L                              │
│                                                                         │
│   Wholesale Revenue          Online Sales Revenue                       │
│   (invoices)                 (online_orders)                            │
│         │                          │                                    │
│         ▼                          ▼                                    │
│   Less: Wholesale COGS       Less: Online COGS                          │
│   (Device Stock + Freight)   (Device Stock + Freight + Repairs)         │
│         │                          │                                    │
│         ▼                          ▼                                    │
│   Wholesale Gross Profit     Online Gross Profit                        │
│         │                          │                                    │
│         └───────────┬──────────────┘                                    │
│                     ▼                                                   │
│          Consolidated Gross Profit                                      │
│                     │                                                   │
│                     ├────────► Plus: AMEX Cashback Profit               │
│                     │                                                   │
│                     └────────► Less: Total Operating Expenses (OPEX)    │
│                                                                         │
│                                      ▼                                  │
│                          CONSOLIDATED NET PROFIT                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Breakdown of Formulas & Source Logic

#### A. Wholesale Revenue & COGS (`src/lib/accounting/actions.ts`)
- **Wholesale Revenue:**
  $$\text{Wholesale Revenue} = \sum \text{invoices.total\_amount} \quad (\text{where } \text{status} \notin \{\text{'CANCELLED'}, \text{'DRAFT'}\})$$
- **Wholesale COGS (Device Stock + Fees):**
  For each line item on an active invoice:
  $$\text{Unit Base Cost} = \text{deal\_items.unit\_cost} \quad \text{or} \quad (\text{averageBaseCost} - \text{dealFeePerUnit})$$
  $$\text{Deal Fee Per Unit} = \frac{\text{auction\_fee} + \text{other\_fees}}{\text{deal.quantity}}$$
  $$\text{Wholesale COGS (Devices)} = \sum \text{quantity} \times (\text{Unit Base Cost} + \text{Deal Fee Per Unit})$$
- **Wholesale Logistics Cost (Landed Freight Allocation):**
  $$\text{Shipping Cost Per Unit} = \frac{\text{shipment.total\_logistics\_cost}}{\text{totalShipmentUnits}}$$
  $$\text{Wholesale COGS (Logistics)} = \sum \text{quantity} \times \text{Shipping Cost Per Unit}$$
- **Wholesale Gross Profit:**
  $$\text{Wholesale Gross Profit} = \text{Wholesale Revenue} - (\text{Wholesale COGS Devices} + \text{Wholesale COGS Logistics})$$

#### B. Online Sales Revenue & COGS
- **Online Revenue:**
  $$\text{Online Revenue} = \sum \text{online\_orders.total\_amount} \quad (\text{where } \text{status} \neq \text{'CANCELLED'})$$
- **Online COGS (Landed Stock + Repairs):**
  $$\text{Online COGS} = \sum (\text{inventory\_items.unit\_cost} + \text{inventory\_items.logistics\_cost} + \text{inventory\_items.repair\_cost})$$
- **Online Gross Profit:**
  $$\text{Online Gross Profit} = \text{Online Revenue} - \text{Online COGS}$$
- **Online Channel Net Profit:**
  $$\text{Online Net Profit} = \text{Online Gross Profit} - \text{Online Other Expenses (Marketing/Platform Fees)}$$

#### C. Consolidated Net Profit
$$\text{Consolidated Gross Profit} = \text{Wholesale Gross Profit} + \text{Online Gross Profit}$$
$$\mathbf{\text{Consolidated Net Profit}} = \mathbf{\text{Consolidated Gross Profit} + \text{AMEX Cashback Profit} - \text{Total OPEX}}$$

#### D. AMEX Cashback Profit
- **Cashback Rate:** 2.0% on AMEX-funded commitments (`amex_amount` or allocated commitment).
- **Recognition Rule:** Recognized proportionally as purchased units are sold and paid:
  $$\text{AMEX Profit Per Unit} = \frac{\text{AMEX Commitment} \times 0.02}{\text{Deal Quantity}}$$
  $$\text{Recognized AMEX Profit} = \sum_{\text{sold units}} \text{quantity} \times \text{AMEX Profit Per Unit}$$

#### E. Operating Expenses (OPEX)
- Stored in `operating_expenses` table.
- Grouped into 5 standard GAAP categories:
  1. `PAYROLL` — Salaries, staff allowances, commissions.
  2. `OFFICE_SUPPLIES` — Office rent, utilities, office maintenance.
  3. `SOFTWARE` — ERP hosting, cloud subscriptions, software licenses.
  4. `MARKETING` — Advertising, platform commissions, customer acquisition.
  5. `OTHER` — Legal, banking, travel, miscellaneous administrative costs.

#### F. Currency Conversion
- Standardized peg: $1.00 \text{ USD} = 3.674 \text{ AED}$.

---

## 2. Cash Flow & Treasury Intelligence

### 2.1 Capital Limits & Accounts
The company operates under a defined multi-source treasury structure managed via `treasury_settings` and `src/lib/finance/actions.ts`:

| Treasury Account | Standard Limit | Role & Purpose |
| :--- | :--- | :--- |
| **AMEX Credit Line** | **\$500,000 USD** | Primary credit vehicle for winning auction deals upfront. |
| **Turbo Cash Pool** | **\$150,000 USD** | Liquid cash reserve for direct supplier wires & logistics. |
| **SB Cash Pool** | **\$150,000 USD** | Secondary liquid cash reserve & AMEX settlement buffer. |
| **Total Liquid Cash Limit**| **\$300,000 USD** | Combined cash pool limit. |

### 2.2 In-Flight / Deployed Capital vs. Available Liquidity
- **AMEX Stuck (Deployed Credit):**
  $$\text{AMEX Stuck} = \sum_{\text{deals.status} \neq \text{'DEAL\_CLOSED'}} (\text{AMEX Funding Allocation})$$
- **Cash Stuck (Deployed Cash):**
  $$\text{Cash Stuck} = \sum_{\text{deals.status} \neq \text{'DEAL\_CLOSED'}} (\text{Cash Funding Allocation})$$
- **Available AMEX Purchasing Line:**
  $$\text{AMEX Available} = \text{AMEX Limit (\$500k)} - \text{AMEX Stuck}$$
- **Available Liquid Cash:**
  $$\text{Cash Available} = \text{Cash Limit (\$300k)} - \text{Cash Stuck}$$
- **Real-Time Total Purchasing Power:**
  $$\mathbf{\text{Available Purchasing Power}} = \mathbf{\text{AMEX Available} + \text{Cash Available}}$$

### 2.3 AMEX Monthly Payoff Settlement Cycle
The ERP encodes a strict monthly payment settlement cycle rule in `src/lib/accounting/treasuryActions.ts`:
- **Deals funded on Days 1–11 of the month:** AMEX statement payoff occurs on the **10th/11th of the SAME month**.
- **Deals funded on Days 12–31 of the month:** AMEX statement payoff occurs on the **10th/11th of the NEXT month**.
- **Executive Implication:** The AI Assistant can calculate exact upcoming cash settlement requirements 10–30 days in advance to prevent liquidity crunches.

---

## 3. Inventory & Landed Cost Intelligence

### 3.1 Inventory Cost Components
Every unit in the ERP carries a 4-part landed cost:
$$\text{Unit Landed Cost} = \text{Base SKU Cost} + \text{Proportional Auction Fee} + \text{Allocated Freight Cost} + \text{Device Repair Cost}$$

### 3.2 Inventory Valuation (Capital Tied Up in Stock)
- **Wholesale Unsold Inventory Asset:**
  $$\text{Wholesale Unsold Stock} = \sum_{\text{deals}} \max(0, \text{deal.quantity} - \text{soldUnits}) \times (\text{averageBaseCost} + \text{shippingCostPerUnit})$$
- **Online Unsold Inventory Asset:**
  $$\text{Online Unsold Stock} = \sum_{\text{refurb\_stage} \neq \text{'SOLD'}} (\text{unit\_cost} + \text{logistics\_cost} + \text{repair\_cost})$$
- **Total Capital Locked in Inventory:**
  $$\mathbf{\text{Total Inventory Asset}} = \mathbf{\text{Wholesale Unsold Stock} + \text{Online Unsold Stock}}$$

### 3.3 Inventory Refurbishment Lifecycle & Aging
Units in local inventory move through 6 granular stages (`inventory_items.refurb_stage`):
1. `SEPARATED` — Harvested/split from wholesale batch for online/refurb stream.
2. `HANDED_TO_REFURBISH` — Assigned to technician for screen/battery/housing repair.
3. `QC_DONE` — Testing passed, awaiting packaging.
4. `READY_TO_SELL` — Packaged in stock, available for channel listing.
5. `ASSIGNED` — Allocated to an online order or wholesale invoice.
6. `SOLD` — Delivered, revenue recognized.

---

## 4. Sales, Invoicing & Accounts Receivable (AR)

### 4.1 Invoice Health & Payment Tracking
- Invoices are tracked in `invoices` with `status` $\in \{$`UNPAID`, `PARTIAL`, `PAID`, `OVERDUE`, `CANCELLED`$\}$.
- Individual client payments are logged in `payments` (supporting `CASH`, `BANK_TRANSFER`, `CHEQUE`, `CREDIT_CARD`).
- **Outstanding Accounts Receivable (AR):**
  $$\text{Total AR} = \sum_{\text{invoices}} \text{invoices.balance\_due} \quad (\text{where } \text{status} \notin \{\text{'CANCELLED'}, \text{'VOIDED'}\})$$

### 4.2 Customer Credit & Aging Metrics
- **Client Lifetime Revenue:** Aggregate sum of non-cancelled invoice totals per client.
- **Client Collection Ratio:** $\frac{\text{Total Amount Paid}}{\text{Total Amount Billed}} \times 100$.
- **Overdue Invoices:** Invoices where `balance_due > 0` and `due_date < CURRENT_DATE`.

---

## 5. Auction Decision Support & Risk Analysis

The ERP's data model provides full quantitative support for an **AI Auction Decision Engine**:

```
                         ┌─────────────────────────────┐
                         │   AUCTION BID OPPORTUNITY   │
                         │   Model: iPhone 15 Pro Max  │
                         │   Grade: A / Qty: 200 units │
                         └──────────────┬──────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
   [Purchasing Capacity]      [Historical Sales Price]    [Landed Cost & Fee]
   AMEX Avail: $210,000       Wholesale ASP: $740.00      Auction Fee: +2.5%
   Cash Avail:  $95,000       Online ASP:    $810.00      Est. Freight: $4.50/unit
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
                         ┌─────────────────────────────┐
                         │    AI BID RECOMMENDATION    │
                         │  Max Safe Bid: $680.00/unit │
                         │  Expected ROI: 12.4%        │
                         │  Cash Flow Risk: LOW        │
                         └─────────────────────────────┘
```

### Supported AI Decision Capabilities:
1. **Maximum Safe Auction Purchasing Budget:**
   $$\text{Max Safe Bid Total} = \text{AMEX Available} + \text{Cash Available} - \text{Upcoming AMEX Payoffs (Next 14 Days)}$$
2. **Expected Purchase ROI Evaluation:**
   Compare proposed bid price against historical actual selling prices (`invoice_line_items.unit_price`) and recent market closing prices (`att_closing_prices`).
3. **Historical Model Profitability:**
   Calculate historical Average Selling Price (ASP), Average Landed Cost, and Gross Margin % for any requested phone model, storage capacity, and cosmetic grade.
4. **Automated Risk Warnings:**
   - **Credit Utilization Warning:** Alert when AMEX deployed capital exceeds 85% of limit.
   - **Aging Stock Warning:** Alert when deals remain in `IN_TRANSIT` $>14$ days or in `IN_REPAIR` $>10$ days.
   - **Overdue Collection Warning:** Alert when top clients exceed credit terms $>30$ days.

---

## 6. Data Reliability & Audit Confidence Matrix

| Financial Metric | Source Tables | Calculation File | Reliability Rating | Verified Facts vs. Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Wholesale Revenue** | `invoices`, `clients` | `src/lib/accounting/actions.ts` | **100% (High)** | Verified. Excludes draft/cancelled invoices and internal test IDs. |
| **Wholesale COGS** | `invoice_line_items`, `deal_items`, `deals`, `shipments` | `src/lib/accounting/actions.ts` | **100% (High)** | Verified. Uses SKU-level base costs + fee allocation + freight per unit. |
| **Online P&L & Margins** | `online_orders`, `online_order_items`, `inventory_items` | `src/lib/accounting/actions.ts`, `src/lib/online-sales/actions.ts` | **100% (High)** | Verified. Tracks channel revenue, repair costs, base device costs, and net ROI. |
| **Operating Expenses** | `operating_expenses` | `src/lib/accounting/actions.ts` | **100% (High)** | Verified. Clean database ledger with 5-category classification. |
| **Consolidated Net Profit**| Multi-table join | `src/lib/accounting/actions.ts` | **100% (High)** | Verified. Mathematically reconciled: $\text{Gross Profit} + \text{AMEX} - \text{OPEX}$. |
| **AMEX Available Credit** | `deals`, `treasury_settings` | `src/lib/accounting/actions.ts`, `treasuryActions.ts` | **95% (High)** | Verified. Unclosed deals reduce available line; deals with explicit `amex_amount` are exact. |
| **Accounts Receivable** | `invoices` | `src/lib/accounting/actions.ts`, `src/lib/clients/actions.ts` | **100% (High)** | Verified. Exact sum of `balance_due`. |
| **Unsold Inventory Value**| `deals`, `invoice_line_items`, `inventory_items` | `src/lib/accounting/actions.ts` | **95% (High)** | Verified. Calculates residual unsold units $\times$ unit landed cost. |
| **Market Benchmark Prices**| `att_closing_prices` | `src/lib/analytics/attPriceActions.ts` | **90% (Good)** | Verified for logged AT&T auctions. Relies on regular market updates. |

---

## 7. Recommended AI Executive Assistant API Endpoints

To enable the AI Executive Assistant to query business data securely without modifying the database, we recommend building **8 dedicated read-only API endpoints** (or an MCP Server) that reuse verified ERP calculations:

```
[AI Executive Assistant] ──(Bearer Token)──► [Next.js AI API Layer (/api/ai/v1/...)]
                                                     │
                                                     ▼
                                     [Verified Server Actions & DB]
```

### 1. `GET /api/ai/v1/financial-summary`
- **Purpose:** Returns high-level company financial health.
- **Payload Data:** Consolidated Revenue, Wholesale Gross Profit, Online Gross Profit, Consolidated Gross Profit, AMEX Profit, Total OPEX, Consolidated Net Profit, Total Inventory Asset, Accounts Receivable, Liquid Cash (in USD & AED).

### 2. `GET /api/ai/v1/cash-position`
- **Purpose:** Returns real-time liquidity and treasury status.
- **Payload Data:** AMEX Limit, AMEX Stuck, AMEX Available, Cash Limit, Cash Stuck, Cash Available, Total Available Purchasing Power, Upcoming AMEX Statement Deadlines.

### 3. `GET /api/ai/v1/pnl?from_date=...&to_date=...`
- **Purpose:** Returns time-filtered P&L statement with category breakdown.
- **Payload Data:** Itemized revenue, COGS, logistics costs, OPEX categorized by Payroll/Rent/Software/Marketing/Other, channel margins.

### 4. `GET /api/ai/v1/receivables`
- **Purpose:** Returns customer debt and credit risk analysis.
- **Payload Data:** Total outstanding balance, overdue invoices list, aging buckets (0–30 days, 31–60 days, 60+ days), client collection ratios.

### 5. `GET /api/ai/v1/payables-obligations`
- **Purpose:** Returns upcoming financial obligations.
- **Payload Data:** AMEX settlement payoff schedule (grouped by month cycle), pending wire transfers, pending partner withdrawal requests.

### 6. `GET /api/ai/v1/inventory-health`
- **Purpose:** Returns stock levels and capital allocation.
- **Payload Data:** Total capital tied up in stock, stock count by model and cosmetic grade, units count by refurb stage (`HANDED_TO_REFURBISH`, `QC_DONE`, `READY_TO_SELL`), aging stock $>30$ days.

### 7. `GET /api/ai/v1/deal-profitability?deal_id=...`
- **Purpose:** Evaluates individual deal or historical model performance.
- **Payload Data:** Deal commitment, units sold, units unsold, revenue realized, landed COGS, gross margin %, deal ROI %, AMEX cashback earned.

### 8. `POST /api/ai/v1/evaluate-auction-bid`
- **Purpose:** Real-time auction bid simulator and risk check.
- **Request Body:** `{ model: string, storage: string, grade: string, quantity: number, proposed_unit_bid: number, funding_source: 'AMEX' | 'CASH_POOL' }`
- **Response Data:** Landed unit cost projection, historical average selling price (ASP), expected gross margin %, expected net profit, purchasing power compliance check (Pass/Fail), cash flow risk rating.

---

## 8. Security & Implementation Recommendations

1. **Strict Read-Only Enforcement:**
   - All AI API endpoints must only execute `SELECT` queries or read-only Server Actions (`getFinancialSummary`, `getTreasuryTransactions`, `getClients`, `getInvoices`, etc.).
   - Database user/role for external connections must have `REVOKE INSERT, UPDATE, DELETE, TRUNCATE`.
2. **Bearer Token Authentication:**
   - Secure all `/api/ai/v1/*` routes using a cryptographically random secret token (`AI_API_SECRET_KEY`) stored in `.env.local`.
3. **Localhost / Internal Binding:**
   - If the AI Executive Assistant runs on the same workstation, bind the API to `127.0.0.1` to prevent external network exposure.
4. **Next Steps:**
   - Review this audit document.
   - When ready, approve the creation of the dedicated `/api/ai/v1/` endpoint suite or MCP tool server.

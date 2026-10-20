# Mobitech AI Executive Assistant — Financial Safety Verification Report

**Document Title:** Financial Safety Verification, Data Grounding & Risk Audit  
**Target System:** Mobitech Master Wholesale ERP  
**Audit Date:** October 11, 2026  
**Auditor:** Antigravity AI Engineering  
**Mode:** Strict Read-Only Audit  

---

## Executive Summary
This document provides a forensic verification of the financial metrics, calculations, assumptions, and edge cases in the **Mobitech Master Wholesale ERP**. 

Its objective is to establish the exact reliability boundaries for the upcoming **AI Executive Assistant**, distinguishing **100% verified ground-truth financial data** from **modeled estimates and operational assumptions**.

---

## 1. AMEX Cashback Verification & Eligibility

### 1.1 Implementation & Logic
- **Source File:** `src/lib/accounting/actions.ts` (lines 148–155, 196) & `src/lib/deals/actions.ts`
- **Database Table:** `deals` (`cashback_received`, `cashback_amount`, `funding_source`, `amex_amount`, `total_commitment`)
- **Calculation Formula:**
  $$\text{If } \text{deal.cashback\_received} = \text{true} \text{ AND } \text{funding\_source} \in \{\text{'AMEX'}, \text{'MIXED'}\}:$$
  $$\text{AMEX Capital} = \text{deal.amex\_amount} \quad \text{or} \quad (\text{deal.total\_commitment} \times 0.5 \text{ if MIXED})$$
  $$\text{AMEX Profit Per Unit} = \frac{\text{AMEX Capital} \times 0.02}{\text{deal.quantity}}$$
  $$\text{Recognized AMEX Cashback} = \sum_{\text{sold units}} \text{quantity} \times \text{AMEX Profit Per Unit}$$

### 1.2 Verification Findings
| Aspect | Audit Finding | Classification |
| :--- | :--- | :--- |
| **Eligibility Verification** | Checked via boolean column `deals.cashback_received`. Must be explicitly set to `true` by an authorized admin. | **Verified Flag** |
| **Cashback Rate** | Hardcoded at **2.0%** (`amexAmount * 0.02`) in calculations. | **Modeled Estimate** |
| **Actual Cash Deposit** | The ERP does not link to live AMEX statement reward deposits. It assumes 2% cashback is realized once `cashback_received` is true. | **Operational Assumption** |
| **Recognition Timing** | Cashback is recognized **proportionally as units are sold on invoices**, rather than in a lump sum upon deal creation. | **GAAP Conservative Accrual** |

### 1.3 Identified Risks & Recommended Corrections
- **Risk:** If a deal earns 2.5%, $250 promotional credit, or tier bonuses, the 2.0% hardcoded formula slightly under-reports or miscalculates actual cashback.
- **Correction for AI Agent:** Provide a fallback check: if `deal.cashback_amount` is explicitly entered in the DB, use `deal.cashback_amount / deal.quantity` instead of hardcoded 2%.

---

## 2. Cash & AMEX Availability: Actual Balances vs. Estimates

### 2.1 Implementation & Logic
- **Source File:** `src/lib/accounting/actions.ts` (lines 448–461) & `src/lib/finance/actions.ts`
- **Database Tables:** `treasury_settings`, `deals`
- **Formulas:**
  $$\text{AMEX Available} = \text{treasury\_settings.amex\_limit (\$500k)} - \sum_{\text{status} \neq \text{'DEAL\_CLOSED'}} \text{deal.amex\_amount}$$
  $$\text{Cash Available} = \text{treasury\_settings.cash\_limit (\$300k)} - \sum_{\text{status} \neq \text{'DEAL\_CLOSED'}} \text{deal.cash\_amount}$$
  $$\text{Liquid Cash (Balance Sheet)} = \max(0, \text{Cash Available})$$

### 2.2 Verification Findings
| Metric | Real-World Reality | ERP Calculation Reality |
| :--- | :--- | :--- |
| **AMEX Limit (\$500,000)** | Actual credit line with American Express. | Static configured parameter in `treasury_settings`. |
| **Cash Limit (\$300,000)** | Total capital pool allocated (Turbo \$150k + SB \$150k). | Static configured parameter in `treasury_settings`. |
| **AMEX Stuck (Deployed)** | Credit currently committed in unclosed auction deals. | Dynamic query: sums `amex_amount` where `status != 'DEAL_CLOSED'`. |
| **Cash Stuck (Deployed)** | Cash currently committed in unclosed deals. | Dynamic query: sums `cash_amount` where `status != 'DEAL_CLOSED'`. |
| **Liquid Cash** | Physical cash in bank account. | **Derived Estimate:** $\text{Cash Limit} - \text{Cash Stuck}$. |

### 2.3 Identified Risks & Recommended Corrections
- **Risk (Partial Deal Payoffs):** If a deal is 90% sold and paid by customers, but the status is not yet switched to `DEAL_CLOSED`, the entire initial deal commitment remains classified as "stuck".
- **Risk (Bank Sync):** The ERP does not ingest bank feeds; cash collected from invoices increases liquid cash through deal completion rather than continuous bank sync.
- **Correction for AI Agent:** In AI cash flow reporting, label `Liquid Cash` and `AMEX Available` as **"Estimated Available Purchasing Capacity (Commitment-Based)"** and incorporate Accounts Receivable collections into short-term liquidity forecasts.

---

## 3. Financing Charges, Obligations, Collections & Transfers

### 3.1 Financing Charges (Interest & Fees)
- **Status:** **Manual / Untracked in Deal Headers**.
- **Details:** If AMEX balances carry over billing cycles and incur interest or bank wire fees, they are not automatically computed. They must be logged manually under `operating_expenses` (Category: `OTHER` or `SOFTWARE`).
- **AI Recommendation:** The AI Assistant should calculate an estimated financing cost alert if a deal's AMEX balance remains unpaid $>30$ days past statement closing.

### 3.2 Unpaid Obligations (Accounts Payable)
- **Status:** **Partially Modeled**.
- **Details:** The ERP models AMEX liabilities directly as `amexLiability = amexStuck`. Wholesale supplier purchases are assumed to be settled upfront at auction close via AMEX/Wire. Traditional net-30 supplier accounts payable are set to $0$ in the GAAP Balance Sheet.
- **AI Recommendation:** Explicitly treat `AMEX Statement Payoffs` as short-term accounts payable due on the 10th/11th of each monthly cycle.

### 3.3 Pending Collections (Accounts Receivable)
- **Status:** **100% Verified Ground Truth**.
- **Source:** `invoices` table (`balance_due` column across non-cancelled, non-voided invoices).
- **Reliability:** Highly accurate. Every invoice tracks `total_amount`, `amount_paid`, and `balance_due` updated via `payments` logging.

### 3.4 Inventory Transfers (Wholesale $\rightarrow$ Online)
- **Status:** **100% Verified & Segregated**.
- **Mechanism:**
  1. When SKUs move from a wholesale deal to online inventory (`moveSkuToOnlineInventory`), an internal transfer invoice is generated under internal client `4b6cd459-dd29-4be7-a28e-58cbbed31285` (`Internal - Online Inventory`).
  2. The internal client is strictly filtered out of Wholesale Revenue and Wholesale COGS (`client_id !== '4b6cd459-dd29-4be7-a28e-58cbbed31285'`).
  3. Transferred units are created in `inventory_items` inheriting exact `unit_cost = totalLandedCost`.
  4. Transferred units are counted in `dealSoldQuantities`, which correctly deducts them from wholesale unsold stock.

---

## 4. Cross-Operation Cost Integrity (Wholesale vs. Online)

### 4.1 Cost Attribution Matrix
```
┌──────────────────────────────┬──────────────────────────────┐
│       WHOLESALE DEALS        │     ONLINE (AMAZON/REVIBE)   │
├──────────────────────────────┼──────────────────────────────┤
│ • Base Device Cost           │ • Transferred Landed Cost    │
│ • Auction Fee Allocation     │ • Device Refurbishment Costs │
│ • Landed Shipping Allocation │ • Channel Logistics Cost     │
│                              │ • Platform & Marketing Fees  │
└──────────────────────────────┴──────────────────────────────┘
```

### 4.2 Audit of Double-Counting Safeguards
1. **Operating Expenses Isolation:**
   - General operating expenses (salaries, office rent, utilities) are deducted **once** at the consolidated level in `netProfit = grossProfit + amexProfit - totalOpex`.
   - `onlineOtherExpenses` only captures online-specific marketing and platform commission fees (`cat === 'MARKETING' || desc.includes('amazon') || desc.includes('revibe')`), preventing double-subtraction.
2. **Device Refurbishment Costs:**
   - Repair costs (\$1,981.20) are stored in `inventory_items.repair_cost`.
   - Included in Online COGS and subtracted from Online Gross Profit.
   - Completely excluded from Wholesale COGS.

---

## 5. Summary Matrix: Verified Metrics vs. Modeled Estimates

| Financial Metric | Audit Classification | Ground-Truth Basis | AI Executive Assistant Handling |
| :--- | :---: | :--- | :--- |
| **Wholesale Revenue** | **VERIFIED** | Real B2B invoices (`invoices.total_amount`). | Safe for automated executive reporting. |
| **Online Revenue** | **VERIFIED** | Real e-commerce orders (`online_orders.total_amount`). | Safe for automated executive reporting. |
| **Wholesale COGS** | **VERIFIED** | SKU costs + proportional fees + landed freight per unit. | Safe for automated executive reporting. |
| **Online COGS & Repairs** | **VERIFIED** | Base stock costs + logistics + repair costs. | Safe for automated executive reporting. |
| **Accounts Receivable (AR)**| **VERIFIED** | Sum of outstanding invoice balances (`balance_due`). | Safe for automated credit/cash flow alerts. |
| **Operating Expenses (OPEX)**| **VERIFIED** | Ledger entries in `operating_expenses`. | Safe for automated executive reporting. |
| **AMEX Cashback Earned** | **MODELED ESTIMATE** | Assumes 2.0% on AMEX deals with `cashback_received=true`. | Report as "Estimated Cashback Accrual (2.0%)". |
| **AMEX Available Credit** | **MODELED ESTIMATE** | \$500k limit minus open deal commitments. | Report as "Commitment-Based Available Credit". |
| **Liquid Cash Balance** | **MODELED ESTIMATE** | \$300k limit minus open deal cash commitments. | Report as "Derived Treasury Liquidity". |
| **AMEX Monthly Payoff Cycle**| **VERIFIED RULE** | 1st–11th vs 12th–31st cycle rules. | Safe for 10–30 day advance cash obligations alert. |
| **Unsold Inventory Asset** | **VERIFIED** | Residual units $\times$ unit landed cost + online stock. | Safe for asset valuation & balance sheet. |

---

## 6. Recommendations for AI Executive Assistant Integration

1. **Explicit Data Labeling in AI Responses:**
   - When reporting cash and purchasing power, instruct the AI to state:
     > *"Based on ERP deal commitments, estimated available purchasing power is \$X (\$Y AMEX + \$Z Cash Pool)."*
2. **Dynamic AMEX Payoff Alerts:**
   - Program the AI Assistant to monitor deal payment dates and issue alerts 7 days before the 10th of each month with the total required payoff sum.
3. **Threshold-Based Safety Guardrails:**
   - **Auction Bidding Cap:** Never recommend an auction bid exceeding `0.85 * (AMEX_Available + Cash_Available)`.
   - **Aging Inventory Warning:** Flag any deal where $>20\%$ of stock remains unsold $>30$ days post-arrival.
   - **Receivables Exposure Warning:** Flag any client whose unpaid balance exceeds \$50,000 or credit terms by $>15$ days.
4. **Read-Only API Layer:**
   - Expose these verified calculation models via the recommended `/api/ai/v1/` endpoints so the AI never performs unverified approximations.

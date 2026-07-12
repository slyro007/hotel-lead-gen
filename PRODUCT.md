# PRODUCT.md — Hotel Lead Gen

Operator tool for Longhorn Houses: find hotels in Dallas County worth an
acquisition conversation, and say **why** in one glance.

## The premise

Every Texas hotel self-reports quarterly room receipts and room counts to the
Comptroller. That's a public-ish income statement for ~800 Dallas County
properties. A "standard" hotel in a given comp set earns the comp-set median
revenue per available room (RevPAR). A hotel earning far below that median —
or sliding toward it quarter after quarter, or gone quiet entirely — has an
owner with a problem. Those are the leads.

## Product rules

1. **Verdict first.** Every hotel gets a lead score (0–100) and a one-line
   reason. The list ranks by score; the detail panel proves the number.
2. **Honest about estimates.** RevPAR here is *implied* from tax filings
   (receipts ÷ rooms ÷ days), not observed from a PMS. Rooms are self-reported.
   The UI says "implied," shows the inputs, and never fakes precision.
3. **Transparent scoring.** Each score decomposes into four visible components
   (underperformance / trend / distress / profile) with the raw inputs stored in
   `score_breakdown` — an operator can audit any number back to the filings.
4. **The export is the product.** The end state of a session is a CSV of
   scored hotels with owner names and mailing addresses, ready for outreach.
5. **Operator-grade, not consumer.** Dense tables, keyboard-friendly, no
   onboarding. One user (Danny) today; approval-gated Clerk auth for anyone else.

## The score (v1)

| Component | Max | Signal |
|---|---|---|
| Underperformance | 40 | trailing-4Q RevPAR index vs comp-set median (100 = at market) |
| Trend | 25 | YoY revenue change, 8-quarter RevPAR slope |
| Distress | 20 | stopped filing (closure), single-quarter collapse, weak post-2019 recovery |
| Profile | 15 | independent flag, 20–120 rooms, built pre-1990, low improvement value/room |

Labels: **≥70 hot** · **50–69 warm** · **<50 watch**. RevPAR index <75 wears an
"underperforming" badge.

## Not in v1 (roadmap)

Tax-delinquency signal (Dallas County tax office) · franchise-tax entity lookup
(taxpayer # → registered agent) · Tracerfy business skip-trace (needs the
business-leads add-on) · second market (new county filter, no schema change) ·
scripted SIFT downloads.

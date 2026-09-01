# Eval results

Date: 2026-09-02
ChatGPT desktop app (Windows), Free plan, Work mode, model GPT-5.6 Terra (Medium), site tools on
Live URL: https://countersign-theta.vercel.app at commit 809519c
Chrome 149+ with the WebMCP flag: not yet run

## Tool visibility

| Browser | On load | Invoice open | After Close |
| --- | --- | --- | --- |
| ChatGPT desktop (Site tools) | 4 | 13 | 4 |
| Chrome DevTools → Application → WebMCP | pending | pending | pending |

## Run 1: single prompts (before 809519c)

| # | Scenario | Result | Notes |
| --- | --- | --- | --- |
| 1 | queue_overview | pass | `get_review_summary`; reply "8 invoices waiting. Total value: $41,835.35. No high-severity flags." Exact. |
| 3 | qty_mismatch | partial | Match, vendor, and duplicate checks correct (120 vs 100). Asked in chat whether to flag and request a hold instead of calling `flag_issue` / `request_countersign`. No card. |
| 5 | duplicate | partial | Found INV-2291 as the approved duplicate with the right reasons. Said "do not pay" in chat; no flag, no card. |

Fix: tool descriptions now state that flagging and requesting a countersign are the normal next step and pay nothing by themselves; `open_invoice` returns a `review_flow` hint (commit 809519c).

## Run 2: whole queue in one prompt (after 809519c, fresh chat, Reset demo)

Prompt asked the agent to work the entire queue, highlight every cited number, flag every problem, propose GL codes where there is no PO, comment when out-of-band verification is needed, and request a countersign for each invoice. The reviewer clicked every card.

| Invoice | Scenario | Agent found | Tools used | Reviewer clicked | Result |
| --- | --- | --- | --- | --- | --- |
| INV-10231 | clean_approve | Clean: lines, totals, tax, bank, no duplicate | open, match, duplicates, vendor, evidence, countersign | Approve | pass |
| NP-88120 | qty_mismatch | Line 1 bills 120, receipt 100 | open, match, duplicates, vendor, evidence, flag, countersign | Hold | pass |
| LF-2026-0917 | price_variance | Line 1 above PO tolerance | open, match, duplicates, vendor, evidence, flag, comment, countersign | Hold | pass |
| 2291 | duplicate | Duplicate of approved INV-2291 | open, match, duplicates, vendor, evidence, flag, comment, countersign | Reject | pass |
| HOI-3391 | vendor_bank_change | Bank on document differs from vendor master | open, match, duplicates, vendor, lines, evidence, flag, comment, countersign | Hold | pass |
| CCS-77213 | non_po_gl | No PO; GL 6210 proposed for both lines; also flagged missing_po | open, match, duplicates, vendor, lines, evidence, flag, comment, GL coding, countersign | Hold | pass; Approve needed the missing_po issue waived first |
| NP-88131 | clean | Clean | open, match, duplicates, vendor, lines, evidence, countersign | Approve | pass |
| HOI-3402 | tax_rounding | Tax and total off by two cents | open, match, duplicates, vendor, lines, evidence, flag, comment, countersign | Hold | pass |

Scenario 9 (full_queue): pass. The agent moved through the queue with `next_invoice_id`, skipped the pre-approved INV-2291, waited for each click, and never reported an approval the reviewer had not clicked. Final agent summary matched the queue state: 2 approved, 5 held, 1 rejected.

Coverage: all 13 tools were called at least once across the two runs.

## Observations

- Terra defaults to asking permission in chat before write tools unless the descriptions say acting is expected. After 809519c it acted without prompting.
- One comment meant for LF-2026-0917 was posted after the agent had already opened the next invoice, so it landed on the wrong invoice; the agent noticed from `invoice_id` in the response and corrected it. Write tools target the invoice that is currently open; descriptions now say so.
- Every cited number was highlighted on the scan (`show_field_evidence`), including totals on the clean invoices.
- `request_countersign` resolved on the click each time; no 25-second timeouts were hit because the reviewer was at the screen.

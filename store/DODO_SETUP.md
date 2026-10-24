# CableMint digital-download checkout rollout

**Branch status:** staging only. Do not merge until all live Dodo payment links and digital-file entitlements work end-to-end.

## Approved source files

The seller has supplied these existing editable Excel workbooks. Keep them OUT of public GitHub and the static site:

1. Estimate + Profit Calculator — `CableMint_Estimate_Profit_Calculator_Digital_Download.zip`
2. Change Order Tracker — `CableMint_Change_Order_Tracker_Digital_Download.zip`
3. Complete Field Documentation System — `CableMint_Complete_Field_Documentation_Digital_Download.zip`
4. Estimating + Change Order Bundle — `CableMint_Estimating_Change_Order_Bundle_Digital_Download.zip`

Each ZIP contains `READ_ME_FIRST.txt` and the original workbook(s), unchanged.

## Dodo dashboard checklist

- Confirm merchant account and product category have live-mode approval.
- Create four **one-time payment** products, not subscriptions.
- Set the intended selling price/currency for each, matching the customer-facing prices.
- Attach the matching ZIP as a **digital file entitlement** (Dodo file delivery). Do not host customer download files on public GitHub.
- Set customer-support and refund-policy details; confirm the buyer receives a usable download email/link.
- Generate a dedicated live payment link for each product.
- Insert the four real, approved URLs into `store/index.html` > `dodoLinks` object.
- Verify live purchase, receipt, delivery, link expiration/retrieval, support, refunds and mobile checkout.
- Confirm the existing Pro subscriptions remain unaffected.
- Update homepage product CTAs to route to `/store/` or individual direct-checkout destinations only after testing.
- Add genuine Excel/Sheets screenshots to product pages and verify the screenshots depict the shipped files.
- GA4: `begin_checkout` event is emitted when buyer clicks a configured direct checkout link. Add verified server-side purchase attribution later; do not treat checkout clicks as paid orders.

## Important content reconciliation

The **Complete Field Documentation System** supplied for this release is ONE .xlsx workbook with ten worksheets. Older site copy describes `7 Spreadsheets`. Ensure descriptions match the actual file(s) delivered or obtain the missing separate files before publishing.

## Product links and Etsy

The staging store retains working Etsy links by default while Dodo URLs are blank. When direct links are configured, the direct link becomes primary and Etsy becomes a secondary option. Do not redirect an Etsy-origin buyer off Etsy to finish a transaction.

## Security

Never commit Dodo API keys, webhook signing secrets, Supabase service keys, or paid ZIP files to this repository. Use Dodo-hosted file fulfillment or another properly access-controlled delivery service.
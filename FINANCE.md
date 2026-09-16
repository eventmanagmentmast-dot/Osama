# Finance workflow

The Finance menu includes incoming invoices, accounting approvals, annual tax scenarios and statement reconciliation. Advances explicitly select a project and then that project's staff record.

## Invoice intake and approval

- PDFs are processed locally by bundled PDF.js 5.4.149 (Apache-2.0; see PDFJS-LICENSE.txt). No third-party document processing service is used.
- Labelled net, VAT and total amounts, VAT/withholding rates and e-Invoice/e-Archive document headings are suggested. Multiple or ambiguous amounts remain blank; no standard VAT rate is assumed.
- Image-only/scanned documents require manual entry. OCR and arbitrary invoice layouts are not supported. Maximum PDF size is 10 MB / 30 pages.
- Intake requires reviewed amounts and an explicit checkbox. The submit button sends the record to Accounting approvals, without creating an expense.
- Hosted field users can submit for assigned projects and see only their own submissions/documents. Administrators and finance users review, return with a reason, or approve. Decisions record identity and time. Approval atomically creates one expense and transfers attachment links; repeated approvals are rejected.
- e-Invoice and e-Archive are classifications of received documents. The application does not issue invoices or verify their validity with GİB.
- Net plus VAT must match the confirmed total. Withholding-adjusted payment totals are not yet supported by invoice intake; extracted withholding information is shown for review.
- Demo changes are temporary. Selected demo PDFs are processed on device and never uploaded or retained.

## Tax scenarios

Each saved scenario names a company and its 2026 annual period. Company/project accounting separation is not yet modelled, so annual revenue, costs and fiscal adjustments are reviewed inputs, not automatically consolidated project totals.

Sole proprietor and self-employment estimates use the GİB 2026 non-wage tariff. Limited and joint-stock companies require a confirmed tax rate. Special incentives, minimum corporate tax and distributions are outside this estimate. Credits reduce payable tax without reducing profit twice. Withholding on others' payments is shown separately; costs must include gross expenses. VAT is excluded from profit.

Source: https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv/yardim-kaynaklar/yararli-bilgiler/gelir-vergisi-tarifeleri/gelir-vergisi-tarifesi-2026.pdf

## Reconciliation

Choose a bank statement and an explicit installment-due date range. The screen compares the bank's entered balance, recorded installments and bank repayments, with linked invoiced/uninvoiced expenses and missing attachments. All projects for the selected card are included. The default range is the statement due month; adjust it to the bank's schedule. Fees, carryover, refunds and missing transactions can explain differences. Equal totals are not proof of transaction matching. Bank transaction-line import and live bank connectivity are not implemented. This report never adds a second expense for paying the card balance.

## Validation

## Partners (administrators only)

The partners dashboard tracks company ownership percentages, reviewed distributable-profit pools, dividend payments, contributions, drawings, expenses paid personally for the company, reimbursements and personal expenses paid by the company. Invoice evidence status and official accounting-posting status are separate. These records do not create duplicate operational expenses. Link a previously approved company expense when applicable. Historical payment records remain recorded amounts; changing ownership percentages recalculates the projected distribution, so keep the original resolution in the note. Non-admin roles cannot read or write partner datasets through the hosted data API.

Run `node test_finance.cjs`, `node test_logic.js`, `npm run test:cloud`, `python test_server.py`, and `npm run build`. Hosted integration tests cover field document isolation, assigned-project access, reviewer roles, return/resubmit and duplicate approval protection.

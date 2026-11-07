# Pay Records

What U.S. public companies told the SEC about executive pay, fiscal years 2021-2025: CEO pay, "compensation
actually paid," other named executives' average pay, and total shareholder return, for 1,904 companies
(7,985 company-years).

**Live site:** https://slriggss.github.io/pay-records/
**Repository:** https://github.com/slriggss/pay-records

Two pages: a report (`index.html`) with five findings and charts, and an explorer (`explorer.html`) that filters,
sorts and exports every company-year in the browser.

## What the report finds

- Median CEO pay across all filers fell from $7.1M (2021) to $5.0M (2025), but among the 1,063 companies that reported
  in all five years it rose from $7.2M to $8.1M. The fall is mostly smaller companies entering the data.
- Median CEO pay in 2024 runs from $2.3M at companies under $500M in revenue to $22.5M above $50B.
- In 2025, "actually paid" CEO pay is 5.7 times higher at the top return quartile than the bottom; reported total pay is 2.4 times higher.
- Industry and state medians, with the caveat that neither is adjusted for company size.

## Limits

Not the Fortune 500 (that list is licensed): this is every company whose pay-versus-performance table is tagged in the
SEC's data. The tagged table has CEO pay and the *average* of other named executives, not each executive's own pay.
Association, not cause. Smaller filer errors than the ones cleaned below would remain; figures were not checked against each
proxy statement by hand. See "About the data" on the report page.

## Coverage gap, and the fix

The SEC's bulk XBRL "frames" API drops dimension-tagged values, so the first pull had CEO pay for only about 65% of
company-years (5,021 of 7,772). `scripts/fetch_proxy.js` reads the pay-versus-performance table straight from each affected
company's two latest DEF 14A inline-XBRL filings, and `scripts/merge_proxy.js` fills only values the first pull left empty.
CEO pay is now present for 99% of company-years (7,926 of 7,985).

Cleaning rules: where a company reports several CEOs in a year the highest-paid is used and the row marked; executives
listed at $0 for years they did not serve are ignored; six companies whose own filings are mis-scaled by a factor of 1,000
(American Outdoor Brands, LeMaitre Vascular, OneSpaWorld Holdings, Sutro Biopharma, U-Haul Holding Company, Worthington
Enterprises) have pay blanked; $0 CEO pay is kept but left out of medians; return values above $20,000 per $100 are blanked.

## Files

| File | What it does |
|---|---|
| `index.html`, `explorer.html` | The two pages. |
| `css/style.css`, `js/*.js` | Styles, theme toggle, charts (Chart.js), explorer logic. |
| `scripts/fetch_sec.js` | Pulls SEC frames and per-company submissions into `data/raw/`. |
| `scripts/build_panel.js` | Merges them into `data/panel.json` (the first pull). |
| `scripts/fetch_proxy.js` | Reads DEF 14A inline XBRL for companies with gaps into `data/raw/proxy/`. |
| `scripts/merge_proxy.js` | Fills the gaps in `data/panel.json`. |
| `scripts/build_site_data.js` | Applies the cleaning rules; writes `data/site_data.json` and `data/findings.json` (every number on the report). |

Rebuild (Node 18+; the SEC requires a contact string in the User-Agent):

```
export SEC_USER_AGENT="Your Name you@example.com"
node scripts/fetch_sec.js
node scripts/build_panel.js
node scripts/fetch_proxy.js
node scripts/merge_proxy.js
node scripts/build_site_data.js
```

Data: SEC EDGAR. Built by Shelby L. Riggs with Claude Code.

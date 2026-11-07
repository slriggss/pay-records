// Merges ECD frames + revenue + submissions metadata into data/panel.json
const fs = require('fs'), path = require('path');
const RAW = path.join(__dirname, '..', 'data', 'raw');
const YEARS = [2021, 2022, 2023, 2024, 2025];
const FIELDS = { PeoTotalCompAmt: 'ceo', PeoActuallyPaidCompAmt: 'ceoCap', NonPeoNeoAvgTotalCompAmt: 'neo', NonPeoNeoAvgCompActuallyPaidAmt: 'neoCap', TotalShareholderRtnAmt: 'tsr' };
const REV = ['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet','RevenuesNetOfInterestExpense'];
const rd = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).data : [];
const rows = new Map(); // `${cik}|${y}`
const row = (cik, y) => { const k = cik + '|' + y; if (!rows.has(k)) rows.set(k, { cik, year: y }); return rows.get(k); };
for (const y of YEARS) {
  for (const [tag, key] of Object.entries(FIELDS)) for (const d of rd(path.join(RAW, `ecd_${tag}_CY${y}.json`))) {
    const r = row(d.cik, y); r[key] = d.val; r.fyEnd = r.fyEnd || d.end; r.name = d.entityName;
  }
  for (const t of REV) for (const d of rd(path.join(RAW, `rev_${t}_CY${y}.json`))) {
    const r = rows.get(d.cik + '|' + y); if (r && (r.rev == null || d.val > r.rev)) r.rev = d.val;
  }
}
const meta = {};
for (const f of fs.readdirSync(path.join(RAW, 'sub'))) {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, 'sub', f)));
  meta[+j.cik] = { ticker: (j.tickers || [])[0] || null, sic: j.sic, industry: j.sicDescription, hqState: j.addresses?.business?.stateOrCountry || null, incState: j.stateOfIncorporation || null, exchange: (j.exchanges || [])[0] || null, category: j.category };
}
const out = [];
for (const r of rows.values()) {
  if (r.ceo == null && r.neo == null) continue;
  out.push({ ...r, ...(meta[r.cik] || {}) });
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'panel.json'), JSON.stringify(out));
const by = {}; for (const r of out) { by[r.year] = by[r.year] || { n: 0, ceo: 0, neo: 0, rev: 0, both: 0 }; const b = by[r.year]; b.n++; if (r.ceo != null) b.ceo++; if (r.neo != null) b.neo++; if (r.rev != null) b.rev++; if (r.ceo != null && r.neo != null) b.both++; }
console.table(by);
console.log('company-years', out.length, 'companies', new Set(out.map(r => r.cik)).size);
const big = out.filter(r => r.year === 2024 && r.rev).sort((a, b) => b.rev - a.rev);
console.log('2024 w/ revenue', big.length, 'top-500 revenue floor $B', (big[499]?.rev / 1e9).toFixed(2), 'ceo in top500', big.slice(0,500).filter(r=>r.ceo!=null).length);
console.log(big.slice(0, 8).map(r => `${r.name} ${(r.rev/1e9).toFixed(0)}B ceo=${r.ceo} ${r.hqState} ${r.industry}`).join('\n'));
const st = {}; for (const r of out.filter(r=>r.year===2024)) st[r.hqState] = (st[r.hqState]||0)+1; console.log(Object.entries(st).sort((a,b)=>b[1]-a[1]).slice(0,15).map(e=>e.join(':')).join(' '));

// Merges data/raw/proxy/*.json (pay-vs-performance facts read from DEF 14A inline XBRL) into
// data/panel.json. Only fills fields the SEC frames pull left empty; never overwrites a frames value.
// When a company reports several PEOs (CEO transitions) in one year, the PEO with the highest
// total pay is used and ceoN records how many were reported.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PROXY = path.join(ROOT, 'data', 'raw', 'proxy');
const panel = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'panel.json'), 'utf8'));
const YEARS = [2021, 2022, 2023, 2024, 2025];
const FIELD = { PeoTotalCompAmt: 'ceo', PeoActuallyPaidCompAmt: 'ceoCap', NonPeoNeoAvgTotalCompAmt: 'neo', NonPeoNeoAvgCompActuallyPaidAmt: 'neoCap', TotalShareholderRtnAmt: 'tsr' };
const OKDIM = d => /^ecd:(IndividualAxis|ExecutiveCategoryAxis)=/.test(d);
const DAY = 864e5;
const yearOf = (s, e) => {
  const a = Date.parse(s), b = Date.parse(e), len = (b - a) / DAY;
  if (len < 300 || len > 400) return null;
  return new Date((a + b) / 2).getUTCFullYear();
};

const byKey = new Map(panel.map(r => [r.cik + '|' + r.year, r]));
const meta = {};
for (const r of panel) if (!meta[r.cik]) meta[r.cik] = r;
let filled = { ceo: 0, ceoCap: 0, neo: 0, neoCap: 0, tsr: 0 }, added = 0, multi = 0, companies = 0;

for (const f of fs.readdirSync(PROXY)) {
  const j = JSON.parse(fs.readFileSync(path.join(PROXY, f), 'utf8'));
  if (!j.facts.length) continue;
  companies++;
  // newest filing first, so the latest restated number wins
  const facts = j.facts.filter(x => x.dims.every(OKDIM)).sort((a, b) => b.filed.localeCompare(a.filed));
  for (const y of YEARS) {
    const inYear = facts.filter(x => yearOf(x.start, x.end) === y);
    if (!inYear.length) continue;
    const newest = inYear[0].filed;
    const fy = inYear.filter(x => x.filed === newest);
    const end = fy[0].end;
    // PEOs
    const totals = fy.filter(x => x.tag === 'PeoTotalCompAmt');
    const members = new Map();
    for (const t of totals) { const k = t.dims.join(';'); if (!members.has(k) || t.v > members.get(k)) members.set(k, t.v); }
    // Former/future PEOs appear in the 5-year table with $0 in years they did not serve; ignore them
    // unless every PEO is $0 (externally managed or unpaid CEO).
    if ([...members.values()].some(v => v > 0)) for (const [k, v] of [...members]) if (v <= 0) members.delete(k);
    const vals = {};
    if (members.size) {
      let best = null;
      for (const [k, v] of members) if (best == null || v > best[1]) best = [k, v];
      vals.ceo = best[1];
      const caps = fy.filter(x => x.tag === 'PeoActuallyPaidCompAmt');
      const match = caps.find(c => c.dims.join(';') === best[0]) || (new Set(members.values()).size === 1 ? caps[0] : caps.find(c => !c.dims.length));
      if (match) vals.ceoCap = match.v;
      vals.ceoN = new Set(members.values()).size;
    }
    for (const tag of ['NonPeoNeoAvgTotalCompAmt', 'NonPeoNeoAvgCompActuallyPaidAmt', 'TotalShareholderRtnAmt']) {
      const x = fy.find(z => z.tag === tag && !z.dims.length) || fy.find(z => z.tag === tag);
      if (x) vals[FIELD[tag]] = x.v;
    }
    if (!Object.keys(vals).length) continue;
    let row = byKey.get(j.cik + '|' + y);
    if (!row) {
      const m = meta[j.cik];
      if (!m) continue;
      row = { cik: j.cik, year: y, fyEnd: end, name: m.name, ticker: m.ticker, sic: m.sic, industry: m.industry, hqState: m.hqState, incState: m.incState, exchange: m.exchange, category: m.category };
      panel.push(row); byKey.set(j.cik + '|' + y, row); added++;
    }
    let touched = false;
    for (const [k, v] of Object.entries(vals)) {
      if (k === 'ceoN') continue;
      if (row[k] == null) { row[k] = v; filled[k]++; touched = true; }
    }
    if (touched) { row.src = 'proxy'; if (vals.ceoN) { row.ceoN = vals.ceoN; if (vals.ceoN > 1) multi++; } }
  }
}
fs.writeFileSync(path.join(ROOT, 'data', 'panel.json'), JSON.stringify(panel));
console.log({ companies, added, filled, multiPeoYears: multi, rows: panel.length });
const by = {};
for (const r of panel) { const b = by[r.year] = by[r.year] || { n: 0, ceo: 0, neo: 0 }; b.n++; if (r.ceo != null) b.ceo++; if (r.neo != null) b.neo++; }
console.table(by);

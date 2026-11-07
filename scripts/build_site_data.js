// Builds the two files the site reads from data/panel.json:
//   data/site_data.json  one row per company-year (columnar), for the explorer table and its charts
//   data/findings.json   every number quoted on the report page
// Cleaning rules (also stated on the page):
//  * A CEO pay figure of $1 billion or more is treated as a filer scaling error (the company's own
//    XBRL tags the table in the wrong units): pay fields for that company-year are blanked and flagged.
//  * A CEO pay figure of $0 is kept but excluded from medians: it means the company paid its CEO nothing
//    (externally managed REITs, unpaid founders), not that pay was missing.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const panel = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'panel.json'), 'utf8'));
const YEARS = [2021, 2022, 2023, 2024, 2025];

function group(sic) {
  const s = parseInt(sic, 10);
  if (!s) return 'Unclassified';
  if ([2834, 2835, 2836, 8731, 8071].includes(s)) return 'Pharma, biotech & life sciences';
  if (s >= 3840 && s <= 3845) return 'Medical devices';
  if (s >= 3570 && s <= 3579 || s >= 3670 && s <= 3679 || s === 3674) return 'Computers & electronics';
  if (s >= 7370 && s <= 7379) return 'Software & IT services';
  if (s === 6798) return 'REITs';
  if (s >= 6020 && s <= 6099 || s >= 6100 && s <= 6199) return 'Banks & lenders';
  if (s >= 6200 && s <= 6299 || s >= 6700 && s <= 6799) return 'Asset managers & investment firms';
  if (s >= 6300 && s <= 6499) return 'Insurance';
  if (s >= 6500 && s <= 6599) return 'Real estate';
  if (s >= 4900 && s <= 4999) return 'Utilities';
  if (s >= 1300 && s <= 1389 || s >= 2900 && s <= 2999) return 'Oil, gas & energy';
  if (s >= 5200 && s <= 5999) return 'Retail & wholesale';
  if (s >= 2000 && s <= 3999) return 'Other manufacturing';
  if (s >= 4000 && s <= 4899) return 'Transportation & communications';
  if (s >= 7000 && s <= 8999) return 'Other services';
  if (s < 1000) return 'Agriculture & mining';
  if (s < 2000) return 'Mining & construction';
  return 'Other';
}

const rows = [];
const scaleErr = new Set();
for (const r of panel) {
  const o = { ...r, group: group(r.sic), flag: '' };
  if (o.ceo != null && o.ceo >= 1e9) {
    o.flag = 'scale'; scaleErr.add(o.name);
    o.ceo = o.ceoCap = o.neo = o.neoCap = null;
  } else if (o.ceo === 0) o.flag = 'zero';
  if (o.tsr != null && o.tsr > 20000) { o.tsr = null; o.flagTsr = 1; }
  rows.push(o);
}
rows.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year);

// ---- columnar site data ----
const cols = ['cik', 'name', 'ticker', 'year', 'fyEnd', 'ceo', 'ceoCap', 'neo', 'neoCap', 'tsr', 'rev', 'group', 'hqState', 'industry', 'ceoN', 'flag', 'src'];
const out = { cols, years: YEARS, rows: rows.map(r => cols.map(c => r[c] == null ? null : r[c])) };
fs.writeFileSync(path.join(ROOT, 'data', 'site_data.json'), JSON.stringify(out));

// ---- findings ----
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const med = a => q(a, 0.5);
const pos = (r, k) => r[k] != null && r[k] > 0;
const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const rk = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) rk[idx[k][1]] = r; i = j + 1; } return rk; };
const pearson = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const spearman = (x, y) => pearson(rank(x), rank(y));

const F = { generated: new Date().toISOString().slice(0, 10), cleaning: { scaleErrorCompanies: [...scaleErr].sort(), scaleErrorRows: rows.filter(r => r.flag === 'scale').length, zeroRows: rows.filter(r => r.flag === 'zero').length } };
F.rows = rows.length; F.companies = new Set(rows.map(r => r.cik)).size;
F.coverage = YEARS.map(y => { const a = rows.filter(r => r.year === y); return { year: y, n: a.length, ceo: a.filter(r => r.ceo != null).length, neo: a.filter(r => r.neo != null).length, rev: a.filter(r => r.rev != null).length, multiPeo: a.filter(r => r.ceoN > 1).length }; });

// balanced panel: companies with positive CEO pay in all five years, so the trend is not just new filers joining
const full = new Map();
for (const r of rows) if (pos(r, 'ceo')) full.set(r.cik, (full.get(r.cik) || 0) + 1);
const balanced = new Set([...full].filter(([, n]) => n === YEARS.length).map(([c]) => c));
F.balanced = { companies: balanced.size, byYear: YEARS.map(y => { const a = rows.filter(r => r.year === y && balanced.has(r.cik) && pos(r, 'ceo')).map(r => r.ceo); return { year: y, n: a.length, median: med(a), p25: q(a, .25), p75: q(a, .75) }; }) };
F.tsrBlanked = rows.filter(r => r.flagTsr).length;

F.byYear = YEARS.map(y => {
  const a = rows.filter(r => r.year === y && pos(r, 'ceo')).map(r => r.ceo);
  const n = rows.filter(r => r.year === y && pos(r, 'neo')).map(r => r.neo);
  const cap = rows.filter(r => r.year === y && r.ceoCap != null && r.ceo > 0).map(r => r.ceoCap);
  const ratio = rows.filter(r => r.year === y && pos(r, 'ceo') && pos(r, 'neo')).map(r => r.ceo / r.neo);
  return { year: y, n: a.length, p25: q(a, .25), median: med(a), p75: q(a, .75), neoMedian: med(n), capMedian: med(cap), ratioMedian: med(ratio) };
});

// size: revenue buckets, using the company's own revenue in that year
const BUCKETS = [['Under $500M', 0, 5e8], ['$500M–$2B', 5e8, 2e9], ['$2B–$10B', 2e9, 1e10], ['$10B–$50B', 1e10, 5e10], ['$50B and over', 5e10, Infinity]];
F.sizeYear = 2024;
F.bySize = BUCKETS.map(([label, lo, hi]) => {
  const a = rows.filter(r => r.year === 2024 && pos(r, 'ceo') && r.rev != null && r.rev >= lo && r.rev < hi);
  return { label, n: a.length, p25: q(a.map(r => r.ceo), .25), median: med(a.map(r => r.ceo)), p75: q(a.map(r => r.ceo), .75), neoMedian: med(a.filter(r => pos(r, 'neo')).map(r => r.neo)) };
});
{
  const a = rows.filter(r => r.year === 2024 && pos(r, 'ceo') && r.rev > 0);
  F.sizeCorr = { n: a.length, spearman: spearman(a.map(r => r.rev), a.map(r => r.ceo)), withRevenue: a.length, outOfCeo2024: rows.filter(r => r.year === 2024 && pos(r, 'ceo')).length };
}

// pay-for-performance (2025 window): TSR is the value of $100 invested at the start of the five-year table
{
  const a = rows.filter(r => r.year === 2025 && pos(r, 'ceo') && r.ceoCap != null && r.ceoCap > 0 && r.tsr > 0);
  const ratio = a.map(r => r.ceoCap / r.ceo);
  F.pfp = {
    year: 2025, n: a.length,
    spearmanTsrVsCapRatio: spearman(a.map(r => r.tsr), ratio),
    spearmanTsrVsSct: spearman(a.map(r => r.tsr), a.map(r => r.ceo)),
    spearmanTsrVsCap: spearman(a.map(r => r.tsr), a.map(r => r.ceoCap)),
    capAboveSct: ratio.filter(x => x > 1).length / ratio.length,
    quartiles: [0, 1, 2, 3].map(k => {
      const sorted = a.slice().sort((x, y) => x.tsr - y.tsr), n = sorted.length, part = sorted.slice(Math.floor(n * k / 4), Math.floor(n * (k + 1) / 4));
      return { q: k + 1, n: part.length, tsrMin: part[0].tsr, tsrMax: part[part.length - 1].tsr, sctMedian: med(part.map(r => r.ceo)), capMedian: med(part.map(r => r.ceoCap)), ratioMedian: med(part.map(r => r.ceoCap / r.ceo)) };
    }),
  };
}

const MINN = 25;
const groupBy = (key, year) => {
  const m = new Map();
  for (const r of rows.filter(r => r.year === year && pos(r, 'ceo') && r[key])) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r.ceo); }
  return [...m].filter(([, v]) => v.length >= MINN).map(([k, v]) => ({ key: k, n: v.length, median: med(v), p25: q(v, .25), p75: q(v, .75) })).sort((a, b) => b.median - a.median);
};
F.byIndustry = groupBy('group', 2024);
F.byState = groupBy('hqState', 2024);
F.minN = MINN;

// multi-PEO years and co-CEO share, for the limits box
F.multiPeoShare2025 = F.coverage.find(c => c.year === 2025).multiPeo / F.coverage.find(c => c.year === 2025).ceo;

fs.writeFileSync(path.join(ROOT, 'data', 'findings.json'), JSON.stringify(F, null, 1));
console.log(JSON.stringify({ cleaning: F.cleaning, rows: F.rows, companies: F.companies }, null, 1));
console.table(F.coverage);
console.table(F.byYear.map(r => ({ ...r, p25: Math.round(r.p25), median: Math.round(r.median), p75: Math.round(r.p75), neoMedian: Math.round(r.neoMedian), capMedian: Math.round(r.capMedian), ratioMedian: +r.ratioMedian.toFixed(2) })));
console.log('balanced', F.balanced.companies); console.table(F.balanced.byYear.map(r=>({...r,median:Math.round(r.median),p25:Math.round(r.p25),p75:Math.round(r.p75)}))); console.log('tsr blanked',F.tsrBlanked);
console.table(F.bySize.map(r => ({ ...r, p25: Math.round(r.p25), median: Math.round(r.median), p75: Math.round(r.p75), neoMedian: Math.round(r.neoMedian) })));
console.log('sizeCorr', F.sizeCorr);
console.log('pfp', JSON.stringify(F.pfp, null, 1));
console.table(F.byIndustry.map(r => ({ key: r.key, n: r.n, median: Math.round(r.median) })));
console.table(F.byState.slice(0, 8).map(r => ({ key: r.key, n: r.n, median: Math.round(r.median) })));
console.table(F.byState.slice(-5).map(r => ({ key: r.key, n: r.n, median: Math.round(r.median) })));
console.log('file size', (fs.statSync(path.join(ROOT, 'data', 'site_data.json')).size / 1e6).toFixed(2), 'MB');

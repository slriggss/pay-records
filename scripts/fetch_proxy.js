// Fills the XBRL-frames gap: the frames API drops dimension-tagged facts, so CEO (PEO) pay is
// missing whenever a company tags its PEO(s) with ecd:IndividualAxis. This script reads the
// pay-versus-performance table straight out of each company's two most recent DEF 14A inline-XBRL
// filings and saves a compact per-company result to data/raw/proxy/<cik>.json.
// SEC fair-access: <=10 req/s with a descriptive User-Agent (we stay near 5 req/s).
const fs = require('fs'), path = require('path');
const UA = process.env.SEC_USER_AGENT; // SEC fair access needs contact info: set SEC_USER_AGENT="Your Name you@example.com"
if (!UA) { console.error('Set SEC_USER_AGENT to "Your Name you@example.com" (SEC fair-access policy).'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'raw', 'proxy');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAGS = ['PeoTotalCompAmt', 'PeoActuallyPaidCompAmt', 'NonPeoNeoAvgTotalCompAmt', 'NonPeoNeoAvgCompActuallyPaidAmt', 'TotalShareholderRtnAmt'];

async function get(url, json) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) });
      if (r.status === 404) return null;
      if (r.ok) return json ? r.json() : r.text();
    } catch (e) { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}

const attr = (s, n) => { const m = s.match(new RegExp('\\b' + n + '="([^"]*)"')); return m ? m[1] : null; };

function parseDoc(html) {
  const ctx = {};
  const re = /<(?:\w+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?context>/g;
  let m;
  while ((m = re.exec(html))) {
    const b = m[2];
    const s = b.match(/startDate>\s*([\d-]+)/), e = b.match(/endDate>\s*([\d-]+)/);
    if (!s || !e) continue;
    const dims = [];
    const dre = /<(?:\w+:)?(?:explicitMember|typedMember)\b[^>]*dimension="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:explicitMember|typedMember)>/g;
    let d;
    while ((d = dre.exec(b))) dims.push(d[1] + '=' + d[2].replace(/<[^>]+>/g, '').trim());
    ctx[m[1]] = { start: s[1], end: e[1], dims };
  }
  const facts = [];
  const fre = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g;
  while ((m = fre.exec(html))) {
    const a = m[1], name = attr(a, 'name');
    if (!name || !name.startsWith('ecd:')) continue;
    const tag = name.slice(4);
    if (!TAGS.includes(tag)) continue;
    const c = ctx[attr(a, 'contextRef')];
    if (!c) continue;
    const fmt = attr(a, 'format') || '';
    let txt = m[2].replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;|\s/g, '');
    let v;
    if (/fixed-zero|zerodash|fixed-empty/.test(fmt) || txt === '' || /^[-—–]+$/.test(txt)) v = 0;
    else {
      txt = /comma-decimal|numcommadecimal/.test(fmt) ? txt.replace(/\./g, '').replace(',', '.') : txt.replace(/,/g, '');
      v = parseFloat(txt);
      if (!isFinite(v)) continue;
    }
    v *= Math.pow(10, parseInt(attr(a, 'scale') || '0', 10));
    if (attr(a, 'sign') === '-') v = -v;
    facts.push({ tag, v, start: c.start, end: c.end, dims: c.dims });
  }
  return facts;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2).map(Number);
  const panel = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'panel.json'), 'utf8'));
  const by = {};
  for (const r of panel) (by[r.cik] = by[r.cik] || []).push(r);
  let ciks = Object.keys(by).filter(c => by[c].some(r => r.ceo == null)).map(Number);
  if (only.length) ciks = only;
  console.log('companies to fetch:', ciks.length);
  let n = 0, nofiling = 0;
  const queue = ciks.slice();
  const worker = async () => {
    while (queue.length) {
      const cik = queue.shift(), file = path.join(OUT, String(cik).padStart(10, '0') + '.json');
      if (fs.existsSync(file)) { n++; continue; }
      const sub = await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, true);
      await sleep(200);
      const res = { cik, filings: [], facts: [] };
      if (sub) {
        const r = sub.filings.recent, docs = [];
        r.form.forEach((f, i) => { if (f === 'DEF 14A') docs.push({ date: r.filingDate[i], acc: r.accessionNumber[i], doc: r.primaryDocument[i] }); });
        docs.sort((a, b) => b.date.localeCompare(a.date));
        for (const d of docs.slice(0, 2)) {
          const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${d.acc.replace(/-/g, '')}/${d.doc}`;
          const html = await get(url, false);
          await sleep(200);
          if (!html) continue;
          const f = parseDoc(html);
          res.filings.push({ date: d.date, acc: d.acc, doc: d.doc, nFacts: f.length });
          for (const x of f) res.facts.push({ ...x, filed: d.date });
        }
      }
      if (!res.facts.length) nofiling++;
      fs.writeFileSync(file, JSON.stringify(res));
      if (++n % 25 === 0) console.log(n, '/', ciks.length, 'no-facts so far:', nofiling);
    }
  };
  await Promise.all([1, 2, 3, 4].map(worker));
  console.log('done', n, 'no-facts', nofiling);
}
main().catch(e => { console.error(e); process.exit(1); });

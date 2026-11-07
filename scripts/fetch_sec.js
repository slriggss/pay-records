// Pulls SEC ECD (pay-vs-performance) + revenue frames and per-company metadata.
// SEC fair-access: <=10 req/s with a descriptive User-Agent.
const fs = require('fs'), path = require('path');
const UA = process.env.SEC_USER_AGENT; // SEC fair access needs contact info: set SEC_USER_AGENT="Your Name you@example.com"
if (!UA) { console.error('Set SEC_USER_AGENT to "Your Name you@example.com" (SEC fair-access policy).'); process.exit(1); }
const RAW = path.join(__dirname, '..', 'data', 'raw');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const YEARS = [2021, 2022, 2023, 2024, 2025];
const ECD = ['PeoTotalCompAmt','PeoActuallyPaidCompAmt','NonPeoNeoAvgTotalCompAmt','NonPeoNeoAvgCompActuallyPaidAmt','TotalShareholderRtnAmt'];
const REV = ['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet','RevenuesNetOfInterestExpense'];

async function get(url, file) {
  if (file && fs.existsSync(file) && fs.statSync(file).size > 50) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    if (r.status === 404) return null;
    if (r.ok) { const t = await r.text(); if (file) fs.writeFileSync(file, t); await sleep(150); return JSON.parse(t); }
    await sleep(1000 * (i + 1));
  }
  throw new Error('failed ' + url);
}
(async () => {
  for (const y of YEARS) {
    for (const t of ECD) await get(`https://data.sec.gov/api/xbrl/frames/ecd/${t}/USD/CY${y}.json`, path.join(RAW, `ecd_${t}_CY${y}.json`));
    for (const t of REV) await get(`https://data.sec.gov/api/xbrl/frames/us-gaap/${t}/USD/CY${y}.json`, path.join(RAW, `rev_${t}_CY${y}.json`));
  }
  const ciks = new Set();
  for (const f of fs.readdirSync(RAW)) if (f.startsWith('ecd_PeoTotal')) for (const d of JSON.parse(fs.readFileSync(path.join(RAW, f))).data) ciks.add(d.cik);
  for (const f of fs.readdirSync(RAW)) if (f.startsWith('ecd_NonPeo')) for (const d of JSON.parse(fs.readFileSync(path.join(RAW, f))).data) ciks.add(d.cik);
  fs.mkdirSync(path.join(RAW, 'sub'), { recursive: true });
  let n = 0;
  for (const c of ciks) {
    const id = String(c).padStart(10, '0'), file = path.join(RAW, 'sub', id + '.json');
    if (!fs.existsSync(file)) {
      const j = await get(`https://data.sec.gov/submissions/CIK${id}.json`);
      if (j) { delete j.filings; fs.writeFileSync(file, JSON.stringify(j)); }
    }
    if (++n % 200 === 0) console.log('submissions', n, '/', ciks.size);
  }
  console.log('done', ciks.size, 'companies');
})().catch(e => { console.error(e); process.exit(1); });

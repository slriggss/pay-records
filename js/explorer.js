// The Explorer page: loads data/site_data.json and filters, sorts, summarizes and exports it in the browser.
(function () {
  const $ = (id) => document.getElementById(id);
  const PAGE = 200;
  const state = { year: '2025', group: '', hq: '', text: '', sort: 'ceo', dir: -1, shown: PAGE };
  let COLS = {}, ROWS = [], view = [], YEARS = [];

  const usd = (v) => v == null ? '' : (Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v).toLocaleString());
  const med = (a) => { if (!a.length) return null; a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g = (r, k) => r[COLS[k]];
  const note = (r) => { const n = []; if (g(r, 'flag') === 'scale') n.push('scale error'); if (g(r, 'flag') === 'zero') n.push('$0 pay'); if (g(r, 'ceoN') > 1) n.push('2+ CEOs'); return n.join(', '); };

  function applyFilters() {
    const t = state.text.trim().toLowerCase();
    view = ROWS.filter((r) => (state.year === 'all' || String(g(r, 'year')) === state.year)
      && (!state.group || g(r, 'group') === state.group)
      && (!state.hq || g(r, 'hqState') === state.hq)
      && (!t || (g(r, 'name') || '').toLowerCase().includes(t) || (g(r, 'ticker') || '').toLowerCase() === t));
    const k = COLS[state.sort], d = state.dir;
    view.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1; // blanks last either way
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * d;
    });
    render();
  }

  function render() {
    $('stat-n').textContent = view.length.toLocaleString();
    $('stat-ceo').textContent = usd(med(view.filter((r) => g(r, 'ceo') > 0).map((r) => g(r, 'ceo')))) || '–';
    $('stat-cap').textContent = usd(med(view.filter((r) => g(r, 'ceo') > 0 && g(r, 'ceoCap') != null).map((r) => g(r, 'ceoCap')))) || '–';
    $('stat-neo').textContent = usd(med(view.filter((r) => g(r, 'neo') != null && g(r, 'neo') > 0).map((r) => g(r, 'neo')))) || '–';
    const shown = view.slice(0, state.shown);
    $('result-count').textContent = view.length ? 'Showing ' + shown.length.toLocaleString() + ' of ' + view.length.toLocaleString() + ' company-years. Medians exclude blanks and $0 CEO pay.' : 'No company-years match these filters.';
    $('table-body').innerHTML = shown.map((r) => '<tr>'
      + '<td>' + esc(g(r, 'name')) + (g(r, 'ticker') ? ' <small>(' + esc(g(r, 'ticker')) + ')</small>' : '') + '</td>'
      + '<td>' + g(r, 'year') + '</td>'
      + '<td>' + esc(g(r, 'group')) + '</td>'
      + '<td>' + esc(g(r, 'hqState')) + '</td>'
      + '<td>' + usd(g(r, 'ceo')) + '</td><td>' + usd(g(r, 'ceoCap')) + '</td><td>' + usd(g(r, 'neo')) + '</td><td>' + usd(g(r, 'rev')) + '</td>'
      + '<td>' + (g(r, 'tsr') == null ? '' : '$' + Math.round(g(r, 'tsr'))) + '</td>'
      + '<td>' + esc(note(r)) + '</td></tr>').join('');
    $('btn-more').hidden = view.length <= state.shown;
    document.querySelectorAll('#data-table th.sortable').forEach((th) => th.setAttribute('aria-sort', th.dataset.sort === state.sort ? (state.dir > 0 ? 'ascending' : 'descending') : 'none'));
  }

  function csv() {
    const head = ['company', 'ticker', 'fiscal_year', 'fiscal_year_end', 'industry_group', 'sic_description', 'hq_state', 'ceo_total_pay', 'ceo_actually_paid', 'other_execs_avg_total_pay', 'revenue', 'tsr_per_100', 'notes'];
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [head.join(',')].concat(view.map((r) => [g(r, 'name'), g(r, 'ticker'), g(r, 'year'), g(r, 'fyEnd'), g(r, 'group'), g(r, 'industry'), g(r, 'hqState'), g(r, 'ceo'), g(r, 'ceoCap'), g(r, 'neo'), g(r, 'rev'), g(r, 'tsr'), note(r)].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'pay-records-filtered.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function yearChips() {
    const el = $('year-chips');
    const values = [['all', 'All years']].concat(YEARS.slice().reverse().map((y) => [String(y), String(y)]));
    el.innerHTML = values.map(([v, label]) => '<button type="button" class="chip' + (state.year === v ? ' active' : '') + '" data-v="' + v + '" aria-pressed="' + (state.year === v) + '">' + label + '</button>').join('');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.year = b.dataset.v; state.shown = PAGE; yearChips(); applyFilters(); }));
  }

  function fillSelect(el, label, values, key) {
    el.innerHTML = '<option value="">' + label + '</option>' + values.map((v) => '<option>' + esc(v) + '</option>').join('');
    el.addEventListener('change', () => { state[key] = el.value; state.shown = PAGE; applyFilters(); });
  }

  fetch('data/site_data.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    d.cols.forEach((c, i) => { COLS[c] = i; });
    ROWS = d.rows; YEARS = d.years;
    yearChips();
    const uniq = (k) => [...new Set(ROWS.map((r) => r[COLS[k]]).filter(Boolean))].sort();
    fillSelect($('f-group'), 'All industry groups', uniq('group'), 'group');
    fillSelect($('f-state'), 'All states', uniq('hqState'), 'hq');
    $('f-text').addEventListener('input', (e) => { state.text = e.target.value; state.shown = PAGE; applyFilters(); });
    $('btn-more').addEventListener('click', () => { state.shown += PAGE; render(); });
    $('btn-export-csv').addEventListener('click', csv);
    $('btn-reset').addEventListener('click', () => {
      Object.assign(state, { year: '2025', group: '', hq: '', text: '', sort: 'ceo', dir: -1, shown: PAGE });
      $('f-group').value = ''; $('f-state').value = ''; $('f-text').value = '';
      yearChips(); applyFilters();
    });
    document.querySelectorAll('#data-table th.sortable').forEach((th) => {
      const go = () => {
        const k = th.dataset.sort;
        if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = (k === 'name' || k === 'group' || k === 'hqState') ? 1 : -1; }
        applyFilters();
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    applyFilters();
  }).catch(() => { const e = $('load-error'); e.hidden = false; e.textContent = 'The records could not load. Reload the page, or use data/panel.json from the repository.'; });
})();

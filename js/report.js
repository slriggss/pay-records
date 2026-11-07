// Draws the report's five charts from data/findings.json.
(function () {
  const $ = (id) => document.getElementById(id);
  const money = (v) => '$' + (v / 1e6).toFixed(1) + 'M';
  const C = window.ESG_COLORS;
  let F = null;
  const charts = {};

  function opts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 700 },
      plugins: { legend: { display: false } },
      scales: {},
    }, extra || {});
  }
  const axisMoney = { ticks: { callback: (v) => '$' + (v / 1e6) + 'M' }, grid: window.baseGrid, border: { display: false } };
  const axisCat = { grid: { display: false }, border: { color: () => C.baseline } };

  function make(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
  }

  function defs() {
    const D = {};
    const by = F.byYear, bal = F.balanced.byYear, years = by.map(r => String(r.year));
    D['chart-trend'] = {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          { label: 'All companies reporting that year', data: by.map(r => r.median), borderColor: C.series[1], backgroundColor: C.series[1], tension: 0.25, pointRadius: 4, borderWidth: 2.5 },
          { label: 'Same ' + F.balanced.companies.toLocaleString() + ' companies, all five years', data: bal.map(r => r.median), borderColor: C.series[0], backgroundColor: C.series[0], tension: 0.25, pointRadius: 4, borderWidth: 2.5 },
        ],
      },
      options: opts({
        plugins: {
          legend: { display: true, position: 'bottom' },
          tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + money(c.parsed.y) + ' (n = ' + (c.datasetIndex === 0 ? by : bal)[c.dataIndex].n.toLocaleString() + ')' } },
        },
        scales: { x: axisCat, y: Object.assign({ beginAtZero: true }, axisMoney) },
      }),
    };

    const sz = F.bySize;
    D['chart-size'] = {
      type: 'bar',
      data: { labels: sz.map(r => r.label), datasets: [{ data: sz.map(r => r.median), backgroundColor: C.series[0], borderRadius: 4 }] },
      options: opts({
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const r = sz[c.dataIndex]; return ['Median ' + money(r.median), 'Middle half: ' + money(r.p25) + ' to ' + money(r.p75), r.n + ' companies']; } } } },
        scales: { x: axisCat, y: Object.assign({ beginAtZero: true }, axisMoney) },
      }),
    };

    const qs = F.pfp.quartiles;
    D['chart-pfp'] = {
      type: 'bar',
      data: {
        labels: qs.map(r => (r.q === 1 ? 'Lowest' : r.q === 4 ? 'Highest' : 'Quartile ' + r.q) + (r.q === 1 || r.q === 4 ? ' return' : '')),
        datasets: [
          { label: 'Reported total pay (Summary Compensation Table)', data: qs.map(r => r.sctMedian), backgroundColor: C.series[2], borderRadius: 4 },
          { label: 'Compensation actually paid', data: qs.map(r => r.capMedian), backgroundColor: C.series[0], borderRadius: 4 },
        ],
      },
      options: opts({
        plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + money(c.parsed.y), afterBody: (items) => { const r = qs[items[0].dataIndex]; return r.n + ' companies; cumulative return $' + Math.round(r.tsrMin) + '–$' + Math.round(r.tsrMax) + ' per $100'; } } } },
        scales: { x: axisCat, y: Object.assign({ beginAtZero: true }, axisMoney) },
      }),
    };

    for (const [id, arr, color] of [['chart-industry', F.byIndustry, C.series[0]], ['chart-state', F.byState, C.series[4]]]) {
      D[id] = {
        type: 'bar',
        data: { labels: arr.map(r => r.key), datasets: [{ data: arr.map(r => r.median), backgroundColor: color, borderRadius: 3 }] },
        options: opts({
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const r = arr[c.dataIndex]; return ['Median ' + money(r.median), 'Middle half: ' + money(r.p25) + ' to ' + money(r.p75), r.n + ' companies']; } } } },
          scales: { x: Object.assign({ beginAtZero: true }, axisMoney), y: { grid: { display: false }, border: { display: false } } },
        }),
      };
    }
    return D;
  }

  fetch('data/findings.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(f => {
    F = f;
    document.querySelectorAll('.chart-card').forEach(card => {
      const cv = card.querySelector('canvas');
      if (!cv) return;
      whenCardOpens(card, () => make(cv.id, defs()[cv.id]));
    });
    window.addEventListener('esg-theme-change', () => {
      const d = defs();
      Object.keys(charts).forEach(id => make(id, d[id]));
    });
  }).catch(() => { const e = $('load-error'); if (e) { e.hidden = false; e.textContent = 'The charts could not load their data. The written findings below still read in full.'; } });
})();

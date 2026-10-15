// ATcoaching site script. Content lives in /data/*.json and /content/**/*.md;
// every page pulls from those, so adding an article, guide or product is a data edit, not a code edit.

const SITE = {
  name: 'ATcoaching',
  instagram: 'https://instagram.com/anandtrainsyou',
  handle: '@anandtrainsyou',
  coaching: 'https://tally.so/r/rjgY2L',
};

document.documentElement.classList.add('js');

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12L12 4M5.5 4H12v6.5"/></svg>';
const BACK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3L5 8l5 5"/></svg>';
const btn = (label, href, cls = '', attrs = '') =>
  `<a class="btn ${cls}" href="${href}" ${attrs}><span>${label}</span><span class="ico">${ARROW}</span></a>`;
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const params = new URLSearchParams(location.search);

async function load(name) {
  const res = await fetch(`/data/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${name}`);
  return res.json();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadMarkdown(path) {
  const [res] = await Promise.all([
    fetch(path, { cache: 'no-cache' }),
    window.marked ? null : loadScript('https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js'),
  ]);
  if (!res.ok) throw new Error('Not found');
  return window.marked.parse(await res.text());
}

/* ---------- chrome: nav, mobile menu, footer ---------- */
function renderChrome(page) {
  const link = (href, label, key) => `<a href="${href}" ${page === key ? 'aria-current="page"' : ''}>${label}</a>`;
  document.body.insertAdjacentHTML('afterbegin', `
    <nav class="nav" aria-label="Main">
      <a class="nav-logo" href="/" aria-label="${SITE.name} home"><img src="/assets/img/logo.png" alt="${SITE.name}" width="85" height="26"></a>
      <div class="nav-links">
        ${link('/articles/', 'Articles', 'articles')}
        ${link('/guides/', 'Free guides', 'guides')}
        ${link('/store/', 'Store', 'store')}
      </div>
      <div class="nav-cta">
        ${btn('Coaching', SITE.coaching, 'btn-primary btn-sm', 'target="_blank" rel="noopener"')}
        <button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span></button>
      </div>
    </nav>
    <div class="menu" aria-hidden="true">
      <a class="big" href="/"><span>Home</span></a>
      <a class="big" href="/articles/"><span>Articles</span></a>
      <a class="big" href="/guides/"><span>Free guides</span></a>
      <a class="big" href="/store/"><span>Store</span></a>
      <div class="menu-foot actions">
        ${btn('Apply for coaching', SITE.coaching, 'btn-primary', 'target="_blank" rel="noopener"')}
        ${btn('Instagram', SITE.instagram, 'btn-ghost', 'target="_blank" rel="noopener"')}
      </div>
    </div>`);

  document.body.insertAdjacentHTML('beforeend', `
    <footer class="footer">
      <div class="wrap">
        <div class="top">
          <div>
            <img class="logo" src="/assets/img/logo.png" alt="${SITE.name}" width="220" height="67">
            <p class="muted" style="max-width:34ch">Using evidence to bust myths. Helping you lose fat and get stronger, minus the side quests.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul><li><a href="/articles/">Articles</a></li><li><a href="/guides/">Free guides</a></li><li><a href="/store/">Store</a></li></ul>
          </div>
          <div>
            <h4>Connect</h4>
            <ul>
              <li><a href="${SITE.instagram}" target="_blank" rel="noopener">Instagram ${SITE.handle}</a></li>
              <li><a href="${SITE.coaching}" target="_blank" rel="noopener">Apply for 1:1 coaching</a></li>
            </ul>
          </div>
        </div>
        <div class="giant" aria-hidden="true">Respawn</div>
        <div class="bottom">
          <span class="hud">© ${new Date().getFullYear()} ${SITE.name}</span>
          <span class="hud">No myths were spared</span>
        </div>
      </div>
    </footer>`);

  const burger = $('.burger');
  const menu = $('.menu');
  const toggle = open => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
  };
  burger.addEventListener('click', () => toggle(!document.body.classList.contains('menu-open')));
  menu.addEventListener('click', e => { if (e.target.closest('a')) toggle(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
}

/* ---------- scroll reveal ---------- */
let revealObserver;
function observeReveals(root = document) {
  revealObserver ??= new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  root.querySelectorAll('.reveal:not(.in)').forEach(el => revealObserver.observe(el));
}

/* ---------- shared card templates ---------- */
function articleRow(a, i = 0) {
  return `
    <a class="row-link reveal d${i % 3}" href="/articles/?a=${encodeURIComponent(a.slug)}">
      <span class="date">${fmtDate(a.date)}<br>${a.readTime} min read</span>
      <div>
        <div class="chips">${(a.tags || []).map((t, j) => `<span class="chip ${j === 0 ? 'hot' : ''}">${esc(t)}</span>`).join('')}${a.sample ? '<span class="chip sample">Sample</span>' : ''}</div>
        <h3 style="margin-top:12px">${esc(a.title)}</h3>
        <p class="excerpt">${esc(a.excerpt)}</p>
      </div>
      <span class="go">${ARROW}</span>
    </a>`;
}

function guideMeta(g) {
  return g.type === 'plan'
    ? `${g.daysPerWeek} days/wk · ${esc(g.duration)}`
    : `${g.readTime} min read`;
}

function guideCard(g, i = 0) {
  return `
    <a class="shell cut card reveal d${i % 3}" href="/guides/?g=${encodeURIComponent(g.id)}">
      <div class="core cut">
        <div class="chips">
          <span class="chip hot">${g.type === 'plan' ? 'Workout plan' : 'Guide'}</span>
          <span class="chip">${esc(g.level)}</span>
          ${g.sample ? '<span class="chip sample">Sample</span>' : ''}
        </div>
        <h3>${esc(g.title)}</h3>
        <p>${esc(g.summary)}</p>
        <div class="foot"><span class="meta">${guideMeta(g)}</span><span class="meta accent">Free ${ARROW.replace('<svg', '<svg width="12" height="12"')}</span></div>
      </div>
    </a>`;
}

function productCard(p, i = 0) {
  return `
    <a class="shell cut card product reveal d${i % 3}" href="/store/?p=${encodeURIComponent(p.id)}">
      <div class="core cut">
        <div class="art"><img src="/assets/img/mark.png" alt=""><div class="slot chips">
          <span class="chip hot">${p.checkoutUrl ? 'Available' : 'Coming soon'}</span>${p.sample ? '<span class="chip sample">Sample</span>' : ''}
        </div></div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.tagline)}</p>
        <div class="foot"><span class="price">${inr(p.price)}</span><span class="meta">View ${ARROW.replace('<svg', '<svg width="12" height="12"')}</span></div>
      </div>
    </a>`;
}

/* ---------- page: home ---------- */
async function pageHome() {
  const [articles, guides, products] = await Promise.all([load('articles'), load('guides'), load('products')]);
  $('#latest-articles').innerHTML = articles.slice(0, 3).map(articleRow).join('');
  $('#free-guides').innerHTML = guides.slice(0, 3).map(guideCard).join('');
  $('#store-preview').innerHTML = products.slice(0, 3).map(productCard).join('');
  $('#count-articles').textContent = String(articles.length).padStart(2, '0');
  $('#count-guides').textContent = String(guides.length).padStart(2, '0');
  $('#count-products').textContent = String(products.length).padStart(2, '0');
  observeReveals();
}

/* ---------- page: articles ---------- */
async function pageArticles() {
  const articles = await load('articles');
  const slug = params.get('a');
  if (!slug) {
    $('#list').innerHTML = articles.map(articleRow).join('') || '<p class="empty">No articles yet.</p>';
    return observeReveals();
  }
  const a = articles.find(x => x.slug === slug);
  if (!a) return notFound('Article not found', '/articles/', 'All articles');
  document.title = `${a.title} | ${SITE.name}`;
  const html = await loadMarkdown(`/content/articles/${a.slug}.md`).catch(() => '<p>This article could not be loaded.</p>');
  renderReader({
    back: ['/articles/', 'All articles'],
    chips: [...(a.tags || []), ...(a.sample ? ['Sample'] : [])],
    title: a.title,
    meta: [['Published', fmtDate(a.date)], ['Read', `${a.readTime} min`], ['By', 'Anand']],
    body: html,
    share: `/a/${a.slug}`,
  });
}

/* ---------- page: guides ---------- */
async function pageGuides() {
  const guides = await load('guides');
  const id = params.get('g');
  if (!id) {
    const list = $('#list');
    const draw = type => {
      const items = type === 'all' ? guides : guides.filter(g => g.type === type);
      list.innerHTML = items.map(guideCard).join('') || '<p class="empty">Nothing here yet.</p>';
      observeReveals(list);
    };
    $('.filters').addEventListener('click', e => {
      const f = e.target.closest('.filter'); if (!f) return;
      document.querySelectorAll('.filter').forEach(b => b.setAttribute('aria-pressed', b === f));
      draw(f.dataset.type);
    });
    draw('all');
    return observeReveals();
  }
  const g = guides.find(x => x.id === id);
  if (!g) return notFound('Guide not found', '/guides/', 'All guides');
  document.title = `${g.title} | ${SITE.name}`;

  if (g.type === 'plan') {
    renderReader({
      back: ['/guides/', 'All guides'],
      chips: ['Workout plan', g.level, ...(g.sample ? ['Sample'] : [])],
      title: g.title,
      meta: [['Days', `${g.daysPerWeek}/week`], ['Length', g.duration], ['Goal', g.goal]],
      lede: g.summary,
      body: planBody(g),
      share: `/g/${g.id}`,
      download: () => downloadPlanPdf(g),
    });
  } else {
    const html = g.pdf ? null : await loadMarkdown(`/content/guides/${g.id}.md`).catch(() => '<p>This guide could not be loaded.</p>');
    renderReader({
      back: ['/guides/', 'All guides'],
      chips: ['Guide', g.level, ...(g.sample ? ['Sample'] : [])],
      title: g.title,
      meta: [['Read', `${g.readTime} min`], ['By', 'Anand'], ['Price', 'Free']],
      lede: g.summary,
      body: html,
      share: `/g/${g.id}`,
      download: g.pdf ? g.pdf : () => print(),
    });
  }
}

function planBody(g) {
  const notes = g.notes?.length
    ? `<div class="shell cut plan-notes"><div class="core cut"><span class="hud">How to run it</span><ul>${g.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div></div>`
    : '';
  const days = (g.days || []).map((d, i) => `
    <div class="day reveal">
      <div class="day-title"><span class="idx">${String(i + 1).padStart(2, '0')}</span><h3>${esc(d.name)}</h3>${d.focus ? `<span class="hud">${esc(d.focus)}</span>` : ''}</div>
      <div class="table-scroll cut" style="--c:12px">
        <table>
          <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Rest</th></tr></thead>
          <tbody>${(d.exercises || []).map(x => `
            <tr><td>${esc(x.name)}${x.notes ? `<div class="muted" style="font-weight:400;font-size:.85rem">${esc(x.notes)}</div>` : ''}</td>
            <td>${esc(x.sets)}</td><td>${esc(x.reps)}</td><td>${esc(x.rest)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');
  return notes + days;
}

/* ---------- page: store ---------- */
async function pageStore() {
  const products = await load('products');
  const id = params.get('p');
  if (!id) {
    $('#list').innerHTML = products.map(productCard).join('') || '<p class="empty">The shop is restocking.</p>';
    return observeReveals();
  }
  const p = products.find(x => x.id === id);
  if (!p) return notFound('Product not found', '/store/', 'Back to store');
  document.title = `${p.name} | ${SITE.name}`;
  const buy = p.checkoutUrl
    ? btn(`Buy now · ${inr(p.price)}`, p.checkoutUrl, 'btn-primary', 'target="_blank" rel="noopener"')
    : `<button class="btn btn-primary" disabled><span>Coming soon</span><span class="ico">${ARROW}</span></button>`;
  $('#app').innerHTML = `
    <header class="reader-head"><div class="wrap" style="max-width:var(--max)">
      <a class="back" href="/store/">${BACK} Back to store</a>
      <div class="chips" style="margin-top:28px"><span class="chip hot">${p.checkoutUrl ? 'Available' : 'Coming soon'}</span>${p.sample ? '<span class="chip sample">Sample</span>' : ''}</div>
      <h1>${esc(p.name)}</h1>
    </div></header>
    <section class="product-page" style="padding-top:0">
      <div class="wrap">
        <div>
          <p class="lede" style="max-width:52ch">${esc(p.tagline)}</p>
          <p class="muted" style="max-width:60ch;font-size:1.1rem">${esc(p.summary)}</p>
          <span class="hud" style="margin-top:36px">What's inside</span>
          <ul class="includes">${(p.includes || []).map(x => `<li class="cut" style="--c:10px">${esc(x)}</li>`).join('')}</ul>
        </div>
        <aside class="shell cut buy-box"><div class="core cut">
          <span class="hud">One-time payment</span>
          <span class="price">${inr(p.price)}</span>
          ${buy}
          <p class="fine">${p.checkoutUrl ? 'Instant access after checkout.' : `Launching soon. DM "WORK" on Instagram ${SITE.handle} to hear first.`}</p>
        </div></aside>
      </div>
    </section>`;
  observeReveals();
}

/* ---------- shared reader layout ---------- */
function renderReader({ back, chips, title, meta, lede, body, share, download }) {
  $('#app').innerHTML = `
    <header class="reader-head"><div class="wrap">
      <a class="back" href="${back[0]}">${BACK} ${back[1]}</a>
      <h1>${esc(title)}</h1>
      ${lede ? `<p class="lede" style="max-width:56ch;margin-bottom:28px">${esc(lede)}</p>` : ''}
      <div class="reader-meta">
        <div class="chips">${chips.map((c, i) => `<span class="chip ${i === 0 ? 'hot' : ''} ${c === 'Sample' ? 'sample' : ''}">${esc(c)}</span>`).join('')}</div>
        ${meta.map(([k, v]) => `<span class="hud">${esc(k)} <b>${esc(v)}</b></span>`).join('')}
      </div>
      <div class="actions" style="margin-top:28px">
        ${download ? `<button class="btn btn-primary btn-sm" id="dl"><span>Download PDF</span><span class="ico">${ARROW}</span></button>` : ''}
        <button class="btn btn-ghost btn-sm" id="share"><span>Share</span><span class="ico">${ARROW}</span></button>
      </div>
    </div></header>
    <div class="reader-body"><div class="wrap prose-wrap">
      <div class="prose">${body ?? ''}</div>
      <div class="shell cut endcard reveal"><div class="core cut">
        <div><span class="hud">Want this tailored to you?</span><h3 class="h3" style="margin-top:12px;text-transform:uppercase;font-style:italic">1:1 online coaching</h3></div>
        ${btn('Apply now', SITE.coaching, 'btn-primary', 'target="_blank" rel="noopener"')}
      </div></div>
    </div></div>`;

  const dl = $('#dl');
  if (dl) dl.addEventListener('click', () => {
    if (typeof download === 'string') { location.href = download; } else { download(dl); }
  });
  $('#share').addEventListener('click', e => shareLink(title, share, e.currentTarget));
  observeReveals();
}

function notFound(msg, href, label) {
  $('#app').innerHTML = `<header class="reader-head"><div class="wrap"><a class="back" href="${href}">${BACK} ${label}</a><h1>${msg}</h1><p class="muted">It may have been renamed or removed.</p></div></header>`;
}

async function shareLink(title, path, el) {
  const url = location.origin + path;
  if (navigator.share) { try { await navigator.share({ title, url }); } catch (_) {} return; }
  try {
    await navigator.clipboard.writeText(url);
    const span = el.querySelector('span');
    const prev = span.textContent; span.textContent = 'Link copied';
    setTimeout(() => (span.textContent = prev), 1600);
  } catch (_) { prompt('Copy this link:', url); }
}

/* ---------- workout plan PDF (built in the browser from the plan data) ---------- */
async function downloadPlanPdf(plan) {
  if (plan.pdf) { location.href = plan.pdf; return; }
  const dl = $('#dl'); const span = dl.querySelector('span'); const prev = span.textContent;
  span.textContent = 'Preparing…'; dl.disabled = true;
  try {
    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }
    buildPlanPdf(plan).save(`${plan.id}.pdf`);
  } catch (err) {
    console.error(err);
    alert('Download failed. If you opened this from Instagram, tap ••• → "Open in browser" and try again.');
  } finally { span.textContent = prev; dl.disabled = false; }
}

function buildPlanPdf(plan) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 48, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = M;

  doc.setFillColor(10, 10, 10).rect(0, 0, W, 6, 'F');
  doc.setFillColor(255, 59, 47).rect(0, 6, 120, 3, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255, 59, 47).text('ATCOACHING  //  FREE WORKOUT PLAN', M, y);
  y += 26;
  doc.setTextColor(10).setFontSize(24).text(plan.title.toUpperCase(), M, y);
  y += 18;
  const meta = [plan.level, plan.daysPerWeek && `${plan.daysPerWeek} days/week`, plan.duration, plan.goal].filter(Boolean).join('   |   ');
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120).text(meta.toUpperCase(), M, y);
  y += 22;
  doc.setTextColor(40).setFontSize(11);
  const summary = doc.splitTextToSize(plan.summary || '', W - M * 2);
  doc.text(summary, M, y); y += summary.length * 14 + 12;

  if (plan.notes?.length) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(10).text('HOW TO RUN IT', M, y); y += 15;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(50);
    for (const n of plan.notes) { const l = doc.splitTextToSize('-  ' + n, W - M * 2); doc.text(l, M, y); y += l.length * 13 + 3; }
    y += 10;
  }

  for (const d of plan.days || []) {
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'plain',
      head: [[{ content: (d.name + (d.focus ? `  /  ${d.focus}` : '')).toUpperCase(), colSpan: 4, styles: { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold' } }],
             ['Exercise', 'Sets', 'Reps', 'Rest']],
      body: (d.exercises || []).map(x => [x.notes ? `${x.name}\n${x.notes}` : x.name, x.sets ?? '', x.reps ?? '', x.rest ?? '']),
      styles: { fontSize: 10, cellPadding: 7, lineColor: [225, 222, 215], lineWidth: { bottom: .5 } },
      headStyles: { fillColor: [242, 239, 232], textColor: 80, fontSize: 8, fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', textColor: 20 }, 1: { cellWidth: 50 }, 2: { cellWidth: 80 }, 3: { cellWidth: 80 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  }

  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(150).text(`${SITE.name}  |  ${location.host}  |  ${SITE.handle}`, M, H - 24);
  }
  return doc;
}

/* ---------- boot ---------- */
(async function boot() {
  const page = document.body.dataset.page;
  renderChrome(page);
  observeReveals();
  const run = { home: pageHome, articles: pageArticles, guides: pageGuides, store: pageStore }[page];
  try { await run?.(); } catch (err) { console.error(err); }
  const go = () => setTimeout(() => document.documentElement.classList.add('ready'), 30);
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 900))]).then(go);
})();

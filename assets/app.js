// Shared site logic. Plans live in /data/plans.json; every page here reads from that one file.

const SITE_NAME = 'Coach Name';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadPlans() {
  const res = await fetch('/data/plans.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load plans');
  return res.json();
}

function planUrl(plan) {
  return '/plans/?p=' + encodeURIComponent(plan.id);
}

function planTags(plan) {
  return [
    plan.level && `<span class="tag level">${esc(plan.level)}</span>`,
    plan.daysPerWeek && `<span class="tag">${esc(plan.daysPerWeek)} days/week</span>`,
    plan.duration && `<span class="tag">${esc(plan.duration)}</span>`,
    plan.goal && `<span class="tag">${esc(plan.goal)}</span>`,
  ].filter(Boolean).join('');
}

function renderPlanCards(el, plans) {
  if (!plans.length) {
    el.innerHTML = '<p class="empty">No plans yet. Check back soon.</p>';
    return;
  }
  el.innerHTML = plans.map(p => `
    <a class="card" href="${planUrl(p)}">
      <div class="tags">${planTags(p)}</div>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.summary)}</p>
      <span class="more">View plan &rarr;</span>
    </a>`).join('');
}

function renderPlanDetail(el, plan) {
  document.title = `${plan.title} | ${SITE_NAME}`;
  const notes = plan.notes?.length
    ? `<div class="notes"><h3>How to run it</h3><ul>${plan.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`
    : '';
  const days = (plan.days || []).map(d => `
    <div class="day">
      <div class="day-title"><h3>${esc(d.name)}</h3>${d.focus ? `<span class="muted">${esc(d.focus)}</span>` : ''}</div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Rest</th></tr></thead>
          <tbody>
            ${(d.exercises || []).map(x => `
              <tr><td>${esc(x.name)}${x.notes ? `<div class="muted" style="font-weight:400;font-size:.85rem">${esc(x.notes)}</div>` : ''}</td>
              <td>${esc(x.sets)}</td><td>${esc(x.reps)}</td><td>${esc(x.rest)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="plan-head">
      <a class="back" href="/plans/">&larr; All plans</a>
      <h1>${esc(plan.title)}</h1>
      <div class="tags">${planTags(plan)}</div>
      <p class="muted" style="max-width:640px;font-size:1.1rem">${esc(plan.summary)}</p>
      <div class="actions">
        <button class="btn btn-primary" id="dl">Download PDF</button>
        <button class="btn" id="share">Share</button>
      </div>
    </div>
    ${notes}
    ${days}`;

  el.querySelector('#dl').addEventListener('click', e => downloadPlan(plan, e.currentTarget));
  el.querySelector('#share').addEventListener('click', e => sharePlan(plan, e.currentTarget));
}

// --- Downloads ---------------------------------------------------------------
// If a plan has a "pdf" field (e.g. "/downloads/my-plan.pdf"), that file is served as-is.
// Otherwise a PDF is generated in the browser from the plan data, so every plan is downloadable.

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function downloadPlan(plan, btn) {
  if (plan.pdf) {
    const a = document.createElement('a');
    a.href = plan.pdf; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  const label = btn.textContent;
  btn.textContent = 'Preparing…'; btn.disabled = true;
  try {
    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }
    buildPdf(plan).save(`${plan.id}.pdf`);
  } catch (err) {
    console.error(err);
    alert('Download failed. If you opened this from Instagram, tap ••• and choose "Open in browser", then try again.');
  } finally {
    btn.textContent = label; btn.disabled = false;
  }
}

function buildPdf(plan) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 48;
  const W = doc.internal.pageSize.getWidth();
  let y = M;

  doc.setFont('helvetica', 'bold').setFontSize(22).text(plan.title, M, y);
  y += 20;
  const meta = [plan.level, plan.daysPerWeek && `${plan.daysPerWeek} days/week`, plan.duration, plan.goal].filter(Boolean).join('  •  ');
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(110).text(meta, M, y);
  y += 22;
  doc.setTextColor(30).setFontSize(11);
  const summary = doc.splitTextToSize(plan.summary || '', W - M * 2);
  doc.text(summary, M, y);
  y += summary.length * 14 + 10;

  if (plan.notes?.length) {
    doc.setFont('helvetica', 'bold').setFontSize(12).text('How to run it', M, y);
    y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(10);
    for (const n of plan.notes) {
      const lines = doc.splitTextToSize('• ' + n, W - M * 2);
      doc.text(lines, M, y);
      y += lines.length * 13 + 2;
    }
    y += 10;
  }

  for (const d of plan.days || []) {
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      head: [[{ content: d.name + (d.focus ? ` (${d.focus})` : ''), colSpan: 4 }], ['Exercise', 'Sets', 'Reps', 'Rest']],
      body: (d.exercises || []).map(x => [x.notes ? `${x.name}\n${x.notes}` : x.name, x.sets ?? '', x.reps ?? '', x.rest ?? '']),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [20, 20, 22], textColor: 255 },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 50 }, 2: { cellWidth: 80 }, 3: { cellWidth: 80 } },
    });
    y = doc.lastAutoTable.finalY + 18;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(140).text(`${SITE_NAME}  •  ${location.host}`, M, doc.internal.pageSize.getHeight() - 24);
  }
  return doc;
}

async function sharePlan(plan, btn) {
  const url = location.origin + '/p/' + encodeURIComponent(plan.id);
  if (navigator.share) {
    try { await navigator.share({ title: plan.title, url }); } catch (_) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    const label = btn.textContent;
    btn.textContent = 'Link copied';
    setTimeout(() => (btn.textContent = label), 1500);
  } catch (_) {
    prompt('Copy this link:', url);
  }
}

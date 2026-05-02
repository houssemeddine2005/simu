/**
 * SIMULATEUR SALAIRE — Contrôleur UI v2
 * ========================================
 * FIXES :
 *  [8]  Breakdown ne se rendait pas au premier clic → renderBreakdown appelé dans renderResults
 *  [A]  Pourcentages ajoutés dans la légende de la barre
 *  [B]  Comparaison multi-statuts affichée dynamiquement
 *  [C]  Hint PAS affiché dès que le slider bouge
 *  [D]  Hint temps partiel mis à jour avec heures réelles
 *  [E]  resetSeg corrigé pour les result-tabs (data-period ≠ data-val)
 *  [F]  aria-pressed sur statut buttons mis à jour
 */

'use strict';

// ─── État global ──────────────────────────────────────────────────────────────
const state = {
  mode:         'brut-net',
  period:       'mensuel',
  statut:       'non-cadre',
  tpsTravail:   100,
  nbMois:       12,
  parts:        1,
  tauxPAS:      0,
  resultPeriod: 'mensuel',
  detailOpen:   false,
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindAll();
  renderExamples();
  run();
});

// ─── Bindings ─────────────────────────────────────────────────────────────────
function bindAll() {
  // Segmented controls
  bindSeg('modeCtrl',   v => { state.mode = v; updateSalaryLabel(); run(); });
  bindSeg('periodCtrl', v => { state.period = v; run(); });
  bindSeg('moisCtrl',   v => { state.nbMois = parseInt(v, 10); run(); });

  // Statut
  document.querySelectorAll('#statutCtrl .statut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#statutCtrl .statut-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.statut = btn.dataset.val;
      run();
    });
  });

  // Result tabs
  document.querySelectorAll('#resultTabs .result-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#resultTabs .result-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.resultPeriod = btn.dataset.period;
      run();
    });
  });

  // Salary input (debounced)
  let debTimer;
  document.getElementById('salaryInput').addEventListener('input', () => {
    clearTimeout(debTimer);
    debTimer = setTimeout(run, 120);
  });

  // Slider : temps de travail
  document.getElementById('tpsTravail').addEventListener('input', function () {
    const v = parseInt(this.value, 10);
    state.tpsTravail = v;
    const heures = (HEURES_MOIS * v / 100).toFixed(2).replace('.', 'h');
    document.getElementById('tpsLabel').textContent = v + ' %';
    document.getElementById('tpsHint').textContent  = '· ' + heures + '/mois';
    this.setAttribute('aria-valuenow', v);
    run();
  });

  // Slider : PAS
  document.getElementById('tauxPAS').addEventListener('input', function () {
    const v = parseFloat(this.value);
    state.tauxPAS = v;
    document.getElementById('pasLabel').textContent = v.toFixed(1) + ' %';
    // [C] Afficher le hint dès que > 0
    document.getElementById('pasHint').style.display = v > 0 ? '' : 'none';
    run();
  });

  // Fiscal
  document.getElementById('fiscal').addEventListener('change', function () {
    state.parts = parseFloat(this.value);
    run();
  });

  // Checkboxes
  ['opt-mutuelle', 'opt-tickets', 'opt-heures-sup', 'opt-teletravail'].forEach(id => {
    document.getElementById(id).addEventListener('change', run);
  });

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('salaryInput').value = btn.dataset.val;
      run();
    });
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', resetAll);

  // [8] Toggle detail — rend le breakdown à l'ouverture
  document.getElementById('toggleDetail').addEventListener('click', () => {
    state.detailOpen = !state.detailOpen;
    const body = document.getElementById('breakdownBody');
    const btn  = document.getElementById('toggleDetail');
    body.style.display = state.detailOpen ? 'block' : 'none';
    btn.textContent    = state.detailOpen ? 'Masquer le détail ▴' : 'Voir le détail ▾';
    btn.setAttribute('aria-expanded', String(state.detailOpen));
    if (state.detailOpen) run(); // forcer le rendu
  });

  // Mobile nav
  document.getElementById('navToggle').addEventListener('click', function () {
    const nav  = document.getElementById('mainNav');
    const open = nav.classList.toggle('open');
    this.setAttribute('aria-expanded', String(open));
  });
}

function bindSeg(id, cb) {
  document.querySelectorAll(`#${id} .seg-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cb(btn.dataset.val);
    });
  });
}

// ─── Calcul + rendu ───────────────────────────────────────────────────────────
function run() {
  const saisie = parseFloat(document.getElementById('salaryInput').value) || 0;
  const r = calculer({
    saisie,
    mode:           state.mode,
    period:         state.period,
    statut:         state.statut,
    tpsTravail:     state.tpsTravail,
    nbMois:         state.nbMois,
    parts:          state.parts,
    tauxPAS:        state.tauxPAS,
    optMutuelle:    document.getElementById('opt-mutuelle').checked,
    optTickets:     document.getElementById('opt-tickets').checked,
    optHeuresSup:   document.getElementById('opt-heures-sup').checked,
    optTeletravail: document.getElementById('opt-teletravail').checked,
  });

  renderResults(r);
}

function updateSalaryLabel() {
  document.getElementById('salaryLabel').textContent =
    state.mode === 'brut-net' ? 'Votre salaire brut' : 'Votre salaire net';
}

// ─── Rendu résultats ──────────────────────────────────────────────────────────
function renderResults(r) {
  const p   = state.resultPeriod;
  const dec = p === 'horaire' ? 2 : 0;

  // Valeurs affichées selon période
  const dispBrut  = p === 'annuel' ? r.brutAnnuel  : p === 'horaire' ? r.brutHoraire  : r.brutMensuel;
  const dispNet   = p === 'annuel' ? r.netAnnuel   : p === 'horaire' ? r.netHoraire   : r.net;
  const dispNetIR = p === 'annuel' ? r.netFinalAnnuel : p === 'horaire' ? r.netFinalHoraire : r.netFinal;

  // Grands nombres
  setHtml('disp-brut', `${fmt(dispBrut, dec)} <small>€</small>`);
  setHtml('disp-net',  `${fmt(dispNet,  dec)} <small>€</small>`);

  // Net après IR
  const showIR = state.tauxPAS > 0;
  el('col-net-ir').style.display = showIR ? '' : 'none';
  el('ir-legend').style.display  = showIR ? '' : 'none';
  if (showIR) setHtml('disp-net-ir', `${fmt(dispNetIR, dec)} <small>€</small>`);

  // Animation
  animPop('disp-brut');
  animPop('disp-net');
  if (showIR) animPop('disp-net-ir');

  // ── [A] Barre de répartition + pourcentages ──
  const total  = r.brutMensuel || 1;
  const pNet   = Math.max(0, r.net        / total * 100);
  const pCs    = r.cotisTotal             / total * 100;
  const pCsg   = r.csgTotal               / total * 100;
  const pIR    = showIR ? (r.pas          / total * 100) : 0;

  el('seg-net').style.width = pNet.toFixed(1) + '%';
  el('seg-cs').style.width  = pCs.toFixed(1)  + '%';
  el('seg-csg').style.width = pCsg.toFixed(1) + '%';
  el('seg-ir').style.width  = pIR.toFixed(1)  + '%';

  setText('pct-net',  pNet.toFixed(0) + ' %');
  setText('pct-cs',   pCs.toFixed(0)  + ' %');
  setText('pct-csg',  pCsg.toFixed(0) + ' %');
  setText('pct-ir',   pIR.toFixed(0)  + ' %');

  // ── [8] Breakdown toujours rendu (visible si ouvert) ──
  renderBreakdown(r, showIR);

  // ── Métriques ──
  setText('m-charges', r.tauxCharges);
  setText('m-cout',    fmtEur(r.coutEmployeur));
  setText('m-annuel',  fmtEur(r.netAnnuel));
  setText('m-ir',      r.irAnnuel > 0 ? fmtEur(r.irAnnuel) : '0 €');
  setText('m-horaire', fmt(r.netHoraire, 2) + ' €');
  setText('m-jour',    fmt(r.net / 22, 2) + ' €');
  setText('m-ir',      r.tauxIR);

  // ── IR par tranches ──
  const irCard = el('irCard');
  if (r.irAnnuel > 0 && showIR) {
    irCard.style.display = '';
    el('irBody').innerHTML =
      r.irTranches.map(t =>
        `<div class="ir-tranche-row">
          <span class="ir-tranche-label">Tranche ${t.label} @ ${t.taux}</span>
          <span class="ir-tranche-val">${fmtEur(t.montant)}</span>
        </div>`
      ).join('') +
      `<div class="ir-tranche-row ir-total">
        <span class="ir-tranche-label">Total IR annuel estimé</span>
        <span class="ir-tranche-val">${fmtEur(r.irAnnuel)}</span>
      </div>
      <div class="ir-tranche-row">
        <span class="ir-tranche-label">Soit par mois (PAS appliqué)</span>
        <span class="ir-tranche-val">${fmtEur(r.pas)}</span>
      </div>`;
  } else {
    irCard.style.display = 'none';
  }

  // ── [B] Comparaison multi-statuts ──
  renderComparaison(r.brutMensuel, state.statut);
}

// ─── Breakdown détaillé ───────────────────────────────────────────────────────
function renderBreakdown(r, showIR) {
  if (!state.detailOpen) return; // pas besoin de rendre si fermé

  let html = '';

  // Brut
  html += section('Salaire brut');
  html += row('Salaire brut mensuel', fmtEur(r.brutMensuel), 'neutral');
  if (r.brutHS > 0) html += row('Dont heures supplémentaires', fmtEur(r.brutHS), 'neutral', true);

  // Cotisations classiques
  const classic = r.cotisDetails.filter(c => !c.csg);
  const csgRows = r.cotisDetails.filter(c => c.csg);

  if (classic.length) {
    const totalClassic = classic.reduce((s, c) => s + c.montant, 0);
    html += section('Cotisations sociales salariales');
    html += row('Total cotisations', `− ${fmtEur(totalClassic)}`, 'neg');
    classic.forEach(c => html += row(c.label, `− ${fmtEur(c.montant)}`, 'neg', true));
  }

  if (csgRows.length) {
    const totalCsg = csgRows.reduce((s, c) => s + c.montant, 0);
    html += section('CSG / CRDS');
    html += row('Total CSG/CRDS', `− ${fmtEur(totalCsg)}`, 'neg');
    csgRows.forEach(c => html += row(c.label, `− ${fmtEur(c.montant)}`, 'neg', true));
  }

  // Net social encadré
  html += `<div class="bd-net-social">
    <span>Net social mensuel</span>
    <span>${fmtEur(r.net)}</span>
  </div>`;

  // Options
  if (r.dedMutuelle || r.dedTickets || r.addTeletravail) {
    html += section('Avantages & déductions');
    if (r.dedMutuelle)    html += row('Mutuelle (part salariale)',          `− ${fmtEur(r.dedMutuelle)}`,    'neg');
    if (r.dedTickets)     html += row('Tickets restaurant (part sal.)',     `− ${fmtEur(r.dedTickets)}`,     'neg');
    if (r.addTeletravail) html += row('Allocation télétravail',             `+ ${fmtEur(r.addTeletravail)}`, 'pos');
  }

  // PAS
  if (showIR && r.pas > 0) {
    html += section('Prélèvement à la source (PAS)');
    html += row('Impôt mensuel retenu', `− ${fmtEur(r.pas)}`, 'neg');
  }

  // Net final
  html += `<div class="bd-row total-row">
    <span class="bd-label">Net à payer</span>
    <span class="bd-val neutral">${fmtEur(r.netFinal)}</span>
  </div>`;

  // Coût employeur
  html += section('Coût employeur');
  html += row('Charges patronales estimées', `+ ${fmtEur(r.patronalTotal)}`, 'warn');
  html += row('Coût employeur total (mensuel)', fmtEur(r.coutEmployeur), 'neutral');
  html += row('Coût employeur total (annuel)',  fmtEur(r.coutEmployeur * r.nbMois), 'neutral');

  el('breakdownBody').innerHTML = html;
}

function section(title) {
  return `<p class="bd-section-title">${title}</p>`;
}
function row(label, val, cls, indent = false) {
  return `<div class="bd-row">
    <span class="bd-label${indent ? ' indent' : ''}">${label}</span>
    <span class="bd-val ${cls}">${val}</span>
  </div>`;
}

// ─── [B] Comparaison multi-statuts ───────────────────────────────────────────
function renderComparaison(brutMensuel, statutActif) {
  if (!brutMensuel) return;
  const data = genComparaison(brutMensuel);
  const maxNet = Math.max(...data.map(d => d.net));

  el('compareBody').innerHTML = data.map(d => {
    const barW  = maxNet > 0 ? (d.net / maxNet * 100).toFixed(1) : 0;
    const actif = d.val === statutActif ? ' compare-row--active' : '';
    return `<div class="compare-row${actif}">
      <span class="compare-icon">${d.icon}</span>
      <span class="compare-label">${d.label}</span>
      <div class="compare-bar-wrap">
        <div class="compare-bar" style="width:${barW}%"></div>
      </div>
      <span class="compare-net">${fmtEur(d.net)}</span>
    </div>`;
  }).join('');
}

// ─── Table exemples ───────────────────────────────────────────────────────────
function renderExamples() {
  el('examplesBody').innerHTML = genExemples().map(r =>
    `<tr>
      <td><strong>${fmtEur(r.brut)}</strong></td>
      <td class="td-green">${fmtEur(r.net)}</td>
      <td class="td-green">${fmtEur(r.netAnnuel)}</td>
      <td>${r.tauxCharges}</td>
      <td>${fmtEur(r.coutEmployeur)}</td>
      <td>${r.ratio}</td>
    </tr>`
  ).join('');
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetAll() {
  // Inputs
  el('salaryInput').value = 3000;
  el('tpsTravail').value  = 100;
  el('tauxPAS').value     = 0;
  el('fiscal').value      = '1';
  setText('tpsLabel', '100 %');
  setText('pasLabel',  '0 %');
  el('tpsHint').textContent  = '· 151h67/mois';
  el('pasHint').style.display = 'none';

  // Checkboxes
  ['opt-mutuelle', 'opt-tickets', 'opt-heures-sup', 'opt-teletravail'].forEach(id => {
    el(id).checked = false;
  });

  // Segments
  activateSeg('modeCtrl',   'brut-net');
  activateSeg('periodCtrl', 'mensuel');
  activateSeg('moisCtrl',   '12');
  activateTab('resultTabs', 'mensuel');

  // Statut
  document.querySelectorAll('#statutCtrl .statut-btn').forEach(b => {
    const active = b.dataset.val === 'non-cadre';
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });

  // State
  Object.assign(state, {
    mode: 'brut-net', period: 'mensuel', statut: 'non-cadre',
    tpsTravail: 100, nbMois: 12, parts: 1, tauxPAS: 0,
    resultPeriod: 'mensuel', detailOpen: false,
  });

  // Fermer le breakdown
  el('breakdownBody').style.display = 'none';
  el('toggleDetail').textContent    = 'Voir le détail ▾';
  el('toggleDetail').setAttribute('aria-expanded', 'false');

  updateSalaryLabel();
  run();
}

// [E] Helpers reset segments (data-val vs data-period)
function activateSeg(id, val) {
  document.querySelectorAll(`#${id} .seg-btn`).forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}
function activateTab(id, period) {
  document.querySelectorAll(`#${id} .result-tab`).forEach(b => {
    const active = b.dataset.period === period;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
}

// ─── Helpers DOM ──────────────────────────────────────────────────────────────
const el      = id => document.getElementById(id);
const setText = (id, t) => { const e = el(id); if (e) e.textContent = t; };
const setHtml = (id, h) => { const e = el(id); if (e) e.innerHTML   = h; };

function animPop(id) {
  const e = el(id);
  if (!e) return;
  e.classList.remove('pop');
  void e.offsetWidth; // reflow
  e.classList.add('pop');
}

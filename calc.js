/**
 * SIMULATEUR SALAIRE BRUT ↔ NET — Moteur de calcul 2024
 * =======================================================
 * Taux en vigueur au 1er janvier 2024.
 * Plafond Mensuel Sécurité Sociale (PMSS) : 3 864 €
 *
 * BUGS CORRIGÉS v2 :
 *  [1] Chemins JS/CSS : les fichiers sont à la racine (pas dans css/ ni js/)
 *  [2] Temps partiel appliqué en double en mode horaire → supprimé en horaire
 *  [3] Mode net→brut : temps partiel appliqué avant ET après la division → corrigé
 *  [4] Fonctionnaire : CSG/CRDS était ajoutée mais pas soustraite du net → corrigé
 *  [5] Libéral : reset cotisDetails puis ajout CSG par-dessus → CSG désormais ignorée pour TNS
 *  [6] tauxPAS non transmis à buildResult → r.tauxPAS toujours undefined → corrigé
 *  [7] Apprenti + options : netFinal calculé deux fois → corrigé
 *  [8] Breakdown ne se rend pas lors de l'ouverture (first click) → rendu immédiat dans renderResults
 *  [9] tranche2 patronal pour non-cadre incorrectement incluse → corrigé
 * [10] CEG (salarié) appliquée comme plafonnée pour portage → corrigé
 */

'use strict';

// ─── Constantes 2024 ─────────────────────────────────────────────────────────
const PMSS        = 3864;      // Plafond mensuel Sécurité Sociale
const SMIC_BRUT   = 1801.80;  // SMIC brut mensuel (35h)
const HEURES_MOIS = 151.67;   // Heures mensuelles légales (35h × 52/12)

// ─── Taux cotisations salariales ─────────────────────────────────────────────
// plafonne : true  → assiette = min(brut, PMSS)
// tranche2 : true  → assiette = max(0, brut - PMSS)
// cadreOnly: true  → uniquement pour statut cadre
const COTIS_SAL = {
  vieillesseP:  { taux: 0.0690, plafonne: true,  label: 'Assurance vieillesse (plafonné)' },
  vieillesseD:  { taux: 0.0040, plafonne: false, label: 'Assurance vieillesse (déplafonné)' },
  complementT1: { taux: 0.0317, plafonne: true,  label: 'Retraite compl. AGIRC-ARRCO T1' },
  CEG:          { taux: 0.0086, plafonne: false, label: 'CEG (contrib. équilibre général)' },
  // Cadre seulement
  complementT2: { taux: 0.0864, tranche2: true,  cadreOnly: true, label: 'Retraite compl. AGIRC-ARRCO T2' },
  CET:          { taux: 0.0014, plafonne: false,  cadreOnly: true, label: 'CET (contrib. équilibre technique)' },
};

// CSG/CRDS (assiette = brut × 98,25 %)
const CSG_CRDS = {
  CSGd:  { taux: 0.0680, deductible: true,  label: 'CSG déductible (6,80 %)' },
  CSGnd: { taux: 0.0240, deductible: false, label: 'CSG non déductible (2,40 %)' },
  CRDS:  { taux: 0.0050, deductible: false, label: 'CRDS (0,50 %)' },
};

// ─── Taux cotisations patronales ──────────────────────────────────────────────
const COTIS_PAT = {
  maladie:    { taux: 0.1300, plafonne: false },
  vieillesseP:{ taux: 0.0845, plafonne: true  },
  vieillesseD:{ taux: 0.0175, plafonne: false },
  allocFam:   { taux: 0.0525, plafonne: false },
  accidents:  { taux: 0.0200, plafonne: false },
  chomage:    { taux: 0.0405, plafonne: false },
  compT1:     { taux: 0.0472, plafonne: true  },
  compT2:     { taux: 0.1288, tranche2: true,  cadreOnly: true },
  CEG:        { taux: 0.0129, plafonne: false },
  CET:        { taux: 0.0021, plafonne: false, cadreOnly: true },
  FNAL:       { taux: 0.0010, plafonne: false },
};

// ─── Barème IR 2024 (par part de quotient familial) ──────────────────────────
const BAREME_IR = [
  { min: 0,      max: 11294,    taux: 0    },
  { min: 11294,  max: 28797,    taux: 0.11 },
  { min: 28797,  max: 82341,    taux: 0.30 },
  { min: 82341,  max: 177106,   taux: 0.41 },
  { min: 177106, max: Infinity, taux: 0.45 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const round2  = n => Math.round(n * 100) / 100;
const fmt     = (n, dec = 0) => (isFinite(n) ? n : 0).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtEur  = (n, dec = 0) => fmt(n, dec) + ' €';

// ─── Calcul IR annuel ─────────────────────────────────────────────────────────
function calcIR(revenuImposableAnnuel, parts) {
  const qf = revenuImposableAnnuel / parts;
  let irQF = 0;
  const tranches = [];

  for (const t of BAREME_IR) {
    if (t.taux === 0 || qf <= t.min) continue;
    const base    = Math.min(qf, t.max) - t.min;
    const montant = round2(base * t.taux);
    irQF += montant;
    tranches.push({
      label:   `${fmt(t.min)} € – ${t.max === Infinity ? '∞' : fmt(t.max)} €`,
      taux:    (t.taux * 100).toFixed(0) + ' %',
      montant: round2(montant * parts),
    });
  }

  return { irAnnuel: round2(irQF * parts), tranches };
}

// ─── Moteur de calcul principal ───────────────────────────────────────────────
/**
 * @param {object}  p
 * @param {number}  p.saisie         Valeur saisie par l'utilisateur
 * @param {string}  p.mode           'brut-net' | 'net-brut'
 * @param {string}  p.period         'mensuel' | 'annuel' | 'horaire'
 * @param {string}  p.statut         'non-cadre' | 'cadre' | 'fonctionnaire' | 'liberal' | 'portage' | 'apprenti'
 * @param {number}  p.tpsTravail     10..100 (%)
 * @param {number}  p.nbMois         12..15
 * @param {number}  p.parts          Nombre de parts fiscales
 * @param {number}  p.tauxPAS        0..45 (%)
 * @param {boolean} p.optMutuelle
 * @param {boolean} p.optTickets
 * @param {boolean} p.optHeuresSup
 * @param {boolean} p.optTeletravail
 */
function calculer(p) {
  const { saisie, mode, period, statut, tpsTravail, nbMois, parts, tauxPAS,
          optMutuelle, optTickets, optHeuresSup, optTeletravail } = p;

  const tauxTps = tpsTravail / 100;

  // ── [FIX 2,3] Normalisation : convertir la saisie en brut mensuel PLEIN TEMPS ─
  // On travaille toujours en équivalent plein-temps d'abord, puis on applique le tps partiel.
  let brutBase; // brut mensuel plein temps

  if (mode === 'brut-net') {
    if (period === 'mensuel') brutBase = saisie;
    else if (period === 'annuel')  brutBase = saisie / nbMois;
    else /* horaire */             brutBase = saisie * HEURES_MOIS; // plein temps équivalent
  } else {
    // net-brut : on estime le rapport net/brut selon statut
    const ratio = statut === 'cadre'          ? 0.752
                : statut === 'fonctionnaire'  ? 0.840
                : statut === 'liberal'        ? 0.545
                : statut === 'portage'        ? 0.695
                : statut === 'apprenti'       ? 1.000
                :                              0.775; // non-cadre

    if (period === 'mensuel') brutBase = saisie / ratio;
    else if (period === 'annuel')  brutBase = (saisie / nbMois) / ratio;
    else /* horaire */             brutBase = (saisie * HEURES_MOIS) / ratio;
  }

  // Appliquer le temps partiel UNE SEULE FOIS
  brutBase = round2(brutBase * tauxTps);

  // ── Heures supplémentaires (+10h, maj. 25 %, exonérées IR & SS) ─────────
  let brutHS = 0;
  if (optHeuresSup && statut !== 'apprenti') {
    const txHoraire = brutBase / (HEURES_MOIS * tauxTps);
    brutHS = round2(txHoraire * 1.25 * 10);
  }

  const brutMensuel = round2(brutBase + brutHS);

  // ── Apprenti : exonéré de toutes cotisations ─────────────────────────────
  if (statut === 'apprenti') {
    return _build({
      brutMensuel, brutHS, net: brutMensuel,
      cotisTotal: 0, csgTotal: 0, csgDeductible: 0,
      patronalTotal: 0, cotisDetails: [],
      irAnnuel: 0, irMensuel: 0, irTranches: [],
      pas: 0, netApresIR: brutMensuel,
      nbMois, tpsTravail, tauxPAS, parts,
      optMutuelle, optTickets, optTeletravail,
    });
  }

  // ── Assiettes ─────────────────────────────────────────────────────────────
  const plafonne  = Math.min(brutMensuel, PMSS);
  const dep       = brutMensuel;
  const tranche2  = Math.max(0, brutMensuel - PMSS);
  const assietteCsg = round2(brutMensuel * 0.9825);

  // ── [FIX 4,5] Cotisations salariales selon statut ───────────────────────
  const cotisDetails = [];
  let cotisTotal = 0;
  let csgDeductible = 0;
  let csgTotal = 0;

  if (statut === 'fonctionnaire') {
    // Pension civile (CNRACL) — inclut la part équivalente CSG dans le taux global
    const pension = round2(brutMensuel * 0.1120);
    cotisDetails.push({ label: 'Pension civile (CNRACL/SRE)', montant: pension, sub: true });
    cotisTotal += pension;

    // [FIX 4] CSG/CRDS s'applique aussi aux fonctionnaires
    const csgD  = round2(assietteCsg * CSG_CRDS.CSGd.taux);
    const csgND = round2(assietteCsg * CSG_CRDS.CSGnd.taux);
    const crds  = round2(assietteCsg * CSG_CRDS.CRDS.taux);
    csgDeductible = csgD;
    csgTotal      = csgD + csgND + crds;
    cotisDetails.push({ label: CSG_CRDS.CSGd.label,  montant: csgD,  sub: true, csg: true });
    cotisDetails.push({ label: CSG_CRDS.CSGnd.label, montant: csgND, sub: true, csg: true });
    cotisDetails.push({ label: CSG_CRDS.CRDS.label,  montant: crds,  sub: true, csg: true });

  } else if (statut === 'liberal') {
    // [FIX 5] TNS : on ne superpose PAS la CSG du régime général
    const cotisLib = round2(brutMensuel * 0.45);
    cotisDetails.push({ label: 'Cotisations sociales TNS/URSSAF (~45 %)', montant: cotisLib, sub: true });
    cotisTotal = cotisLib;
    // Pour les TNS, la CSG est incluse dans les 45 % — pas d'ajout supplémentaire
    csgDeductible = 0;
    csgTotal      = 0;

  } else {
    // Non-cadre, cadre, portage
    for (const [key, c] of Object.entries(COTIS_SAL)) {
      if (c.cadreOnly && statut !== 'cadre') continue;
      // Portage : pas de T2
      if (c.tranche2 && statut === 'portage') continue;

      const assiette = c.tranche2 ? tranche2 : c.plafonne ? plafonne : dep;
      const montant  = round2(assiette * c.taux);
      if (montant === 0) continue;
      cotisDetails.push({ label: c.label, montant, sub: true });
      cotisTotal += montant;
    }

    // Portage : frais de gestion société (~7 %)
    if (statut === 'portage') {
      const frais = round2(brutMensuel * 0.07);
      cotisDetails.push({ label: 'Frais de gestion portage (~7 %)', montant: frais, sub: true });
      cotisTotal += frais;
    }

    // CSG/CRDS (tous statuts sauf libéral)
    const csgD  = round2(assietteCsg * CSG_CRDS.CSGd.taux);
    const csgND = round2(assietteCsg * CSG_CRDS.CSGnd.taux);
    const crds  = round2(assietteCsg * CSG_CRDS.CRDS.taux);
    csgDeductible = csgD;
    csgTotal      = csgD + csgND + crds;
    cotisDetails.push({ label: CSG_CRDS.CSGd.label,  montant: csgD,  sub: true, csg: true });
    cotisDetails.push({ label: CSG_CRDS.CSGnd.label, montant: csgND, sub: true, csg: true });
    cotisDetails.push({ label: CSG_CRDS.CRDS.label,  montant: crds,  sub: true, csg: true });
  }

  const net = round2(brutMensuel - cotisTotal - csgTotal);

  // ── [FIX 9] Coût employeur ───────────────────────────────────────────────
  let patronalTotal = 0;
  if (statut !== 'liberal' && statut !== 'portage' && statut !== 'apprenti') {
    for (const [, c] of Object.entries(COTIS_PAT)) {
      // [FIX 9] Tranche 2 patronale seulement pour cadres
      if (c.cadreOnly && statut !== 'cadre') continue;
      const assiette = c.tranche2 ? tranche2 : c.plafonne ? plafonne : dep;
      patronalTotal += round2(assiette * c.taux);
    }
    patronalTotal = round2(patronalTotal);
  }

  // ── Impôt sur le revenu (estimation barème 2024) ─────────────────────────
  // Revenu net imposable = brut - cotisations déductibles - CSG déductible
  const revenuFiscalMensuel = round2(brutMensuel - cotisTotal - csgDeductible);
  const revenuBrut12        = revenuFiscalMensuel * nbMois;
  const abattement10        = Math.min(round2(revenuBrut12 * 0.10), 14171);
  const revenuImposable     = Math.max(0, round2(revenuBrut12 - abattement10));

  const { irAnnuel, tranches: irTranches } = calcIR(revenuImposable, parts);
  const irMensuel = round2(irAnnuel / 12);

  // ── [FIX 6] PAS transmis correctement ────────────────────────────────────
  const pas      = round2(net * (tauxPAS / 100));
  const netApresIR = round2(net - pas);

  return _build({
    brutMensuel, brutHS, net,
    cotisTotal, csgTotal, csgDeductible,
    patronalTotal, cotisDetails,
    irAnnuel, irMensuel, irTranches,
    pas, netApresIR,
    nbMois, tpsTravail, tauxPAS, parts,
    optMutuelle, optTickets, optTeletravail,
  });
}

// ─── Assemblage du résultat final ────────────────────────────────────────────
function _build(d) {
  const {
    brutMensuel, brutHS = 0, net,
    cotisTotal, csgTotal, csgDeductible = 0,
    patronalTotal, cotisDetails,
    irAnnuel, irMensuel = 0, irTranches = [],
    pas = 0, netApresIR,
    nbMois, tpsTravail, tauxPAS, parts,
    optMutuelle, optTickets, optTeletravail,
  } = d;

  // Options post-net
  const dedMutuelle    = optMutuelle    ? 50    : 0;
  const dedTickets     = optTickets     ? 100   : 0;
  const addTeletravail = optTeletravail ? 25    : 0; // 2,50 € × 10j

  // [FIX 7] netFinal calculé UNE SEULE FOIS
  const netFinal = round2(netApresIR - dedMutuelle - dedTickets + addTeletravail);

  const coutEmployeur = round2(brutMensuel + patronalTotal);
  const tauxTps       = tpsTravail / 100;

  // Conversions périodes
  const toAnn = x => round2(x * nbMois);
  const toHor = x => round2(x / (HEURES_MOIS * tauxTps));

  // Métriques
  const totalDeductions = cotisTotal + csgTotal;
  const tauxCharges = brutMensuel > 0
    ? (totalDeductions / brutMensuel * 100).toFixed(1) + ' %'
    : '— %';
  const tauxIR = irAnnuel > 0 && (net * nbMois) > 0
    ? (irAnnuel / (net * nbMois) * 100).toFixed(1) + ' %'
    : '0 %';

  return {
    // Mensuel
    brutMensuel,
    net,
    netApresIR,
    netFinal,
    coutEmployeur,
    irMensuel,
    pas,

    // Annuel
    brutAnnuel:       toAnn(brutMensuel),
    netAnnuel:        toAnn(net),
    netFinalAnnuel:   toAnn(netFinal),
    irAnnuel,

    // Horaire
    brutHoraire:      toHor(brutMensuel),
    netHoraire:       toHor(net),
    netFinalHoraire:  toHor(netFinal),

    // Détail cotisations
    cotisTotal,
    csgTotal,
    csgDeductible,
    patronalTotal,
    cotisDetails,
    brutHS,

    // IR
    irTranches,

    // Métriques formatées
    tauxCharges,
    tauxIR,

    // Transmis pour l'UI
    tauxPAS,
    nbMois,

    // Options (pour le breakdown)
    dedMutuelle,
    dedTickets,
    addTeletravail,
  };
}

// ─── Table d'exemples ─────────────────────────────────────────────────────────
const EXEMPLES_BRUTS = [1801.80, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000];

function genExemples() {
  return EXEMPLES_BRUTS.map(brut => {
    const r = calculer({
      saisie: brut, mode: 'brut-net', period: 'mensuel',
      statut: 'non-cadre', tpsTravail: 100, nbMois: 12, parts: 1,
      tauxPAS: 0, optMutuelle: false, optTickets: false,
      optHeuresSup: false, optTeletravail: false,
    });
    return {
      brut, net: r.net, netAnnuel: r.netAnnuel,
      tauxCharges: r.tauxCharges, coutEmployeur: r.coutEmployeur,
      ratio: brut > 0 ? (r.net / brut * 100).toFixed(1) + ' %' : '—',
    };
  });
}

// ─── Comparaison multi-statuts ────────────────────────────────────────────────
const STATUTS_COMPARE = [
  { val: 'non-cadre',    label: 'Non-cadre',        icon: '👔' },
  { val: 'cadre',        label: 'Cadre',             icon: '💼' },
  { val: 'fonctionnaire',label: 'Fonction publique', icon: '🏛' },
  { val: 'portage',      label: 'Portage salarial',  icon: '🤝' },
];

function genComparaison(brutMensuel) {
  return STATUTS_COMPARE.map(s => {
    const r = calculer({
      saisie: brutMensuel, mode: 'brut-net', period: 'mensuel',
      statut: s.val, tpsTravail: 100, nbMois: 12, parts: 1,
      tauxPAS: 0, optMutuelle: false, optTickets: false,
      optHeuresSup: false, optTeletravail: false,
    });
    return { ...s, net: r.net, ratio: r.net / brutMensuel };
  });
}

/* ═══════════════════════════════════════════════════════
   TMG Supplier Appreciation Dinner 2026 — Frontend JS
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ── Config ───────────────────────────────────────────── */
const API = 'http://localhost:4000/api';
const BANK_DETAILS = {
  bank:    'Maybank Berhad',
  name:    'TMG Group Sdn Bhd',
  account: '1234 5678 9012',
  ref:     'TMGDINNER2026 + Company Name',
};

/* ── Package definitions ─────────────────────────────── */
const PKG = {
  gold:   { label: '⭐ Gold',   price: 50000, seats: 10, zone: 'Gold VIP',   bc: 'b-gold',   col: 'text-yellow-400' },
  silver: { label: '🥈 Silver', price: 30000, seats: 6,  zone: 'Silver',     bc: 'b-silver', col: 'text-slate-300' },
  bronze: { label: '🥉 Bronze', price: 10000, seats: 2,  zone: 'Bronze',     bc: 'b-bronze', col: 'text-orange-400' },
};

/* ── State ───────────────────────────────────────────── */
let BOOKINGS       = [];
let TAKEN_TABLES   = new Set();
let currentAdmin   = null;
let currentPkg     = null;
let selectedTable  = null;
let bFilterVal     = 'all';
let ciLog          = [];
let slipFile       = null;
let scale          = 1;

const ADMINS = [
  { u: 'admin',   p: 'tmg2026',  n: 'Admin' },
  { u: 'itadmin', p: 'tmg@it',   n: 'IT Admin' },
  { u: 'dato',    p: 'dato123',  n: 'Dato (Read Only)' },
];

const ZONES = {
  gold:   { count: 8,  start: 1,  cap: 10 },
  silver: { count: 16, start: 9,  cap: 6  },
  bronze: { count: 30, start: 25, cap: 2  },
};

/* ═══════════════════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════════════════ */
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, opts);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.warn('API error:', e.message);
    return null;
  }
}

async function loadBookings() {
  const data = await apiFetch('/suppliers');
  if (data?.data) {
    BOOKINGS = data.data;
    TAKEN_TABLES = new Set(BOOKINGS.map(b => b.tbl ?? b.table_no));
  }
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════ */
function goTo(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
function showAdminLogin() { goTo('pg-adminlogin'); }

/* ═══════════════════════════════════════════════════════
   SUPPLIER FLOW
   ═══════════════════════════════════════════════════════ */
function selectPkg(pkg) {
  currentPkg = pkg;
  selectedTable = null;
  buildVenue(pkg);
  const p = PKG[pkg];
  document.getElementById('seat-pkg-label').textContent = p.label + ' – RM ' + fmt(p.price);
  document.getElementById('side-pkg-name').textContent  = p.label;
  document.getElementById('side-pkg-price').textContent = 'RM ' + fmt(p.price);
  document.getElementById('side-pkg-info').textContent  = 'Select 1 table · ' + p.seats + ' seats';
  document.getElementById('seat-confirm-btn').classList.add('hidden');
  document.getElementById('seat-selected-badge').classList.add('hidden');
  document.getElementById('side-selected').classList.add('hidden');
  const btn = document.getElementById('side-confirm-btn');
  btn.disabled = true;
  btn.classList.add('opacity-40', 'cursor-not-allowed');
  goTo('pg-seats');
}

/* ── Build venue map ────────────────────────────────── */
function buildVenue(pkg) {
  ['gold', 'silver', 'bronze'].forEach(z => {
    const c = document.getElementById('zone-' + z);
    c.innerHTML = '';
    const { count, start, cap } = ZONES[z];
    const eligible = z === pkg;
    for (let i = 0; i < count; i++) {
      const n = start + i;
      const taken = TAKEN_TABLES.has(n);
      c.appendChild(makeTable(n, z, taken, eligible, cap));
    }
    const section = c.closest('.zone-group');
    if (section) {
      section.style.opacity = eligible ? '1' : '0.45';
      section.style.filter  = eligible ? 'none' : 'grayscale(50%)';
    }
  });
}

function makeTable(n, zone, taken, eligible, cap) {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center gap-1.5';
  const sz = zone === 'gold' ? 76 : zone === 'silver' ? 62 : 50;
  const tbl = document.createElement('div');
  tbl.id = 'tbl-' + n;
  tbl.className = 'tbl ' + (taken ? 'tbl-taken' : eligible ? 'tbl-' + zone : 'tbl-' + zone + ' opacity-40 cursor-not-allowed');
  tbl.style.cssText = `width:${sz}px;height:${sz}px`;
  tbl.innerHTML = `<span style="font-size:${zone === 'gold' ? 11 : 9}px">T${n}</span><span style="font-size:8px;opacity:.6">${cap}px</span>${taken ? '<span style="font-size:8px;opacity:.5">Taken</span>' : ''}`;
  if (!taken && eligible) tbl.onclick = () => pickTable(n, zone, cap);
  const dots = document.createElement('div');
  dots.className = 'flex gap-0.5 flex-wrap justify-center';
  for (let d = 0; d < Math.min(cap, 10); d++) {
    const dot = document.createElement('span');
    const s = zone === 'gold' ? 6 : zone === 'silver' ? 5 : 4;
    dot.style.cssText = `width:${s}px;height:${s}px;border-radius:50%;display:inline-block;background:${taken ? '#1E1E1E' : zone === 'gold' ? '#6A5010' : zone === 'silver' ? '#3A4A5A' : '#5A3010'}`;
    dots.appendChild(dot);
  }
  wrap.appendChild(tbl);
  wrap.appendChild(dots);
  return wrap;
}

function pickTable(n, zone, cap) {
  if (selectedTable) {
    const prev = document.getElementById('tbl-' + selectedTable.n);
    if (prev) { prev.className = 'tbl tbl-' + selectedTable.zone; }
  }
  selectedTable = { n, zone, cap };
  const el = document.getElementById('tbl-' + n);
  el.classList.add('tbl-selected');
  const zl = { gold: 'Gold VIP Zone', silver: 'Silver Front', bronze: 'Bronze General' };
  document.getElementById('seat-confirm-btn').classList.remove('hidden');
  document.getElementById('seat-selected-badge').classList.remove('hidden');
  document.getElementById('seat-selected-badge').textContent = 'Table ' + n + ' selected';
  document.getElementById('side-selected').classList.remove('hidden');
  document.getElementById('side-tnum').textContent  = 'T' + n;
  document.getElementById('side-tname').textContent = 'Table ' + n;
  document.getElementById('side-tzone').textContent = zl[zone];
  document.getElementById('side-tseats').textContent = cap;
  document.getElementById('side-tzoneV').textContent = zone.charAt(0).toUpperCase() + zone.slice(1);
  const btn = document.getElementById('side-confirm-btn');
  btn.disabled = false;
  btn.classList.remove('opacity-40', 'cursor-not-allowed');
  toast('Table ' + n + ' selected – ' + cap + ' seats');
}

function confirmTable() {
  if (!selectedTable) { toast('Please select a table', 'warn'); return; }
  const p = PKG[currentPkg];
  const zl = { gold: 'Gold VIP Zone', silver: 'Silver Front Section', bronze: 'Bronze General' };
  document.getElementById('sum-tnum').textContent  = 'T' + selectedTable.n;
  document.getElementById('sum-desc').textContent  = 'Table ' + selectedTable.n + ' – ' + zl[selectedTable.zone];
  document.getElementById('sum-pkg').textContent   = p.label + ' · RM ' + fmt(p.price) + ' · ' + p.seats + ' seats';
  document.getElementById('f-amount').textContent  = 'RM ' + fmt(p.price);
  buildGuestRows(p.seats);
  // Reset slip
  slipFile = null;
  document.getElementById('slip-fn').textContent   = '';
  document.getElementById('slip-fn').className     = 'text-xs text-muted';
  document.getElementById('slip-zone').classList.remove('has-file');
  goTo('pg-form');
}

/* ── Guest rows ─────────────────────────────────────── */
function buildGuestRows(n) {
  const c = document.getElementById('guest-rows');
  c.innerHTML = '';
  for (let i = 1; i <= n; i++) {
    const r = document.createElement('div');
    r.className = 'grid grid-cols-3 gap-2 p-3 bg-panel rounded-xl border border-rim';
    r.innerHTML = `
      <div><label class="text-xs text-muted block mb-1">Guest ${i}</label><input class="inp text-xs py-2" placeholder="Full name"/></div>
      <div><label class="text-xs text-muted block mb-1">Position</label><input class="inp text-xs py-2" placeholder="CEO"/></div>
      <div><label class="text-xs text-muted block mb-1">Dietary</label><select class="inp text-xs py-2"><option>Standard</option><option>Vegetarian</option><option>Halal Only</option><option>No Pork</option><option>Vegan</option></select></div>`;
    c.appendChild(r);
  }
}

/* ── Slip upload ─────────────────────────────────────── */
function handleSlipChange(input) {
  const file = input.files[0];
  if (!file) return;
  slipFile = file;
  document.getElementById('slip-fn').textContent = '✓ ' + file.name;
  document.getElementById('slip-fn').className   = 'text-xs text-emerald-400';
  document.getElementById('slip-zone').classList.add('has-file');
}

/* ── Submit registration ─────────────────────────────── */
async function submitReg() {
  const co = document.getElementById('f-co').value.trim();
  const cp = document.getElementById('f-cp').value.trim();
  const em = document.getElementById('f-em').value.trim();
  const ph = document.getElementById('f-ph').value.trim();
  if (!co || !cp || !em || !ph)  { toast('Please fill in all required fields', 'warn'); return; }
  if (!slipFile)                  { toast('Please upload your payment slip', 'warn'); return; }

  const p = PKG[currentPkg];
  const guestEls = document.querySelectorAll('#guest-rows > div');
  const guests = [...guestEls].map(row => {
    const inputs = row.querySelectorAll('input, select');
    return { guest_name: inputs[0].value || 'Guest', position: inputs[1].value, dietary: inputs[2].value };
  });

  // Build FormData for multipart (slip + data)
  const fd = new FormData();
  fd.append('company_name',    co);
  fd.append('contact_name',    cp);
  fd.append('designation',     document.getElementById('f-des').value || '');
  fd.append('email',           em);
  fd.append('phone',           ph);
  fd.append('package',         currentPkg);
  fd.append('table_no',        selectedTable.n);
  fd.append('guests',          JSON.stringify(guests));
  fd.append('slip',            slipFile);

  toast('Submitting registration…');

  const result = await fetch(API + '/suppliers', { method: 'POST', body: fd })
    .then(r => r.json()).catch(() => null);

  let tid, displayCo;
  if (result?.ticket_id) {
    tid = result.ticket_id;
    displayCo = co;
    await loadBookings();
    TAKEN_TABLES.add(selectedTable.n);
  } else {
    // Offline fallback for demo
    tid = 'TMG-2026-' + String(Date.now()).slice(-3);
    displayCo = co;
  }

  document.getElementById('c-tid').textContent  = tid;
  document.getElementById('c-co').textContent   = displayCo;
  document.getElementById('c-pkg').textContent  = p.label + ' · RM ' + fmt(p.price);
  document.getElementById('c-tbl').textContent  = 'Table ' + selectedTable.n + ' · ' + PKG[currentPkg].zone + ' Zone · ' + p.seats + ' seats';
  genQR(tid + '|' + displayCo + '|T' + selectedTable.n, 'c-qr');
  updateLandStats();
  goTo('pg-confirm');
  toast('✓ Registration submitted! Ticket: ' + tid);
}

/* ── QR Generator ────────────────────────────────────── */
function genQR(data, elId) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  new QRCode(el, { text: String(data), width: 160, height: 160, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
}

/* ── Update landing stats ────────────────────────────── */
function updateLandStats() {
  const pax = BOOKINGS.reduce((a, b) => a + (b.pax ?? b.total_seats ?? 0), 0);
  document.getElementById('land-pax').textContent      = pax || '—';
  document.getElementById('land-sponsors').textContent = BOOKINGS.length;
}

/* ── Venue zoom / pan ────────────────────────────────── */
function initVenueControls() {
  const vw = document.getElementById('venue-wrap');
  const vi = document.getElementById('venue-inner');
  vw.addEventListener('wheel', e => {
    e.preventDefault();
    scale = Math.max(.5, Math.min(2, scale - e.deltaY * .001));
    vi.style.transform = `scale(${scale})`;
  }, { passive: false });
  let pan = false, sx, sy, sl, st;
  vw.addEventListener('mousedown', e => { pan = true; sx = e.pageX - vw.offsetLeft; sy = e.pageY - vw.offsetTop; sl = vw.scrollLeft; st = vw.scrollTop; });
  vw.addEventListener('mouseleave', () => pan = false);
  vw.addEventListener('mouseup',    () => pan = false);
  vw.addEventListener('mousemove',  e => { if (!pan) return; e.preventDefault(); vw.scrollLeft = sl - (e.pageX - vw.offsetLeft - sx); vw.scrollTop = st - (e.pageY - vw.offsetTop - sy); });
}
function resetVenue() {
  scale = 1;
  document.getElementById('venue-inner').style.transform = 'scale(1)';
  document.getElementById('venue-wrap').scrollLeft = 0;
  document.getElementById('venue-wrap').scrollTop  = 0;
}

/* ═══════════════════════════════════════════════════════
   ADMIN AUTH
   ═══════════════════════════════════════════════════════ */
function doAdminLogin() {
  const u = document.getElementById('al-user').value.trim();
  const p = document.getElementById('al-pass').value;
  const found = ADMINS.find(a => a.u === u && a.p === p);
  if (found) {
    currentAdmin = found;
    document.getElementById('a-name').textContent   = found.n;
    document.getElementById('a-avatar').textContent = found.n.charAt(0);
    goTo('pg-admin');
    initAdminDash();
    toast('Welcome, ' + found.n + '!');
  } else {
    const err = document.getElementById('al-err');
    err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 3000);
  }
}
function adminLogout()  { currentAdmin = null; goTo('pg-land'); }
function togglePass()   { const i = document.getElementById('al-pass'); i.type = i.type === 'password' ? 'text' : 'password'; }

/* ═══════════════════════════════════════════════════════
   ADMIN SECTIONS
   ═══════════════════════════════════════════════════════ */
const SEC_TITLES = {
  overview: ['Overview',      'Dashboard & key metrics'],
  bookings: ['All Bookings',  'Sponsor registration list'],
  payments: ['Payments',      'Approve & track payments'],
  seating:  ['Seating Plan',  'Table assignments'],
  checkin:  ['Check-In',      'Event day attendance'],
  reports:  ['Reports & Exports', 'Download data'],
};

function asec(id) {
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  const ni = [...document.querySelectorAll('.ni')].find(n => n.getAttribute('onclick') === `asec('${id}')`);
  if (ni) ni.classList.add('on');
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.getElementById('sec-' + id).classList.add('on');
  const [t, s] = SEC_TITLES[id];
  document.getElementById('a-pg-title').textContent = t;
  document.getElementById('a-pg-sub').textContent   = s;
  if (id === 'bookings') renderBookings();
  if (id === 'payments') renderPayments();
  if (id === 'seating')  renderAdminSeating();
  if (id === 'reports')  renderReports();
}

/* ═══════════════════════════════════════════════════════
   ADMIN DASHBOARD INIT
   ═══════════════════════════════════════════════════════ */
async function initAdminDash() {
  await loadBookings();
  const paid  = BOOKINGS.filter(b => b.pay === 'paid' || b.payment_status === 'paid');
  const rev   = paid.reduce((a, b) => a + (PKG[b.pkg ?? b.package]?.price ?? 0), 0);
  const pax   = BOOKINGS.reduce((a, b) => a + (b.pax ?? b.total_seats ?? 0), 0);
  const pend  = BOOKINGS.filter(b => (b.pay ?? b.payment_status) !== 'paid').length;

  document.getElementById('as-total').textContent  = BOOKINGS.length;
  document.getElementById('as-pax').textContent    = pax;
  document.getElementById('as-rev').textContent    = 'RM ' + fmt(rev);
  document.getElementById('as-rev-bar').style.width = (rev / 2500000 * 100).toFixed(1) + '%';
  document.getElementById('as-pend').textContent   = pend;
  document.getElementById('nb-book').textContent   = BOOKINGS.length;
  document.getElementById('nb-pay').textContent    = pend;

  const capPct = Math.round(pax / 1000 * 100);
  document.getElementById('cap-label').textContent = pax + ' / 1,000 seats';
  document.getElementById('cap-bar').style.width   = capPct + '%';
  document.getElementById('cap-pct').textContent   = capPct + '%';

  // Package breakdown
  const pb = document.getElementById('pkg-breakdown');
  pb.innerHTML = '';
  ['gold', 'silver', 'bronze'].forEach(k => {
    const all = BOOKINGS.filter(b => (b.pkg ?? b.package) === k);
    const p = PKG[k];
    const r = document.createElement('div');
    r.className = 'flex items-center gap-3';
    r.innerHTML = `<span class="badge ${p.bc} flex-shrink-0">${p.label}</span>
      <div class="flex-1"><div class="prog"><div class="prog-fill" style="width:${Math.min(100, (all.length / 15) * 100)}%;background:${k === 'gold' ? '#C9A84C' : k === 'silver' ? '#94A3B8' : '#CD7F32'}"></div></div></div>
      <span class="text-xs text-gray-400 flex-shrink-0 w-14 text-right">${all.length} · RM ${fmt(all.length * p.price / 1000)}K</span>`;
    pb.appendChild(r);
  });

  // Recent mini table
  const rows = BOOKINGS.slice(-5).reverse().map(b => {
    const pkg = b.pkg ?? b.package;
    const pay = b.pay ?? b.payment_status;
    return `<tr class="tr border-t border-rim cursor-pointer" onclick="openModal('${b.ticket_id ?? b.tid}')">
      <td class="px-4 py-3 text-xs font-medium text-gray-100">${(b.co ?? b.company_name).split(' ').slice(0,3).join(' ')}<div class="text-[10px] text-muted">${b.tid ?? b.ticket_id}</div></td>
      <td class="px-4 py-3"><span class="badge ${PKG[pkg]?.bc ?? ''}">${PKG[pkg]?.label ?? pkg}</span></td>
      <td class="px-4 py-3"><span class="badge b-${pay}">${pay}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('ov-recent').innerHTML = `<table class="w-full">
    <thead><tr class="bg-panel"><th class="px-4 py-2.5 text-left text-[10px] text-muted uppercase tracking-wider font-medium">Company</th><th class="px-4 py-2.5 text-left text-[10px] text-muted uppercase tracking-wider font-medium">Package</th><th class="px-4 py-2.5 text-left text-[10px] text-muted uppercase tracking-wider font-medium">Status</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/* ═══════════════════════════════════════════════════════
   BOOKINGS TABLE
   ═══════════════════════════════════════════════════════ */
function bFilter(f, el) {
  bFilterVal = f;
  document.querySelectorAll('.pt').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  renderBookings();
}

function renderBookings() {
  const srch = (document.getElementById('bf-search')?.value || '').toLowerCase();
  const pkg  = document.getElementById('bf-pkg')?.value || '';
  const data = BOOKINGS.filter(b => {
    const co  = b.co ?? b.company_name ?? '';
    const tid = b.tid ?? b.ticket_id ?? '';
    const cp  = b.cp  ?? b.contact_name ?? '';
    const pay = b.pay ?? b.payment_status ?? '';
    const bpkg = b.pkg ?? b.package ?? '';
    const mf = bFilterVal === 'all' || pay === bFilterVal;
    const ms = !srch || co.toLowerCase().includes(srch) || tid.toLowerCase().includes(srch) || cp.toLowerCase().includes(srch);
    const mp = !pkg || bpkg === pkg;
    return mf && ms && mp;
  });

  document.getElementById('bc-all').textContent  = BOOKINGS.length;
  document.getElementById('bc-paid').textContent = BOOKINGS.filter(b => (b.pay ?? b.payment_status) === 'paid').length;
  document.getElementById('bc-pend').textContent = BOOKINGS.filter(b => (b.pay ?? b.payment_status) === 'pending').length;
  document.getElementById('bc-rev').textContent  = BOOKINGS.filter(b => (b.pay ?? b.payment_status) === 'review').length;

  const rows = data.map(b => {
    const co  = b.co ?? b.company_name;
    const tid = b.tid ?? b.ticket_id;
    const cp  = b.cp  ?? b.contact_name;
    const pay = b.pay ?? b.payment_status;
    const bpkg = b.pkg ?? b.package;
    const tbl = b.tbl ?? b.table_no;
    const pax = b.pax ?? b.total_seats;
    const ci  = b.ci  ?? b.checked_in;
    const reg = b.reg ?? b.registered_at?.slice(0, 10) ?? '';
    return `<tr class="tr border-t border-rim cursor-pointer" onclick="openModal('${tid}')">
      <td class="px-5 py-3.5"><div class="font-medium text-sm text-gray-100">${co}</div><div class="text-xs text-muted">${tid}</div></td>
      <td class="px-5 py-3.5 text-sm text-gray-300">${cp}<div class="text-xs text-muted">${b.des ?? b.designation ?? ''}</div></td>
      <td class="px-5 py-3.5"><span class="badge ${PKG[bpkg]?.bc ?? ''}">${PKG[bpkg]?.label ?? bpkg}</span></td>
      <td class="px-5 py-3.5 text-sm text-gray-300">T${tbl}</td>
      <td class="px-5 py-3.5 text-sm text-gray-300">${pax}</td>
      <td class="px-5 py-3.5"><span class="badge b-${pay}">${pay.charAt(0).toUpperCase() + pay.slice(1)}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs ${ci ? 'text-purple-400' : 'text-muted'}">${ci ? '✓ In' : '—'}</span></td>
      <td class="px-5 py-3.5 text-xs text-muted">${reg}</td>
      <td class="px-5 py-3.5"><div class="flex gap-1.5" onclick="event.stopPropagation()">
        ${pay !== 'paid' ? `<button onclick="approvePay('${tid}')" class="btn-ok text-xs py-1 px-2.5">✓</button>` : ''}
        <button onclick="openModal('${tid}')" class="btn-rim text-xs py-1 px-2.5">View</button>
      </div></td>
    </tr>`;
  }).join('');

  document.getElementById('bookings-tbl').innerHTML = `<table class="w-full">
    <thead><tr class="bg-panel">${['Company','Contact','Package','Table','Pax','Payment','CI','Date','Actions'].map(h => `<th class="px-5 py-3 text-left text-xs text-muted font-medium uppercase tracking-wider whitespace-nowrap">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="px-5 py-10 text-center text-xs text-muted">No records</td></tr>'}</tbody></table>`;
}

/* ═══════════════════════════════════════════════════════
   PAYMENTS
   ═══════════════════════════════════════════════════════ */
function renderPayments() {
  const paid = BOOKINGS.filter(b => (b.pay ?? b.payment_status) === 'paid');
  const pend = BOOKINGS.filter(b => (b.pay ?? b.payment_status) !== 'paid');
  document.getElementById('pp-pend').textContent  = pend.length;
  document.getElementById('pp-paid').textContent  = paid.length;
  document.getElementById('pp-total').textContent = 'RM ' + fmt(paid.reduce((a, b) => a + (PKG[b.pkg ?? b.package]?.price ?? 0), 0));

  const rows = [...pend, ...paid].map(b => {
    const co  = b.co ?? b.company_name;
    const tid = b.tid ?? b.ticket_id;
    const pay = b.pay ?? b.payment_status;
    const bpkg = b.pkg ?? b.package;
    const reg = (b.reg ?? b.registered_at ?? '').slice(0, 10);
    const slip = b.payment_slip_url;
    return `<tr class="tr border-t border-rim">
      <td class="px-5 py-4"><div class="font-medium text-sm text-gray-100">${co}</div><div class="text-xs text-muted">${tid}</div></td>
      <td class="px-5 py-4"><span class="badge ${PKG[bpkg]?.bc ?? ''}">${PKG[bpkg]?.label ?? bpkg}</span></td>
      <td class="px-5 py-4 font-semibold text-sm ${pay === 'paid' ? 'text-emerald-400' : 'text-gray-200'}">RM ${fmt(PKG[bpkg]?.price ?? 0)}</td>
      <td class="px-5 py-4">${slip ? `<a href="${API.replace('/api','')}${slip}" target="_blank" class="text-xs text-blue-400 underline">View Slip</a>` : '<span class="text-xs text-muted">—</span>'}</td>
      <td class="px-5 py-4"><span class="badge b-${pay}">${pay.charAt(0).toUpperCase() + pay.slice(1)}</span></td>
      <td class="px-5 py-4 text-xs text-muted">${reg}</td>
      <td class="px-5 py-4">${pay !== 'paid'
        ? `<div class="flex gap-1.5"><button onclick="approvePay('${tid}')" class="btn-ok text-xs py-1.5 px-3">✓ Approve</button><button onclick="rejectPay('${tid}')" class="btn-warn text-xs py-1.5 px-3">✕ Reject</button></div>`
        : `<span class="text-xs text-emerald-400">Verified ✓</span>`}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('payments-tbl').innerHTML = `<table class="w-full">
    <thead><tr class="bg-panel">${['Company','Package','Amount','Slip','Status','Date','Action'].map(h => `<th class="px-5 py-3 text-left text-xs text-muted font-medium uppercase tracking-wider">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table>`;
}

async function approvePay(tid) {
  const b = BOOKINGS.find(x => (x.tid ?? x.ticket_id) === tid);
  if (!b) return;
  await apiFetch('/suppliers/' + tid + '/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid', verified_by: currentAdmin?.n ?? 'admin' }) });
  b.pay = b.payment_status = 'paid';
  toast('✓ Payment approved – ' + (b.co ?? b.company_name));
  renderPayments(); renderBookings(); initAdminDash();
}

async function rejectPay(tid) {
  const b = BOOKINGS.find(x => (x.tid ?? x.ticket_id) === tid);
  if (!b) return;
  await apiFetch('/suppliers/' + tid + '/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', verified_by: currentAdmin?.n ?? 'admin' }) });
  b.pay = b.payment_status = 'rejected';
  toast('Payment rejected', 'warn');
  renderPayments(); renderBookings(); initAdminDash();
}

/* ═══════════════════════════════════════════════════════
   SEATING (admin)
   ═══════════════════════════════════════════════════════ */
function renderAdminSeating() {
  const g = document.getElementById('admin-seat-grid');
  g.innerHTML = '';
  for (let t = 1; t <= 54; t++) {
    const z = t <= 8 ? 'gold' : t <= 24 ? 'silver' : 'bronze';
    const b = BOOKINGS.find(x => (x.tbl ?? x.table_no) === t);
    const pay = b ? (b.pay ?? b.payment_status) : '';
    const colBorder = b ? (z === 'gold' ? 'border-yellow-400/30' : z === 'silver' ? 'border-slate-500/25' : 'border-orange-600/25') : 'border-rim';
    const colBg     = b ? (z === 'gold' ? 'bg-yellow-400/5' : z === 'silver' ? 'bg-slate-500/5' : 'bg-orange-600/5') : 'bg-panel';
    const card = document.createElement('div');
    card.className = `border ${colBorder} ${colBg} rounded-xl p-3 text-center cursor-pointer hover:border-yellow-400/30 transition-colors`;
    if (b) card.onclick = () => openModal(b.tid ?? b.ticket_id);
    const pax = b ? (b.pax ?? b.total_seats) : '';
    card.innerHTML = `<div class="fd font-bold text-xs text-yellow-400 mb-1">T${t}</div>
      ${b
        ? `<div class="text-[10px] text-gray-300 truncate font-medium">${(b.co ?? b.company_name).split(' ').slice(0,2).join(' ')}</div>
           <div class="text-[9px] text-muted mt-0.5">${pax} pax</div>
           <span class="badge b-${pay} mt-1.5" style="font-size:9px;padding:1px 5px">${pay}</span>`
        : `<div class="text-[10px] text-muted">Available</div>
           <div class="text-[9px] text-muted mt-0.5">${z === 'gold' ? 10 : z === 'silver' ? 6 : 2} seats</div>`}`;
    g.appendChild(card);
  }
}

/* ═══════════════════════════════════════════════════════
   CHECK-IN
   ═══════════════════════════════════════════════════════ */
function doCI()       { const c = document.getElementById('ci-inp').value.trim().toUpperCase(); processCI(c); document.getElementById('ci-inp').value = ''; }
function dCI(c)       { document.getElementById('ci-inp').value = c; doCI(); }

async function processCI(code) {
  const res = document.getElementById('ci-result');
  res.classList.remove('hidden');

  // Try API first
  const apiRes = await apiFetch('/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: code, scanned_by: currentAdmin?.n ?? 'staff' })
  });

  // Also check local BOOKINGS for demo
  const b = BOOKINGS.find(x => (x.tid ?? x.ticket_id)?.toUpperCase() === code);

  if (apiRes?.error === 'Ticket not found' || (!apiRes && !b)) {
    res.className = 'surface rounded-2xl p-5 text-center ap border border-red-500/25';
    res.innerHTML = `<div class="text-4xl mb-2">❌</div><div class="fd text-lg font-bold">Not Found</div><div class="text-xs text-muted mt-1">${code}</div>`;
    toast('Invalid ticket', 'warn'); return;
  }
  if (apiRes?.error === 'Already checked in' || (b?.ci ?? b?.checked_in)) {
    res.className = 'surface rounded-2xl p-5 text-center ap border border-amber-500/25';
    const co = b ? (b.co ?? b.company_name) : code;
    res.innerHTML = `<div class="text-4xl mb-2">⚠️</div><div class="fd text-lg font-bold">${co}</div><div class="text-xs text-amber-400 mt-1 font-semibold">Already checked in</div>`;
    toast('Already checked in', 'warn'); return;
  }

  if (b) { b.ci = b.checked_in = 1; }
  const supplier = apiRes?.supplier ?? b;
  const co = supplier ? (supplier.co ?? supplier.company_name) : code;
  const tbl = supplier ? (supplier.tbl ?? supplier.table_no) : '?';
  const pax = supplier ? (supplier.pax ?? supplier.total_seats) : '?';
  const bpkg = supplier ? (supplier.pkg ?? supplier.package) : 'bronze';

  res.className = 'surface rounded-2xl p-5 text-center ap border border-emerald-500/25';
  res.innerHTML = `<div class="text-4xl mb-2">✅</div><div class="fd text-lg font-bold text-gray-100">${co}</div>
    <div class="text-sm text-gray-400 mt-1">${supplier?.cp ?? supplier?.contact_name ?? ''} · ${pax} pax · T${tbl}</div>
    <div class="flex justify-center mt-2"><span class="badge ${PKG[bpkg]?.bc ?? ''}">${PKG[bpkg]?.label ?? bpkg}</span></div>`;

  const now = new Date();
  ciLog.unshift({ ...supplier, co, time: now.toTimeString().slice(0, 5) });
  renderCILog();
  document.getElementById('ci-cnt').textContent = ciLog.length;
  toast('✅ ' + co + ' checked in!');
}

function renderCILog() {
  const el = document.getElementById('ci-log');
  el.innerHTML = ciLog.length
    ? ciLog.map(c => {
        const bpkg = c.pkg ?? c.package ?? 'bronze';
        const tid  = c.tid ?? c.ticket_id ?? '';
        const tbl  = c.tbl ?? c.table_no ?? '?';
        return `<div class="px-5 py-3 flex items-center justify-between gap-2">
          <div><div class="text-sm font-medium text-gray-200">${c.co ?? c.company_name}</div><div class="text-xs text-muted">${tid} · T${tbl}</div></div>
          <div class="text-right flex-shrink-0"><span class="badge ${PKG[bpkg]?.bc ?? ''}" style="font-size:10px">${PKG[bpkg]?.label ?? bpkg}</span><div class="text-[10px] text-muted mt-0.5">${c.time}</div></div>
        </div>`;
      }).join('')
    : '<div class="px-5 py-8 text-center text-xs text-muted">No check-ins yet</div>';
}

/* ═══════════════════════════════════════════════════════
   REPORTS
   ═══════════════════════════════════════════════════════ */
function renderReports() {
  const rows = ['gold', 'silver', 'bronze'].map(k => {
    const all  = BOOKINGS.filter(b => (b.pkg ?? b.package) === k);
    const paid = all.filter(b => (b.pay ?? b.payment_status) === 'paid');
    const p    = PKG[k];
    return `<tr class="tr border-t border-rim">
      <td class="px-5 py-3.5"><span class="badge ${p.bc}">${p.label}</span></td>
      <td class="px-5 py-3.5 text-sm text-gray-300">${all.length}</td>
      <td class="px-5 py-3.5 text-sm text-gray-300">${all.reduce((a, b) => a + (b.pax ?? b.total_seats ?? 0), 0)}</td>
      <td class="px-5 py-3.5 text-sm font-semibold text-yellow-400">RM ${fmt(all.length * p.price)}</td>
      <td class="px-5 py-3.5 text-sm text-emerald-400 font-semibold">${paid.length}</td>
      <td class="px-5 py-3.5 text-sm text-amber-400 font-semibold">${all.length - paid.length}</td>
    </tr>`;
  }).join('');
  const tot = `<tr class="border-t-2 border-yellow-400/15 bg-yellow-400/3">
    <td class="px-5 py-3.5 font-bold text-gray-200">Total</td>
    <td class="px-5 py-3.5 font-bold text-gray-200">${BOOKINGS.length}</td>
    <td class="px-5 py-3.5 font-bold text-gray-200">${BOOKINGS.reduce((a, b) => a + (b.pax ?? b.total_seats ?? 0), 0)}</td>
    <td class="px-5 py-3.5 font-bold gt">RM ${fmt(BOOKINGS.reduce((a, b) => a + (PKG[b.pkg ?? b.package]?.price ?? 0), 0))}</td>
    <td class="px-5 py-3.5 font-bold text-emerald-400">${BOOKINGS.filter(b => (b.pay ?? b.payment_status) === 'paid').length}</td>
    <td class="px-5 py-3.5 font-bold text-amber-400">${BOOKINGS.filter(b => (b.pay ?? b.payment_status) !== 'paid').length}</td>
  </tr>`;
  document.getElementById('rep-summary').innerHTML = `<table class="w-full">
    <thead><tr class="bg-panel">${['Package','Count','Seats','Revenue','Paid','Pending'].map(h => `<th class="px-5 py-3 text-left text-xs text-muted font-medium uppercase tracking-wider">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows + tot}</tbody></table>`;
}

/* ═══════════════════════════════════════════════════════
   BOOKING DETAIL MODAL
   ═══════════════════════════════════════════════════════ */
function openModal(tid) {
  const b = BOOKINGS.find(x => (x.tid ?? x.ticket_id) === tid);
  if (!b) return;
  const pkg = b.pkg ?? b.package;
  const pay = b.pay ?? b.payment_status;
  const p   = PKG[pkg] ?? { label: pkg, price: 0, zone: '—', bc: '' };
  const co  = b.co ?? b.company_name;
  const cp  = b.cp ?? b.contact_name;
  const des = b.des ?? b.designation ?? '';
  const em  = b.em ?? b.email ?? '';
  const ph  = b.ph ?? b.phone ?? '';
  const tbl = b.tbl ?? b.table_no;
  const pax = b.pax ?? b.total_seats;
  const ci  = b.ci  ?? b.checked_in;
  const reg = (b.reg ?? b.registered_at ?? '').slice(0, 10);
  const slip = b.payment_slip_url;
  const btid = b.tid ?? b.ticket_id;
  const guests = b.guests ? (typeof b.guests === 'string' ? JSON.parse(b.guests) : b.guests) : [];

  document.getElementById('modal-bk-body').innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-2xl bg-yellow-400/8 border border-yellow-400/20 fd font-black text-yellow-400 flex items-center justify-center text-sm flex-shrink-0">T${tbl}</div>
      <div class="flex-1 min-w-0">
        <div class="fd text-xl font-bold truncate">${co}</div>
        <div class="text-xs text-muted mt-0.5">${btid} · Registered ${reg}</div>
        <div class="flex flex-wrap gap-1.5 mt-2">
          <span class="badge ${p.bc}">${p.label}</span>
          <span class="badge b-${pay}">${pay.charAt(0).toUpperCase() + pay.slice(1)}</span>
          ${ci ? '<span class="badge b-in">✓ Checked In</span>' : ''}
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2.5 text-xs">
      ${[['Contact', cp], ['Designation', des], ['Email', em], ['Phone', ph], ['Package', p.label], ['Table', 'Table ' + tbl + ' (' + p.zone + ')'], ['Seats', pax + ' pax'], ['Amount', 'RM ' + fmt(p.price)]].map(([k, v]) => `<div class="bg-panel rounded-xl p-3 border border-rim"><div class="text-muted mb-0.5">${k}</div><div class="font-medium text-gray-200">${v}</div></div>`).join('')}
    </div>
    ${slip ? `<div><div class="text-xs text-muted uppercase tracking-widest mb-2 font-medium">Payment Slip</div><a href="${API.replace('/api','')}${slip}" target="_blank" class="text-sm text-blue-400 underline">View uploaded slip →</a></div>` : ''}
    ${guests.length ? `<div><div class="text-xs text-muted uppercase tracking-widest mb-2 font-medium">Guest List (${guests.length})</div>
      <div class="grid grid-cols-2 gap-1.5">${guests.map((g, i) => {
        const gn = typeof g === 'string' ? g : (g.guest_name ?? 'Guest');
        return `<div class="flex items-center gap-1.5 text-xs text-gray-300 bg-panel rounded-lg px-3 py-2 border border-rim"><span class="text-muted w-4 text-right">${i+1}</span>${gn}</div>`;
      }).join('')}</div></div>` : ''}
    ${pay !== 'paid'
      ? `<div class="flex gap-2 pt-2 border-t border-rim"><button onclick="approvePay('${btid}');closeModal()" class="btn-ok flex-1">✓ Approve Payment</button><button onclick="rejectPay('${btid}');closeModal()" class="btn-warn flex-1">✕ Reject</button></div>`
      : `<div class="pt-2 border-t border-rim text-center text-xs text-emerald-400 bg-emerald-500/6 border border-emerald-500/15 rounded-xl py-3">✓ Payment Verified & Confirmed</div>`}`;
  document.getElementById('modal-bk').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal-bk').classList.add('hidden'); }

/* ═══════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════ */
function exportAll() {
  dlCSV([
    ['Ticket', 'Company', 'Contact', 'Designation', 'Email', 'Phone', 'Package', 'Table', 'Pax', 'Payment', 'Registered', 'Checked In'],
    ...BOOKINGS.map(b => [b.tid ?? b.ticket_id, b.co ?? b.company_name, b.cp ?? b.contact_name, b.des ?? b.designation, b.em ?? b.email, b.ph ?? b.phone, PKG[b.pkg ?? b.package]?.label, 'Table ' + (b.tbl ?? b.table_no), b.pax ?? b.total_seats, b.pay ?? b.payment_status, (b.reg ?? b.registered_at ?? '').slice(0,10), (b.ci ?? b.checked_in) ? 'Yes' : 'No'])
  ], 'TMG_Sponsors_2026.csv');
  toast('Exported!');
}
function exportPayments() {
  dlCSV([
    ['Ticket', 'Company', 'Package', 'Amount', 'Status', 'Date'],
    ...BOOKINGS.map(b => [b.tid ?? b.ticket_id, b.co ?? b.company_name, PKG[b.pkg ?? b.package]?.label, PKG[b.pkg ?? b.package]?.price, b.pay ?? b.payment_status, (b.reg ?? b.registered_at ?? '').slice(0,10)])
  ], 'TMG_Revenue_2026.csv');
  toast('Revenue report exported!');
}
function exportSeating() {
  dlCSV([
    ['Table', 'Zone', 'Company', 'Contact', 'Package', 'Pax'],
    ...BOOKINGS.map(b => ['T' + (b.tbl ?? b.table_no), PKG[b.pkg ?? b.package]?.zone, b.co ?? b.company_name, b.cp ?? b.contact_name, PKG[b.pkg ?? b.package]?.label, b.pax ?? b.total_seats])
  ], 'TMG_Seating_2026.csv');
  toast('Seating plan exported!');
}
function dlCSV(rows, fn) {
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n'));
  a.download = fn;
  a.click();
}

/* ── Global search ─────────────────────────────────── */
function aSearch(q) {
  if (!q.trim()) return;
  asec('bookings');
  document.getElementById('bf-search').value = q;
  renderBookings();
}

/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.className = 'fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium shadow-2xl max-w-xs';
  if      (type === 'warn') t.className += ' bg-amber-950 border-amber-600/35 text-amber-200';
  else if (type === 'err')  t.className += ' bg-red-950 border-red-600/35 text-red-200';
  else                      t.className += ' bg-card border-yellow-400/25 text-gray-100';
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ── Utility ─────────────────────────────────────────── */
function fmt(n) { return Number(n).toLocaleString(); }

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initVenueControls();
  loadBookings().then(updateLandStats);
});

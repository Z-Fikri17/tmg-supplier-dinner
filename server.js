// backend/server.js — TMG Dinner API (Node.js + Express + CSV storage)
// Run: npm install && node server.js

'use strict';

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 4000;

/* ── Paths ─────────────────────────────────────────────── */
const DATA_DIR   = path.join(__dirname, 'data');
const SLIP_DIR   = path.join(__dirname, 'uploads', 'slips');
const SUPP_CSV   = path.join(DATA_DIR, 'suppliers.csv');
const GUESTS_CSV = path.join(DATA_DIR, 'guests.csv');
const CI_CSV     = path.join(DATA_DIR, 'checkin_log.csv');

[DATA_DIR, SLIP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

/* ── Middleware ─────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ── File Upload ────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SLIP_DIR),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

/* ═══════════════════════════════════════════════════════
   CSV HELPERS
   ═══════════════════════════════════════════════════════ */

const PKG_PRICE = { gold: 50000, silver: 30000, bronze: 10000 };
const PKG_SEATS = { gold: 10,    silver: 6,      bronze: 2     };

// Supplier CSV columns
const SUPP_COLS = [
  'id', 'ticket_id', 'company_name', 'contact_name', 'designation',
  'email', 'phone', 'package', 'total_seats', 'table_no',
  'payment_status', 'payment_slip_url', 'checked_in', 'checkin_time',
  'registered_at', 'notes',
];

// Guest CSV columns
const GUEST_COLS = ['id', 'supplier_id', 'guest_name', 'position', 'dietary'];

// Check-in log columns
const CI_COLS = ['id', 'ticket_id', 'company_name', 'scanned_by', 'scanned_at'];

/* ── Parse CSV ──────────────────────────────────────────── */
function parseCSV(file, cols) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return []; // header only
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj  = {};
    cols.forEach((col, i) => { obj[col] = vals[i] ?? ''; });
    return obj;
  });
}

/* ── Stringify CSV ──────────────────────────────────────── */
function stringifyCSV(records, cols) {
  const header = cols.join(',');
  const rows   = records.map(r =>
    cols.map(c => {
      const v = String(r[c] ?? '').replace(/"/g, '""');
      return `"${v}"`;
    }).join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

/* ── Write CSV ──────────────────────────────────────────── */
function writeCSV(file, records, cols) {
  fs.writeFileSync(file, stringifyCSV(records, cols), 'utf8');
}

/* ── Split CSV line (handles quoted commas) ─────────────── */
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQ)           { inQ = true; }
    else if (ch === '"' && inQ) {
      if (line[i + 1] === '"')        { cur += '"'; i++; }
      else                             { inQ = false; }
    } else if (ch === ',' && !inQ)   { result.push(cur); cur = ''; }
    else                               { cur += ch; }
  }
  result.push(cur);
  return result;
}

/* ── Auto-increment ID ──────────────────────────────────── */
function nextId(records) {
  if (!records.length) return 1;
  return Math.max(...records.map(r => Number(r.id) || 0)) + 1;
}

/* ── Generate ticket ID ─────────────────────────────────── */
function generateTicketId(suppliers) {
  const n = suppliers.length + 1;
  return 'TMG-2026-' + String(n).padStart(3, '0');
}

/* ── Init CSV files with seed data ─────────────────────── */
function initCSVFiles() {
  if (!fs.existsSync(SUPP_CSV)) {
    const seed = [
      { id:1, ticket_id:'TMG-2026-001', company_name:'Nestle Malaysia Berhad',    contact_name:'Ahmad Zulkifli', designation:'CEO',      email:'ahmad@nestle.com.my',    phone:'+60123456789', package:'gold',   total_seats:10, table_no:1,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-12', notes:'' },
      { id:2, ticket_id:'TMG-2026-002', company_name:'Dutch Lady Industries',     contact_name:'Priya Raman',     designation:'GM Sales', email:'priya@dutchlady.com.my', phone:'+60198765432', package:'gold',   total_seats:10, table_no:2,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-13', notes:'' },
      { id:3, ticket_id:'TMG-2026-003', company_name:'Unilever Malaysia',         contact_name:'Tan Wei Ming',    designation:'Director', email:'tanwm@unilever.com.my',  phone:'+60111234567', package:'silver', total_seats:6,  table_no:9,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-14', notes:'' },
      { id:4, ticket_id:'TMG-2026-004', company_name:'F&N Beverages Marketing',   contact_name:'Siti Zainab',     designation:'Manager',  email:'siti@fn.com.my',         phone:'+60129876543', package:'silver', total_seats:6,  table_no:10, payment_status:'pending',  payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-15', notes:'' },
      { id:5, ticket_id:'TMG-2026-005', company_name:'Mamee-Double Decker',       contact_name:'Lim Kok Weng',    designation:'VP Ops',   email:'limkw@mamee.com.my',     phone:'+60134567890', package:'bronze', total_seats:2,  table_no:25, payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-16', notes:'' },
      { id:6, ticket_id:'TMG-2026-006', company_name:'Gardenia Bakeries KL',      contact_name:'Mohd Hafiz',      designation:'COO',      email:'hafiz@gardenia.com.my',  phone:'+60145678901', package:'bronze', total_seats:2,  table_no:26, payment_status:'review',  payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-17', notes:'' },
      { id:7, ticket_id:'TMG-2026-007', company_name:'Spritzer Bhd',              contact_name:'Lee Siew Fun',    designation:'MD',       email:'leesf@spritzer.com.my',  phone:'+60156789012', package:'silver', total_seats:6,  table_no:11, payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-18', notes:'' },
      { id:8, ticket_id:'TMG-2026-008', company_name:'Power Root Bhd',            contact_name:'Razali Othman',   designation:'Chairman', email:'razali@powerroot.com.my',phone:'+60167890123', package:'bronze', total_seats:2,  table_no:27, payment_status:'pending',  payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-19', notes:'' },
      { id:9, ticket_id:'TMG-2026-009', company_name:'Yeo Hiap Seng Malaysia',    contact_name:'Kevin Tan',       designation:'CEO',      email:'kevin@yhs.com.my',       phone:'+60178901234', package:'silver', total_seats:6,  table_no:12, payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-20', notes:'' },
      { id:10,ticket_id:'TMG-2026-010', company_name:"Brahim's SATS Food",        contact_name:"Dato Rauf",       designation:'Exec Dir', email:'rauf@brahims.com.my',    phone:'+60189012345', package:'gold',   total_seats:10, table_no:3,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-21', notes:'' },
    ];
    writeCSV(SUPP_CSV, seed, SUPP_COLS);
    console.log('✅ Seeded suppliers.csv');
  }
  if (!fs.existsSync(GUESTS_CSV)) {
    const gSeed = [
      {id:1,supplier_id:1,guest_name:'Ahmad Zulkifli',  position:'CEO',      dietary:'Standard'},
      {id:2,supplier_id:1,guest_name:'Mohd Rizal',       position:'Director', dietary:'Halal Only'},
      {id:3,supplier_id:3,guest_name:'Tan Wei Ming',     position:'Director', dietary:'Standard'},
      {id:4,supplier_id:3,guest_name:'Nurul Hidayah',    position:'Manager',  dietary:'Halal Only'},
    ];
    writeCSV(GUESTS_CSV, gSeed, GUEST_COLS);
    console.log('✅ Seeded guests.csv');
  }
  if (!fs.existsSync(CI_CSV)) {
    writeCSV(CI_CSV, [], CI_COLS);
    console.log('✅ Created checkin_log.csv');
  }
}

/* ── Map CSV row → API-friendly shape ───────────────────── */
function mapSupplier(r) {
  return {
    ...r,
    id:          Number(r.id),
    total_seats: Number(r.total_seats),
    table_no:    Number(r.table_no),
    checked_in:  Number(r.checked_in),
    // Aliases used by frontend
    tid:  r.ticket_id,
    co:   r.company_name,
    cp:   r.contact_name,
    des:  r.designation,
    em:   r.email,
    ph:   r.phone,
    pkg:  r.package,
    tbl:  Number(r.table_no),
    pax:  Number(r.total_seats),
    pay:  r.payment_status,
    ci:   Number(r.checked_in),
    reg:  r.registered_at,
  };
}

/* ═══════════════════════════════════════════════════════
   ROUTES — SUPPLIERS
   ═══════════════════════════════════════════════════════ */

/* GET /api/suppliers — list with optional ?search=&package=&status= */
app.get('/api/suppliers', (req, res) => {
  try {
    let data = parseCSV(SUPP_CSV, SUPP_COLS).map(mapSupplier);
    const { search, package: pkg, status, page = 1, limit = 200 } = req.query;
    if (search) data = data.filter(b => b.company_name.toLowerCase().includes(search.toLowerCase()) || b.ticket_id.toLowerCase().includes(search.toLowerCase()) || b.contact_name.toLowerCase().includes(search.toLowerCase()));
    if (pkg)    data = data.filter(b => b.package === pkg);
    if (status) data = data.filter(b => b.payment_status === status);
    const total = data.length;
    const paged = data.slice((page - 1) * limit, page * limit);
    res.json({ data: paged, total, page: Number(page), limit: Number(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/suppliers/:id — single supplier + guests */
app.get('/api/suppliers/:id', (req, res) => {
  try {
    const all = parseCSV(SUPP_CSV, SUPP_COLS).map(mapSupplier);
    const b   = all.find(s => s.ticket_id === req.params.id || String(s.id) === req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    const gAll    = parseCSV(GUESTS_CSV, GUEST_COLS);
    const guests  = gAll.filter(g => String(g.supplier_id) === String(b.id));
    res.json({ ...b, guests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/suppliers — register new (multipart/form-data with slip) */
app.post('/api/suppliers', upload.single('slip'), (req, res) => {
  try {
    const { company_name, contact_name, designation, email, phone, package: pkg, table_no, notes } = req.body;
    if (!company_name || !contact_name || !email || !phone || !pkg) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const suppliers = parseCSV(SUPP_CSV, SUPP_COLS);
    const tbl = Number(table_no);
    if (suppliers.some(s => Number(s.table_no) === tbl)) {
      return res.status(409).json({ error: 'Table already taken' });
    }

    const id        = nextId(suppliers);
    const ticket_id = generateTicketId(suppliers);
    const slip_url  = req.file ? `/uploads/slips/${req.file.filename}` : '';

    const newRec = {
      id, ticket_id, company_name, contact_name,
      designation: designation || '',
      email, phone, package: pkg,
      total_seats: PKG_SEATS[pkg] ?? 2,
      table_no:    tbl,
      payment_status:   'review', // slip uploaded → in review
      payment_slip_url: slip_url,
      checked_in:  0,
      checkin_time: '',
      registered_at: new Date().toISOString().slice(0, 10),
      notes: notes || '',
    };
    suppliers.push(newRec);
    writeCSV(SUPP_CSV, suppliers, SUPP_COLS);

    // Save guests if provided
    let guestsData = [];
    try { guestsData = JSON.parse(req.body.guests || '[]'); } catch {}
    if (guestsData.length) {
      const allGuests = parseCSV(GUESTS_CSV, GUEST_COLS);
      let gid = nextId(allGuests);
      guestsData.forEach(g => {
        allGuests.push({ id: gid++, supplier_id: id, guest_name: g.guest_name || 'Guest', position: g.position || '', dietary: g.dietary || 'standard' });
      });
      writeCSV(GUESTS_CSV, allGuests, GUEST_COLS);
    }

    res.status(201).json({ ticket_id, supplier_id: id, message: 'Registration submitted — pending slip verification' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* PATCH /api/suppliers/:id/payment — update payment status */
app.patch('/api/suppliers/:id/payment', (req, res) => {
  try {
    const { status, verified_by } = req.body;
    const suppliers = parseCSV(SUPP_CSV, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id === req.params.id || String(s.id) === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    suppliers[idx].payment_status = status;
    if (verified_by) suppliers[idx].notes = `Verified by ${verified_by}`;
    writeCSV(SUPP_CSV, suppliers, SUPP_COLS);
    res.json({ message: 'Payment status updated', status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/suppliers/:id/slip — upload slip separately */
app.post('/api/suppliers/:id/slip', upload.single('slip'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url       = `/uploads/slips/${req.file.filename}`;
    const suppliers = parseCSV(SUPP_CSV, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id === req.params.id || String(s.id) === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    suppliers[idx].payment_slip_url = url;
    suppliers[idx].payment_status   = 'review';
    writeCSV(SUPP_CSV, suppliers, SUPP_COLS);
    res.json({ slip_url: url, message: 'Slip uploaded — pending review' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   ROUTES — CHECK-IN
   ═══════════════════════════════════════════════════════ */

/* POST /api/checkin */
app.post('/api/checkin', (req, res) => {
  try {
    const { ticket_id, scanned_by } = req.body;
    const suppliers = parseCSV(SUPP_CSV, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id.toUpperCase() === (ticket_id || '').toUpperCase());
    if (idx < 0) return res.status(404).json({ valid: false, error: 'Ticket not found' });
    if (Number(suppliers[idx].checked_in)) return res.status(409).json({ valid: false, error: 'Already checked in', supplier: mapSupplier(suppliers[idx]) });

    suppliers[idx].checked_in  = 1;
    suppliers[idx].checkin_time = new Date().toISOString();
    writeCSV(SUPP_CSV, suppliers, SUPP_COLS);

    // Log
    const log = parseCSV(CI_CSV, CI_COLS);
    log.push({ id: nextId(log), ticket_id, company_name: suppliers[idx].company_name, scanned_by: scanned_by || 'staff', scanned_at: new Date().toISOString() });
    writeCSV(CI_CSV, log, CI_COLS);

    const gAll   = parseCSV(GUESTS_CSV, GUEST_COLS);
    const guests = gAll.filter(g => String(g.supplier_id) === String(suppliers[idx].id));
    res.json({ valid: true, message: 'Checked in successfully', supplier: mapSupplier(suppliers[idx]), guests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/checkin/log */
app.get('/api/checkin/log', (req, res) => {
  try {
    const log = parseCSV(CI_CSV, CI_COLS).reverse().slice(0, 50);
    res.json(log);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   ROUTES — DASHBOARD & SEATING
   ═══════════════════════════════════════════════════════ */

/* GET /api/dashboard */
app.get('/api/dashboard', (req, res) => {
  try {
    const all     = parseCSV(SUPP_CSV, SUPP_COLS).map(mapSupplier);
    const paid    = all.filter(s => s.payment_status === 'paid');
    const pending = all.filter(s => s.payment_status === 'pending');
    const review  = all.filter(s => s.payment_status === 'review');
    const checkedIn = all.filter(s => Number(s.checked_in));

    const revenue = paid.reduce((acc, s) => acc + (PKG_PRICE[s.package] || 0), 0);

    const summary = {
      total_suppliers: all.length,
      total_pax:       all.reduce((a, s) => a + Number(s.total_seats), 0),
      paid_count:      paid.length,
      pending_count:   pending.length,
      review_count:    review.length,
      checked_in_count:checkedIn.length,
      total_revenue:   revenue,
    };

    const breakdown = ['gold', 'silver', 'bronze'].map(pkg => ({
      package:  pkg,
      count:    all.filter(s => s.package === pkg).length,
      seats:    all.filter(s => s.package === pkg).reduce((a, s) => a + Number(s.total_seats), 0),
      revenue:  all.filter(s => s.package === pkg && s.payment_status === 'paid').reduce((a, s) => a + (PKG_PRICE[s.package] || 0), 0),
    }));

    const recent  = all.slice(-5).reverse();
    const pending_list = [...pending, ...review];

    res.json({ summary, breakdown, recent, pendingList: pending_list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/seating */
app.get('/api/seating', (req, res) => {
  try {
    const all     = parseCSV(SUPP_CSV, SUPP_COLS).map(mapSupplier);
    const tables  = [];
    for (let t = 1; t <= 54; t++) {
      const zone    = t <= 8 ? 'VIP' : t <= 24 ? 'Front' : 'General';
      const supplier= all.find(s => Number(s.table_no) === t);
      tables.push({ table_no: t, zone, section: zone, company_name: supplier?.company_name || null, package: supplier?.package || null, assigned: !!supplier });
    }
    res.json(tables);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/seating/assign */
app.post('/api/seating/assign', (req, res) => {
  try {
    const { table_no, ticket_id } = req.body;
    const suppliers = parseCSV(SUPP_CSV, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id === ticket_id);
    if (idx < 0) return res.status(404).json({ error: 'Supplier not found' });
    suppliers[idx].table_no = table_no;
    writeCSV(SUPP_CSV, suppliers, SUPP_COLS);
    res.json({ message: 'Table assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Reports / Export ────────────────────────────────────── */

/* GET /api/export/suppliers — download full CSV */
app.get('/api/export/suppliers', (req, res) => {
  try {
    if (!fs.existsSync(SUPP_CSV)) return res.status(404).send('No data');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="TMG_Sponsors_2026.csv"');
    res.send(fs.readFileSync(SUPP_CSV, 'utf8'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/export/guests */
app.get('/api/export/guests', (req, res) => {
  try {
    if (!fs.existsSync(GUESTS_CSV)) return res.status(404).send('No data');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="TMG_Guests_2026.csv"');
    res.send(fs.readFileSync(GUESTS_CSV, 'utf8'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/export/checkin */
app.get('/api/export/checkin', (req, res) => {
  try {
    if (!fs.existsSync(CI_CSV)) return res.status(404).send('No data');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="TMG_CheckIn_2026.csv"');
    res.send(fs.readFileSync(CI_CSV, 'utf8'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Health check ───────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  const files = { suppliers: fs.existsSync(SUPP_CSV), guests: fs.existsSync(GUESTS_CSV), checkin: fs.existsSync(CI_CSV) };
  const count = fs.existsSync(SUPP_CSV) ? parseCSV(SUPP_CSV, SUPP_COLS).length : 0;
  res.json({ status: 'ok', storage: 'CSV', files, supplierCount: count, time: new Date() });
});

/* ── Start ──────────────────────────────────────────────── */
initCSVFiles();
app.listen(PORT, () => {
  console.log(`✅  TMG Dinner API running on http://localhost:${PORT}`);
  console.log(`📁  Data directory: ${DATA_DIR}`);
  console.log(`📎  Slips directory: ${SLIP_DIR}`);
});

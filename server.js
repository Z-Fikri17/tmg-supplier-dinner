// server.js — TMG Dinner API (Node.js + Express + Google Sheets storage)
// Run: npm install && node server.js

'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');
const QRCode     = require('qrcode');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 4000;
let LAST_EMAIL_ERROR = null;

/* ── Upload dirs ────────────────────────────────────────── */
const SLIP_DIR  = path.join(__dirname, 'uploads', 'slips');
const ASSET_DIR = path.join(__dirname, 'uploads', 'assets');
[SLIP_DIR, ASSET_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

/* ── Middleware ─────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ── File Upload ────────────────────────────────────────── */
const storage   = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'slip' ? SLIP_DIR : ASSET_DIR),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')),
});
const uploadReg  = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadSlip = multer({ storage, limits: { fileSize: 5  * 1024 * 1024 } });

/* ═══════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════ */
const PKG_PRICE = { gold: 50000, silver: 30000, bronze: 10000 };
const PKG_SEATS = { gold: 10,    silver: 6,      bronze: 2     };
const PKG_LABEL = { gold: 'Gold Sponsor', silver: 'Silver Sponsor', bronze: 'Bronze Sponsor' };

const SUPP_COLS  = ['id','ticket_id','company_name','contact_name','designation','email','phone','package','total_seats','table_no','payment_status','payment_slip_url','checked_in','checkin_time','registered_at','notes','logo_url','ad_slide_url','ad_video_url'];
const GUEST_COLS = ['id','supplier_id','guest_name','position','dietary'];
const CI_COLS    = ['id','ticket_id','company_name','scanned_by','scanned_at'];

const SHEET_SUPPLIERS = 'suppliers';
const SHEET_GUESTS    = 'guests';
const SHEET_CHECKIN   = 'checkin_log';

/* ═══════════════════════════════════════════════════════
   GOOGLE SHEETS HELPERS
   ═══════════════════════════════════════════════════════ */
function getSheets() {
  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!creds) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const key  = JSON.parse(creds);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

async function sheetRead(sheetName, cols) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  return rows.slice(1).map(row => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i] ?? ''; });
    return obj;
  });
}

async function sheetWrite(sheetName, records, cols) {
  const sheets = getSheets();
  const header = [cols];
  const rows   = records.map(r => cols.map(c => String(r[c] ?? '')));
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [...header, ...rows] },
  });
  // Clear stale rows below current data
  const totalRows = records.length + 1;
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${totalRows + 1}:Z9999`,
    });
  } catch (_) {}
}

async function sheetAppend(sheetName, record, cols) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [cols.map(c => String(record[c] ?? ''))] },
  });
}

function nextId(records) {
  if (!records.length) return 1;
  return Math.max(...records.map(r => Number(r.id) || 0)) + 1;
}

function generateTicketId(suppliers) {
  return 'TMG-2026-' + String(suppliers.length + 1).padStart(3, '0');
}

function mapSupplier(r) {
  return {
    ...r,
    id: Number(r.id), total_seats: Number(r.total_seats),
    table_no: Number(r.table_no), checked_in: Number(r.checked_in),
    tid: r.ticket_id, co: r.company_name, cp: r.contact_name,
    des: r.designation, em: r.email, ph: r.phone, pkg: r.package,
    tbl: Number(r.table_no), pax: Number(r.total_seats),
    pay: r.payment_status, logo: r.logo_url, slide: r.ad_slide_url,
    video: r.ad_video_url, ci: Number(r.checked_in), reg: r.registered_at,
  };
}

async function initSheets() {
  try {
    const suppliers = await sheetRead(SHEET_SUPPLIERS, SUPP_COLS);
    if (!suppliers.length) {
      const seed = [
        { id:1,  ticket_id:'TMG-2026-001', company_name:'Nestle Malaysia Berhad',  contact_name:'Ahmad Zulkifli', designation:'CEO',      email:'ahmad@nestle.com.my',     phone:'+60123456789', package:'gold',   total_seats:10, table_no:1,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-12', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:2,  ticket_id:'TMG-2026-002', company_name:'Dutch Lady Industries',   contact_name:'Priya Raman',    designation:'GM Sales', email:'priya@dutchlady.com.my',  phone:'+60198765432', package:'gold',   total_seats:10, table_no:2,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-13', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:3,  ticket_id:'TMG-2026-003', company_name:'Unilever Malaysia',       contact_name:'Tan Wei Ming',   designation:'Director', email:'tanwm@unilever.com.my',   phone:'+60111234567', package:'silver', total_seats:6,  table_no:9,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-14', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:4,  ticket_id:'TMG-2026-004', company_name:'F&N Beverages Marketing', contact_name:'Siti Zainab',    designation:'Manager',  email:'siti@fn.com.my',          phone:'+60129876543', package:'silver', total_seats:6,  table_no:10, payment_status:'pending', payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-15', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:5,  ticket_id:'TMG-2026-005', company_name:'Mamee-Double Decker',     contact_name:'Lim Kok Weng',   designation:'VP Ops',   email:'limkw@mamee.com.my',      phone:'+60134567890', package:'bronze', total_seats:2,  table_no:25, payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-16', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:6,  ticket_id:'TMG-2026-006', company_name:'Gardenia Bakeries KL',    contact_name:'Mohd Hafiz',     designation:'COO',      email:'hafiz@gardenia.com.my',   phone:'+60145678901', package:'bronze', total_seats:2,  table_no:26, payment_status:'review',  payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-17', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:7,  ticket_id:'TMG-2026-007', company_name:'Spritzer Bhd',            contact_name:'Lee Siew Fun',   designation:'MD',       email:'leesf@spritzer.com.my',   phone:'+60156789012', package:'silver', total_seats:6,  table_no:11, payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-18', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:8,  ticket_id:'TMG-2026-008', company_name:'Power Root Bhd',          contact_name:'Razali Othman',  designation:'Chairman', email:'razali@powerroot.com.my', phone:'+60167890123', package:'bronze', total_seats:2,  table_no:27, payment_status:'pending', payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-19', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:9,  ticket_id:'TMG-2026-009', company_name:'Yeo Hiap Seng Malaysia',  contact_name:'Kevin Tan',      designation:'CEO',      email:'kevin@yhs.com.my',        phone:'+60178901234', package:'silver', total_seats:6,  table_no:12, payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-20', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
        { id:10, ticket_id:'TMG-2026-010', company_name:"Brahim's SATS Food",      contact_name:'Dato Rauf',      designation:'Exec Dir', email:'rauf@brahims.com.my',     phone:'+60189012345', package:'gold',   total_seats:10, table_no:3,  payment_status:'paid',    payment_slip_url:'', checked_in:0, checkin_time:'', registered_at:'2026-08-21', notes:'', logo_url:'', ad_slide_url:'', ad_video_url:'' },
      ];
      await sheetWrite(SHEET_SUPPLIERS, seed, SUPP_COLS);
      console.log('✅ Seeded suppliers sheet');
    }
    const guests = await sheetRead(SHEET_GUESTS, GUEST_COLS);
    if (!guests.length) {
      await sheetWrite(SHEET_GUESTS, [
        { id:1, supplier_id:1, guest_name:'Ahmad Zulkifli', position:'CEO',      dietary:'Standard'   },
        { id:2, supplier_id:1, guest_name:'Mohd Rizal',     position:'Director', dietary:'Halal Only' },
        { id:3, supplier_id:3, guest_name:'Tan Wei Ming',   position:'Director', dietary:'Standard'   },
        { id:4, supplier_id:3, guest_name:'Nurul Hidayah',  position:'Manager',  dietary:'Halal Only' },
      ], GUEST_COLS);
      console.log('✅ Seeded guests sheet');
    }
    const ci = await sheetRead(SHEET_CHECKIN, CI_COLS);
    if (!ci.length) { await sheetWrite(SHEET_CHECKIN, [], CI_COLS); console.log('✅ Created checkin_log sheet'); }
    console.log('✅ Google Sheets storage ready');
  } catch (e) {
    console.error('❌ Google Sheets init failed:', e.message);
  }
}

/* ═══════════════════════════════════════════════════════
   EMAIL
   ═══════════════════════════════════════════════════════ */
function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user   = process.env.SMTP_USER;
  const pass   = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return { host, port, secure, auth: { user, pass } };
}

function buildFromAddress() {
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const fromName  = process.env.SMTP_FROM_NAME || 'TMG Supplier Dinner 2026';
  return fromEmail ? `${fromName} <${fromEmail}>` : '';
}

async function buildSeatMapHtml(highlightTable) {
  try {
    const allSuppliers = (await sheetRead(SHEET_SUPPLIERS, SUPP_COLS)).map(mapSupplier);
    const zoneColor = t => t <= 8 ? '#b8960c' : t <= 24 ? '#6b7280' : '#92400e';
    let rows = '';
    for (let row = 0; row < 6; row++) {
      let cells = '';
      for (let col = 0; col < 9; col++) {
        const t = row * 9 + col + 1;
        if (t > 54) { cells += '<td style="width:48px;height:42px;"></td>'; continue; }
        const isMe = t === Number(highlightTable);
        const sup  = allSuppliers.find(s => Number(s.table_no) === t);
        const zc   = zoneColor(t);
        const bg   = isMe ? '#22c55e' : (sup ? zc+'33' : '#1e1e2e');
        const bd   = isMe ? '2px solid #22c55e' : `1px solid ${zc}55`;
        const tc   = isMe ? '#fff' : (sup ? '#e5e7eb' : '#4b5563');
        cells += `<td style="width:48px;height:42px;text-align:center;vertical-align:middle;background:${bg};border:${bd};border-radius:6px;font-size:10px;color:${tc};padding:2px;">${isMe ? `<b>T${t}</b><br><span style="font-size:8px">YOU</span>` : `T${t}`}</td>`;
      }
      rows += `<tr>${cells}</tr>`;
    }
    return `<div style="margin:18px 0;"><p style="font-size:13px;font-weight:bold;color:#374151;margin-bottom:8px;">📍 Seating Map — Your table highlighted in green</p><div style="background:#0f0f1a;border-radius:10px;padding:14px;display:inline-block;"><table style="border-collapse:separate;border-spacing:3px;"><thead><tr><td colspan="9" style="text-align:center;color:#9ca3af;font-size:11px;padding-bottom:6px;font-weight:bold;">── STAGE ──</td></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  } catch (_) {
    return '<p style="color:#9ca3af;font-size:13px;">Seating map unavailable.</p>';
  }
}

async function sendApprovalEmail(supplier, opts = {}) {
  const rawEmail   = supplier.email   || supplier.em  || '';
  const rawCompany = supplier.company_name || supplier.co  || 'Supplier';
  const rawContact = supplier.contact_name || supplier.cp  || '';
  const rawPackage = supplier.package || supplier.pkg || '';
  const rawSeats   = Number(supplier.total_seats ?? supplier.pax) || PKG_SEATS[rawPackage] || 0;
  const rawTableNo = Number(supplier.table_no   ?? supplier.tbl) || 0;
  const rawTicket  = supplier.ticket_id || supplier.tid || '';

  const overrideTo = !opts.ignoreOverride && process.env.SMTP_TEST_TO;
  const toAddr = overrideTo || rawEmail;
  if (!toAddr) return { status: 'skipped', reason: 'Missing supplier email' };
  const smtp = getSmtpConfig();
  if (!smtp)  return { status: 'skipped', reason: 'SMTP not configured' };

  const transport  = nodemailer.createTransport(smtp);
  const pkgLabel   = PKG_LABEL[rawPackage] || rawPackage || 'Sponsor';
  const tableTag   = rawTableNo ? `T${rawTableNo}` : 'TBA';
  const qrBuffer   = await QRCode.toBuffer(`${rawTicket}|${rawCompany}|${tableTag}`, { type: 'png', width: 240, errorCorrectionLevel: 'H' });
  const seatMap    = rawTableNo ? await buildSeatMapHtml(rawTableNo) : '<p style="color:#9ca3af;">Table assignment will be confirmed soon.</p>';

  const subject = opts.subject || 'TMG Supplier Appreciation Dinner 2026 — Your Invitation & Seat Assignment';
  const text = [`Dear ${rawContact || 'Valued Supplier'},`, '', 'Your payment has been approved! You are confirmed for TMG Supplier Appreciation Dinner 2026.', `Company : ${rawCompany}`, `Package : ${pkgLabel}`, `Seats   : ${rawSeats} pax`, `Table   : ${rawTableNo || 'TBA'}`, `Ticket  : ${rawTicket}`, overrideTo ? `[Test — original: ${rawEmail}]` : '', '', 'Your QR code is attached. Present it at the entrance on event night.', '- TMG Events Team'].filter(Boolean).join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:620px;">
    <div style="background:#0f0f1a;padding:20px 28px;border-radius:10px 10px 0 0;text-align:center;">
      <h2 style="color:#f0b429;margin:0;font-size:20px;">TMG Supplier Appreciation Dinner 2026</h2>
      <p style="color:#9ca3af;margin:6px 0 0;font-size:13px;">Payment Approved — You're Confirmed!</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;">
      <p style="margin-top:0;">Dear <strong>${rawContact || 'Valued Supplier'}</strong>,</p>
      <p>Your payment has been <strong style="color:#16a34a;">approved</strong>. We look forward to seeing you!</p>
      <table style="border-collapse:collapse;margin:16px 0;width:100%;max-width:380px;background:#f9fafb;border-radius:8px;">
        <tr><td style="padding:8px 14px;color:#6b7280;font-size:13px;">Company</td><td style="padding:8px 14px;font-weight:bold;">${rawCompany}</td></tr>
        <tr style="background:#f3f4f6;"><td style="padding:8px 14px;color:#6b7280;font-size:13px;">Package</td><td style="padding:8px 14px;">${pkgLabel}</td></tr>
        <tr><td style="padding:8px 14px;color:#6b7280;font-size:13px;">Seats</td><td style="padding:8px 14px;">${rawSeats} pax</td></tr>
        <tr style="background:#f3f4f6;"><td style="padding:8px 14px;color:#6b7280;font-size:13px;">Table</td><td style="padding:8px 14px;font-weight:bold;color:#0f766e;">${rawTableNo || 'TBA'}</td></tr>
        <tr><td style="padding:8px 14px;color:#6b7280;font-size:13px;">Ticket ID</td><td style="padding:8px 14px;font-family:monospace;">${rawTicket}</td></tr>
        ${overrideTo ? `<tr style="background:#fef9c3;"><td style="padding:8px 14px;color:#854d0e;font-size:12px;" colspan="2">⚠ Test — original: ${rawEmail}</td></tr>` : ''}
      </table>
      ${seatMap}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="font-size:13px;">Present this QR code at the entrance for check-in:</p>
      <div style="margin:14px 0;text-align:center;">
        <img src="cid:tmgqr" alt="QR Code" width="180" height="180" style="border:1px solid #ddd;padding:8px;border-radius:8px;">
        <p style="font-size:11px;color:#9ca3af;margin-top:6px;">${rawTicket} | ${tableTag}</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-bottom:0;">— TMG Events Team</p>
    </div>
  </div>`;

  try {
    const info = await transport.sendMail({ from: buildFromAddress(), to: toAddr, subject, text, html, attachments: [{ filename: `TMG_QR_${rawTicket}.png`, content: qrBuffer, cid: 'tmgqr' }] });
    LAST_EMAIL_ERROR = null;
    return { status: 'sent', messageId: info.messageId || '' };
  } catch (e) {
    LAST_EMAIL_ERROR = { message: e.message, time: new Date().toISOString() };
    throw e;
  }
}

/* ── Build seating plan ─────────────────────────────────── */
async function buildSeatingPlan() {
  const suppliers = (await sheetRead(SHEET_SUPPLIERS, SUPP_COLS)).map(mapSupplier);
  const guestsRaw = await sheetRead(SHEET_GUESTS, GUEST_COLS);
  const guestMap  = {};
  guestsRaw.forEach(g => { const sid = String(g.supplier_id); if (!guestMap[sid]) guestMap[sid] = []; guestMap[sid].push(g.guest_name || 'Guest'); });
  const plan = [];
  for (let t = 1; t <= 54; t++) {
    const s = suppliers.find(x => Number(x.table_no) === t);
    const gList = s ? (guestMap[String(s.id)] || []) : [];
    plan.push({ table_no: t, company_name: s?.company_name||'', contact_name: s?.contact_name||'', package: s?.package||'', total_seats: s ? Number(s.total_seats) : 0, guest_count: gList.length, guests: gList });
  }
  return plan;
}

function stringifyCSV(records, cols) {
  return [cols.join(','), ...records.map(r => cols.map(c => `"${String(r[c]??'').replace(/"/g,'""')}"`).join(','))].join('\n') + '\n';
}

/* ═══════════════════════════════════════════════════════
   ROUTES
   ═══════════════════════════════════════════════════════ */

app.get('/api/suppliers', async (req, res) => {
  try {
    let data = (await sheetRead(SHEET_SUPPLIERS, SUPP_COLS)).map(mapSupplier);
    const { search, package: pkg, status, page=1, limit=200 } = req.query;
    if (search) data = data.filter(b => b.company_name.toLowerCase().includes(search.toLowerCase()) || b.ticket_id.toLowerCase().includes(search.toLowerCase()) || b.contact_name.toLowerCase().includes(search.toLowerCase()));
    if (pkg)    data = data.filter(b => b.package === pkg);
    if (status) data = data.filter(b => b.payment_status === status);
    const total = data.length;
    res.json({ data: data.slice((page-1)*limit, page*limit), total, page: Number(page), limit: Number(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/suppliers/:id', async (req, res) => {
  try {
    const all = (await sheetRead(SHEET_SUPPLIERS, SUPP_COLS)).map(mapSupplier);
    const b   = all.find(s => s.ticket_id === req.params.id || String(s.id) === req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    const guests = (await sheetRead(SHEET_GUESTS, GUEST_COLS)).filter(g => String(g.supplier_id) === String(b.id));
    res.json({ ...b, guests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/suppliers', uploadReg.fields([{ name:'slip',maxCount:1 },{ name:'logo',maxCount:1 },{ name:'ad_slide',maxCount:1 },{ name:'ad_video',maxCount:1 }]), async (req, res) => {
  try {
    const { company_name, contact_name, designation, email, phone, package: pkg, table_no, notes } = req.body;
    if (!company_name||!contact_name||!email||!phone||!pkg) return res.status(400).json({ error: 'Missing required fields' });
    const suppliers = await sheetRead(SHEET_SUPPLIERS, SUPP_COLS);
    const tbl = Number(table_no);
    if (suppliers.some(s => Number(s.table_no) === tbl)) return res.status(409).json({ error: 'Table already taken' });
    const id = nextId(suppliers), ticket_id = generateTicketId(suppliers), files = req.files||{};
    const newRec = { id, ticket_id, company_name, contact_name, designation:designation||'', email, phone, package:pkg, total_seats:PKG_SEATS[pkg]??2, table_no:tbl, payment_status:'review', payment_slip_url:files.slip?.[0]?`/uploads/slips/${files.slip[0].filename}`:'', logo_url:files.logo?.[0]?`/uploads/assets/${files.logo[0].filename}`:'', ad_slide_url:files.ad_slide?.[0]?`/uploads/assets/${files.ad_slide[0].filename}`:'', ad_video_url:files.ad_video?.[0]?`/uploads/assets/${files.ad_video[0].filename}`:'', checked_in:0, checkin_time:'', registered_at:new Date().toISOString().slice(0,10), notes:notes||'' };
    suppliers.push(newRec);
    await sheetWrite(SHEET_SUPPLIERS, suppliers, SUPP_COLS);
    let guestsData = []; try { guestsData = JSON.parse(req.body.guests||'[]'); } catch {}
    if (guestsData.length) {
      const allGuests = await sheetRead(SHEET_GUESTS, GUEST_COLS);
      let gid = nextId(allGuests);
      guestsData.forEach(g => allGuests.push({ id:gid++, supplier_id:id, guest_name:g.guest_name||'Guest', position:g.position||'', dietary:g.dietary||'standard' }));
      await sheetWrite(SHEET_GUESTS, allGuests, GUEST_COLS);
    }
    res.status(201).json({ ticket_id, supplier_id:id, message:'Registration submitted — pending slip verification' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/suppliers/:id/payment', async (req, res) => {
  try {
    const { status, verified_by } = req.body;
    const suppliers = await sheetRead(SHEET_SUPPLIERS, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id===req.params.id || String(s.id)===req.params.id);
    if (idx<0) return res.status(404).json({ error:'Not found' });
    const prevStatus = suppliers[idx].payment_status;
    suppliers[idx].payment_status = status;
    if (verified_by) suppliers[idx].notes = `Verified by ${verified_by}`;
    await sheetWrite(SHEET_SUPPLIERS, suppliers, SUPP_COLS);
    let email = { status:'skipped', reason:'Not approved' };
    if (status==='paid' && prevStatus!=='paid') {
      try { email = await sendApprovalEmail(suppliers[idx]); }
      catch (e) { email = { status:'failed', reason:e.message }; }
    }
    res.json({ message:'Payment status updated', status, email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/suppliers/:id/slip', uploadSlip.single('slip'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error:'No file uploaded' });
    const url = `/uploads/slips/${req.file.filename}`;
    const suppliers = await sheetRead(SHEET_SUPPLIERS, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id===req.params.id || String(s.id)===req.params.id);
    if (idx<0) return res.status(404).json({ error:'Not found' });
    suppliers[idx].payment_slip_url = url;
    suppliers[idx].payment_status   = 'review';
    await sheetWrite(SHEET_SUPPLIERS, suppliers, SUPP_COLS);
    res.json({ slip_url:url, message:'Slip uploaded — pending review' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/email/status', (req, res) => {
  const smtp = getSmtpConfig();
  res.json({ configured:!!smtp, from:buildFromAddress(), test_to:process.env.SMTP_TEST_TO||'', last_error:LAST_EMAIL_ERROR });
});

app.post('/api/email/test', async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) return res.status(400).json({ error:'Missing test email address' });
    const result = await sendApprovalEmail({ email:to, company_name:'TMG Email Test', package:'gold', total_seats:10, table_no:1, ticket_id:'TMG-TEST-EMAIL' }, { ignoreOverride:true, subject:'TMG Email Test - QR Check-In' });
    res.json({ message:'Test email sent', result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/checkin', async (req, res) => {
  try {
    const { ticket_id, scanned_by } = req.body;
    const suppliers = await sheetRead(SHEET_SUPPLIERS, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id.toUpperCase()===(ticket_id||'').toUpperCase());
    if (idx<0) return res.status(404).json({ valid:false, error:'Ticket not found' });
    if (Number(suppliers[idx].checked_in)) return res.status(409).json({ valid:false, error:'Already checked in', supplier:mapSupplier(suppliers[idx]) });
    suppliers[idx].checked_in   = 1;
    suppliers[idx].checkin_time = new Date().toISOString();
    await sheetWrite(SHEET_SUPPLIERS, suppliers, SUPP_COLS);
    await sheetAppend(SHEET_CHECKIN, { id:Date.now(), ticket_id, company_name:suppliers[idx].company_name, scanned_by:scanned_by||'staff', scanned_at:new Date().toISOString() }, CI_COLS);
    const guests = (await sheetRead(SHEET_GUESTS, GUEST_COLS)).filter(g => String(g.supplier_id)===String(suppliers[idx].id));
    res.json({ valid:true, message:'Checked in successfully', supplier:mapSupplier(suppliers[idx]), guests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/checkin/log', async (req, res) => {
  try { res.json((await sheetRead(SHEET_CHECKIN, CI_COLS)).reverse().slice(0,50)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const all = (await sheetRead(SHEET_SUPPLIERS, SUPP_COLS)).map(mapSupplier);
    const paid=all.filter(s=>s.payment_status==='paid'), pending=all.filter(s=>s.payment_status==='pending'), review=all.filter(s=>s.payment_status==='review');
    res.json({ summary:{ total_suppliers:all.length, total_pax:all.reduce((a,s)=>a+Number(s.total_seats),0), paid_count:paid.length, pending_count:pending.length, review_count:review.length, checked_in_count:all.filter(s=>Number(s.checked_in)).length, total_revenue:paid.reduce((a,s)=>a+(PKG_PRICE[s.package]||0),0) }, breakdown:['gold','silver','bronze'].map(pkg=>({ package:pkg, count:all.filter(s=>s.package===pkg).length, seats:all.filter(s=>s.package===pkg).reduce((a,s)=>a+Number(s.total_seats),0), revenue:all.filter(s=>s.package===pkg&&s.payment_status==='paid').reduce((a,s)=>a+(PKG_PRICE[s.package]||0),0) })), recent:all.slice(-5).reverse(), pendingList:[...pending,...review] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seating', async (req, res) => {
  try {
    const all=((await sheetRead(SHEET_SUPPLIERS,SUPP_COLS)).map(mapSupplier));
    const tables=[];
    for(let t=1;t<=54;t++){const zone=t<=8?'VIP':t<=24?'Front':'General';const s=all.find(x=>Number(x.table_no)===t);tables.push({table_no:t,zone,section:zone,company_name:s?.company_name||null,package:s?.package||null,assigned:!!s});}
    res.json(tables);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seating/plan', async (req, res) => {
  try { res.json(await buildSeatingPlan()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seating/assign', async (req, res) => {
  try {
    const { table_no, ticket_id } = req.body;
    const suppliers = await sheetRead(SHEET_SUPPLIERS, SUPP_COLS);
    const idx = suppliers.findIndex(s => s.ticket_id===ticket_id);
    if (idx<0) return res.status(404).json({ error:'Supplier not found' });
    suppliers[idx].table_no = table_no;
    await sheetWrite(SHEET_SUPPLIERS, suppliers, SUPP_COLS);
    res.json({ message:'Table assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/suppliers', async (req, res) => {
  try { const d=await sheetRead(SHEET_SUPPLIERS,SUPP_COLS); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="TMG_Sponsors_2026.csv"'); res.send(stringifyCSV(d,SUPP_COLS)); } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/export/guests', async (req, res) => {
  try { const d=await sheetRead(SHEET_GUESTS,GUEST_COLS); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="TMG_Guests_2026.csv"'); res.send(stringifyCSV(d,GUEST_COLS)); } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/export/seating', async (req, res) => {
  try { const plan=await buildSeatingPlan(); const records=plan.map(p=>({Table:'Table '+p.table_no,Company:p.company_name||'',Guests:p.guests.length?`${p.guests.length} pax: ${p.guests.join('; ')}`:''})); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="TMG_Seating_Plan_2026.csv"'); res.send(stringifyCSV(records,['Table','Company','Guests'])); } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/export/checkin', async (req, res) => {
  try { const d=await sheetRead(SHEET_CHECKIN,CI_COLS); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="TMG_CheckIn_2026.csv"'); res.send(stringifyCSV(d,CI_COLS)); } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/health', async (req, res) => {
  try { const count=(await sheetRead(SHEET_SUPPLIERS,SUPP_COLS)).length; res.json({ status:'ok', storage:'Google Sheets', supplierCount:count, sheetId:SPREADSHEET_ID, time:new Date() }); }
  catch (e) { res.status(500).json({ status:'error', error:e.message }); }
});

/* ── Start ──────────────────────────────────────────────── */
initSheets().then(() => {
  app.listen(PORT, () => {
    console.log(`✅  TMG Dinner API running on http://localhost:${PORT}`);
    console.log(`📊  Storage: Google Sheets (ID: ${SPREADSHEET_ID})`);
  });
});

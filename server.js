// backend/server.js  — TMG Dinner API (Node.js + Express + MySQL)
// Run: npm install && node server.js

const express    = require('express');
const mysql      = require('mysql2/promise');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── File Upload (payment slips) ───────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads/slips');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s/g,'_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── DB Pool ───────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'yourpassword',
  database: process.env.DB_NAME     || 'tmg_dinner',
  waitForConnections: true,
  connectionLimit: 10
});

// ── Helper: generate ticket ID ────────────────────────────
async function generateTicketId(conn) {
  const [rows] = await conn.execute('SELECT COUNT(*) AS cnt FROM suppliers');
  const n = rows[0].cnt + 1;
  return 'TMG-2026-' + String(n).padStart(3, '0');
}

// ══════════════════════════════════════════════════════════
//  SUPPLIERS
// ══════════════════════════════════════════════════════════

// GET all suppliers (with optional search + filter)
app.get('/api/suppliers', async (req, res) => {
  try {
    const { search, package: pkg, status, page = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (company_name LIKE ? OR contact_name LIKE ? OR ticket_id LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
    if (pkg)    { sql += ' AND package = ?';        params.push(pkg); }
    if (status) { sql += ' AND payment_status = ?'; params.push(status); }
    sql += ' ORDER BY registered_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
    const [rows] = await pool.execute(sql, params);
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM suppliers');
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single supplier + guests
app.get('/api/suppliers/:id', async (req, res) => {
  try {
    const [[supplier]] = await pool.execute('SELECT * FROM suppliers WHERE ticket_id = ? OR id = ?', [req.params.id, req.params.id]);
    if (!supplier) return res.status(404).json({ error: 'Not found' });
    const [guests] = await pool.execute('SELECT * FROM guests WHERE supplier_id = ?', [supplier.id]);
    res.json({ ...supplier, guests });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST register new supplier
app.post('/api/suppliers', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { company_name, contact_name, designation, email, phone, package: pkg, payment_method, guests = [], notes } = req.body;
    const pkgSeats = { gold: 10, silver: 6, bronze: 2 };
    const pkgPrice = { gold: 50000, silver: 30000, bronze: 10000 };
    const ticket_id = await generateTicketId(conn);

    const [result] = await conn.execute(
      `INSERT INTO suppliers (ticket_id,company_name,contact_name,designation,email,phone,package,total_seats,payment_method,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [ticket_id, company_name, contact_name, designation, email, phone, pkg, pkgSeats[pkg], payment_method, notes || null]
    );
    const supplierId = result.insertId;

    // Insert guests
    for (const g of guests) {
      await conn.execute(
        'INSERT INTO guests (supplier_id, guest_name, position, dietary) VALUES (?,?,?,?)',
        [supplierId, g.guest_name, g.position || null, g.dietary || 'standard']
      );
    }

    // Create payment record
    await conn.execute(
      'INSERT INTO payments (supplier_id, amount, method) VALUES (?,?,?)',
      [supplierId, pkgPrice[pkg], payment_method]
    );

    await conn.commit();
    res.status(201).json({ ticket_id, supplier_id: supplierId, message: 'Registration successful' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

// PATCH update payment status
app.patch('/api/suppliers/:id/payment', async (req, res) => {
  try {
    const { status, verified_by } = req.body;
    await pool.execute(
      'UPDATE suppliers SET payment_status=?, updated_at=NOW() WHERE id=?',
      [status, req.params.id]
    );
    await pool.execute(
      'UPDATE payments SET status=?, verified_by=?, verified_at=NOW() WHERE supplier_id=?',
      [status === 'paid' ? 'verified' : status, verified_by || 'admin', req.params.id]
    );
    res.json({ message: 'Payment status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upload payment slip
app.post('/api/suppliers/:id/slip', upload.single('slip'), async (req, res) => {
  try {
    const url = `/uploads/slips/${req.file.filename}`;
    await pool.execute(
      'UPDATE suppliers SET payment_slip_url=?, payment_status="review", updated_at=NOW() WHERE id=?',
      [url, req.params.id]
    );
    await pool.execute('UPDATE payments SET slip_url=?, status="pending" WHERE supplier_id=?', [url, req.params.id]);
    res.json({ slip_url: url, message: 'Slip uploaded, pending review' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  CHECK-IN
// ══════════════════════════════════════════════════════════

// POST check-in by ticket_id
app.post('/api/checkin', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { ticket_id, scanned_by, device_info } = req.body;
    const [[supplier]] = await conn.execute('SELECT * FROM suppliers WHERE ticket_id = ?', [ticket_id]);
    if (!supplier) return res.status(404).json({ error: 'Ticket not found', valid: false });
    if (supplier.checked_in) return res.status(409).json({ error: 'Already checked in', valid: false, supplier });

    await conn.execute(
      'UPDATE suppliers SET checked_in=1, checkin_time=NOW() WHERE id=?',
      [supplier.id]
    );
    await conn.execute(
      'INSERT INTO checkin_log (supplier_id, scanned_by, device_info) VALUES (?,?,?)',
      [supplier.id, scanned_by || 'staff', device_info || null]
    );
    const [guests] = await conn.execute('SELECT * FROM guests WHERE supplier_id=?', [supplier.id]);
    await conn.commit();
    res.json({ valid: true, message: 'Checked in successfully', supplier, guests });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

// GET check-in log (recent)
app.get('/api/checkin/log', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cl.*, s.company_name, s.package, s.total_seats, s.ticket_id
       FROM checkin_log cl JOIN suppliers s ON cl.supplier_id=s.id
       ORDER BY cl.scanned_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════

app.get('/api/dashboard', async (req, res) => {
  try {
    const [[summary]]   = await pool.execute('SELECT * FROM v_dashboard_summary');
    const [breakdown]   = await pool.execute('SELECT * FROM v_package_breakdown');
    const [recent]      = await pool.execute('SELECT * FROM suppliers ORDER BY registered_at DESC LIMIT 5');
    const [pendingList] = await pool.execute("SELECT * FROM suppliers WHERE payment_status IN ('pending','review') ORDER BY registered_at DESC");
    res.json({ summary, breakdown, recent, pendingList });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET seating plan
app.get('/api/seating', async (req, res) => {
  try {
    const [tables] = await pool.execute(
      `SELECT st.*, s.company_name, s.package
       FROM seating_tables st
       LEFT JOIN suppliers s ON st.assigned_to = s.id
       ORDER BY st.table_no`
    );
    res.json(tables);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST assign table
app.post('/api/seating/assign', async (req, res) => {
  try {
    const { table_no, supplier_id } = req.body;
    await pool.execute('UPDATE seating_tables SET assigned_to=? WHERE table_no=?', [supplier_id, table_no]);
    res.json({ message: 'Table assigned' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Health check ──────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date() });
  } catch { res.status(500).json({ status: 'error', db: 'disconnected' }); }
});

app.listen(PORT, () => console.log(`✅  TMG Dinner API running on http://localhost:${PORT}`));

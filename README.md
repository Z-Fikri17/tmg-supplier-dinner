# TMG Supplier Appreciation Dinner 2026
## Full-Stack Web Application

---

## 🗂 Project Structure

```
tmg-dinner/
├── frontend/
│   ├── index.html          ← HTML structure only
│   ├── styles.css          ← All CSS (animations, components, layout)
│   └── app.js              ← All frontend JavaScript
├── backend/
│   ├── server.js           ← Express REST API (CSV storage)
│   ├── package.json
│   ├── data/               ← Auto-created CSV files
│   │   ├── suppliers.csv
│   │   ├── guests.csv
│   │   └── checkin_log.csv
│   └── uploads/
│       └── slips/          ← Uploaded payment slip files
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Backend (Node.js API)
```bash
cd backend
npm install
node server.js
# API runs on http://localhost:4000
```

**Environment variables (optional):**
```
PORT=4000
```

> No database needed — all data is stored in CSV files inside `backend/data/`.
> CSV files and seed data are created automatically on first run.

### 2. Frontend
```bash
# Open directly in browser:
open frontend/index.html

# Or serve with any static server:
npx serve frontend/
# OR
python -m http.server 3000 -d frontend/
```

> **Offline mode:** The frontend works standalone using in-memory seed data if the backend is unavailable.

---

## 💳 Payment Method

This version uses **Online Bank Transfer only**.  
Sponsors must:
1. Transfer the sponsorship amount to the bank details shown in the form
2. Upload their payment slip (JPG, PNG, or PDF)
3. Wait for admin verification

Bank details:
- **Bank:** Maybank Berhad
- **Account Name:** TMG Group Sdn Bhd
- **Account No:** 1234 5678 9012
- **Reference:** TMGDINNER2026 + Company Name

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/suppliers | List all suppliers (search, filter, paginate) |
| GET    | /api/suppliers/:id | Get supplier + guests |
| POST   | /api/suppliers | Register new supplier (multipart with slip) |
| PATCH  | /api/suppliers/:id/payment | Update payment status |
| POST   | /api/suppliers/:id/slip | Upload payment slip separately |
| POST   | /api/checkin | Check-in by ticket code |
| GET    | /api/checkin/log | Recent check-in log |
| GET    | /api/dashboard | Dashboard summary stats |
| GET    | /api/seating | Seating plan |
| POST   | /api/seating/assign | Assign table to supplier |
| GET    | /api/export/suppliers | Download suppliers.csv |
| GET    | /api/export/guests | Download guests.csv |
| GET    | /api/export/checkin | Download checkin_log.csv |
| GET    | /api/health | Health check + CSV file status |

---

## 📦 Sponsorship Packages

| Package | Price    | Seats | Zone |
|---------|----------|-------|------|
| ⭐ Gold  | RM 50,000 | 10   | VIP Front |
| 🥈 Silver | RM 30,000 | 6   | Front Section |
| 🥉 Bronze | RM 10,000 | 2   | General Area |

---

## 🗄 CSV Storage

All data is stored in plain CSV files — no database required:

| File | Contents |
|------|----------|
| `data/suppliers.csv` | All sponsor registrations |
| `data/guests.csv` | Guest list per sponsor |
| `data/checkin_log.csv` | Event day check-in records |

Files are seeded with 10 demo records on first run.

---

## 🎨 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend HTML | Semantic HTML5 (`index.html`) |
| Frontend CSS  | Custom CSS + Tailwind CDN (`styles.css`) |
| Frontend JS   | Vanilla JavaScript (`app.js`) |
| Backend       | Node.js, Express 4 |
| Storage       | CSV files (via Node.js `fs`) |
| File Upload   | Multer |
| QR Codes      | QRCode.js (CDN) |

---

## 🔐 Admin Login

Access via the `···` button (top-right of landing page).

| Username | Password | Role |
|----------|----------|------|
| admin    | tmg2026  | Super Admin |
| itadmin  | tmg@it   | IT Admin |
| dato     | dato123  | Read Only |

---

## 🚀 Production Checklist

- [ ] Implement JWT authentication for admin routes
- [ ] Enable HTTPS
- [ ] Migrate CSV to a proper DB (SQLite/PostgreSQL) when scale increases
- [ ] Configure cloud storage for payment slips (AWS S3)
- [ ] Set CORS origin to your domain
- [ ] Add email notifications (Nodemailer)
- [ ] Regular CSV backups

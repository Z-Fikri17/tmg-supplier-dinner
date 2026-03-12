# TMG Supplier Appreciation Dinner 2026
## Full-Stack Web Application

---

## 🗂 Project Structure

```
tmg-dinner/
├── database/
│   └── schema.sql          ← MySQL schema + seed data
├── backend/
│   ├── server.js           ← Express REST API
│   └── package.json
├── frontend/
│   └── index.html          ← React + Tailwind CSS + Heroicons (single file)
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. MySQL Database
```sql
-- In MySQL Workbench or terminal:
mysql -u root -p < database/schema.sql
```

### 2. Backend (Node.js API)
```bash
cd backend
npm install
# Edit server.js: update DB_PASSWORD, DB_HOST etc.
npm start
# API runs on http://localhost:4000
```

**Environment variables (optional):**
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=tmg_dinner
PORT=4000
```

### 3. Frontend
```bash
# Open directly in browser:
open frontend/index.html

# Or host via any web server:
npx serve frontend/
# OR
python -m http.server 3000 -d frontend/
```

> **Note:** The frontend auto-detects if the backend is unavailable and falls back to mock data — so you can demo it standalone.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/suppliers | List all suppliers (search, filter, paginate) |
| GET    | /api/suppliers/:id | Get supplier + guests |
| POST   | /api/suppliers | Register new supplier |
| PATCH  | /api/suppliers/:id/payment | Update payment status |
| POST   | /api/suppliers/:id/slip | Upload payment slip |
| POST   | /api/checkin | Check-in by ticket QR code |
| GET    | /api/checkin/log | Recent check-in log |
| GET    | /api/dashboard | Dashboard summary stats |
| GET    | /api/seating | Seating plan |
| POST   | /api/seating/assign | Assign table to supplier |
| GET    | /api/health | Health check |

---

## 🎨 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (CDN), Tailwind CSS, Heroicons (inline SVG), QRCode.js |
| Backend | Node.js, Express 4 |
| Database | MySQL 8 |
| File Upload | Multer |
| Auth (add-on) | JWT (recommended for production) |

---

## 📦 Sponsorship Packages

| Package | Price | Seats |
|---------|-------|-------|
| ⭐ Gold | RM 50,000 | 10 |
| 🥈 Silver | RM 30,000 | 6 |
| 🥉 Bronze | RM 10,000 | 2 |

---

## 🚀 Production Checklist

- [ ] Set strong DB password
- [ ] Add JWT authentication for admin routes
- [ ] Enable HTTPS
- [ ] Configure file storage (AWS S3 or local)
- [ ] Set CORS origin to your domain
- [ ] Add email notifications (Nodemailer)
- [ ] Deploy backend (Railway / Render / VPS)
- [ ] Host frontend (Netlify / Vercel / SharePoint)

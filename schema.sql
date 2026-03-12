-- ============================================================
--  TMG Supplier Appreciation Dinner 2026 — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS tmg_dinner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tmg_dinner;

-- ── SPONSORS / COMPANIES ──────────────────────────────────
CREATE TABLE suppliers (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id     VARCHAR(20)  NOT NULL UNIQUE,          -- e.g. TMG-2026-001
    company_name  VARCHAR(200) NOT NULL,
    contact_name  VARCHAR(100) NOT NULL,
    designation   VARCHAR(100),
    email         VARCHAR(150) NOT NULL,
    phone         VARCHAR(30)  NOT NULL,
    package       ENUM('gold','silver','bronze') NOT NULL,
    total_seats   INT          NOT NULL DEFAULT 2,
    payment_method ENUM('duitnow_qr','bank_transfer') NOT NULL,
    payment_status ENUM('pending','review','paid','rejected') NOT NULL DEFAULT 'pending',
    payment_slip_url VARCHAR(500),
    logo_url      VARCHAR(500),
    ad_slide_url  VARCHAR(500),
    ad_video_url  VARCHAR(500),
    checked_in    TINYINT(1)   NOT NULL DEFAULT 0,
    checkin_time  DATETIME,
    registered_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    notes         TEXT
);

-- ── GUESTS (per supplier) ─────────────────────────────────
CREATE TABLE guests (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id   INT         NOT NULL,
    guest_name    VARCHAR(100) NOT NULL,
    position      VARCHAR(100),
    dietary       ENUM('standard','vegetarian','vegan','halal_only','no_pork','other') DEFAULT 'standard',
    checked_in    TINYINT(1)  NOT NULL DEFAULT 0,
    checkin_time  DATETIME,
    table_no      INT,
    seat_no       INT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

-- ── TABLES / SEATING ─────────────────────────────────────
CREATE TABLE seating_tables (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    table_no      INT NOT NULL UNIQUE,
    capacity      INT NOT NULL DEFAULT 10,
    section       VARCHAR(50),     -- e.g. 'VIP', 'Front', 'General'
    assigned_to   INT,             -- supplier_id (primary)
    FOREIGN KEY (assigned_to) REFERENCES suppliers(id) ON DELETE SET NULL
);

-- ── PAYMENTS ─────────────────────────────────────────────
CREATE TABLE payments (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id   INT NOT NULL,
    amount        DECIMAL(10,2) NOT NULL,
    currency      CHAR(3) NOT NULL DEFAULT 'MYR',
    method        ENUM('duitnow_qr','bank_transfer') NOT NULL,
    reference_no  VARCHAR(100),
    slip_url      VARCHAR(500),
    status        ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    verified_by   VARCHAR(100),
    verified_at   DATETIME,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

-- ── CHECK-IN LOG ─────────────────────────────────────────
CREATE TABLE checkin_log (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id   INT NOT NULL,
    scanned_by    VARCHAR(100),
    scanned_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    device_info   VARCHAR(200),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- ── AUDIT LOG ────────────────────────────────────────────
CREATE TABLE audit_log (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    table_name    VARCHAR(50),
    record_id     INT,
    action        ENUM('INSERT','UPDATE','DELETE'),
    changed_by    VARCHAR(100),
    changed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details       JSON
);

-- ── SEED: Sample Tables ───────────────────────────────────
INSERT INTO seating_tables (table_no, capacity, section) VALUES
(1,10,'VIP'),(2,10,'VIP'),(3,10,'VIP'),
(4,10,'Front'),(5,10,'Front'),(6,10,'Front'),(7,10,'Front'),(8,10,'Front'),
(9,10,'General'),(10,10,'General'),(11,10,'General'),(12,10,'General'),
(13,10,'General'),(14,10,'General'),(15,10,'General'),(16,10,'General'),
(17,10,'General'),(18,10,'General'),(19,10,'General'),(20,10,'General'),
(21,10,'General'),(22,10,'General'),(23,10,'General'),(24,10,'General'),
(25,10,'General'),(26,10,'General'),(27,10,'General'),(28,10,'General'),
(29,10,'General'),(30,10,'General'),(31,10,'General'),(32,10,'General'),
(33,10,'General'),(34,10,'General'),(35,10,'General'),(36,10,'General'),
(37,10,'General'),(38,10,'General'),(39,10,'General'),(40,10,'General'),
(41,10,'General'),(42,10,'General'),(43,10,'General'),(44,10,'General'),
(45,10,'General'),(46,10,'General'),(47,10,'General'),(48,10,'General'),
(49,10,'General'),(50,10,'General');

-- ── SEED: Sample Suppliers ───────────────────────────────
INSERT INTO suppliers (ticket_id,company_name,contact_name,designation,email,phone,package,total_seats,payment_method,payment_status,checked_in) VALUES
('TMG-2026-001','Nestle Malaysia Berhad','Ahmad Zulkifli','CEO','ahmad@nestle.com.my','+60123456789','gold',10,'duitnow_qr','paid',0),
('TMG-2026-002','Dutch Lady Industries','Priya Raman','GM Sales','priya@dutchlady.com.my','+60123456790','gold',10,'bank_transfer','paid',0),
('TMG-2026-003','Unilever Malaysia','Tan Wei Ming','Director','tanwm@unilever.com.my','+60123456791','silver',6,'duitnow_qr','paid',0),
('TMG-2026-004','F&N Beverages Marketing','Siti Zainab','Manager','siti@fn.com.my','+60123456792','silver',6,'bank_transfer','pending',0),
('TMG-2026-005','Mamee-Double Decker','Lim Kok Weng','VP','limkw@mamee.com.my','+60123456793','bronze',2,'duitnow_qr','paid',0),
('TMG-2026-006','Gardenia Bakeries','Mohd Hafiz','COO','hafiz@gardenia.com.my','+60123456794','bronze',2,'bank_transfer','review',0),
('TMG-2026-007','Spritzer Bhd','Lee Siew Fun','MD','leesf@spritzer.com.my','+60123456795','silver',6,'duitnow_qr','paid',0),
('TMG-2026-008','Power Root Bhd','Razali Othman','Chairman','razali@powerroot.com.my','+60123456796','bronze',2,'bank_transfer','pending',0);

-- ── USEFUL VIEWS ─────────────────────────────────────────
CREATE VIEW v_dashboard_summary AS
SELECT
    COUNT(*)                                          AS total_suppliers,
    SUM(total_seats)                                  AS total_pax,
    SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS paid_count,
    SUM(CASE WHEN payment_status='pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN payment_status='review' THEN 1 ELSE 0 END)  AS review_count,
    SUM(CASE WHEN checked_in=1 THEN 1 ELSE 0 END)    AS checked_in_count,
    SUM(CASE WHEN package='gold'   AND payment_status='paid' THEN 50000 ELSE 0 END) +
    SUM(CASE WHEN package='silver' AND payment_status='paid' THEN 30000 ELSE 0 END) +
    SUM(CASE WHEN package='bronze' AND payment_status='paid' THEN 10000 ELSE 0 END) AS total_revenue
FROM suppliers;

CREATE VIEW v_package_breakdown AS
SELECT
    package,
    COUNT(*)      AS count,
    SUM(total_seats) AS seats,
    SUM(CASE WHEN package='gold'   THEN 50000
             WHEN package='silver' THEN 30000
             ELSE 10000 END)        AS revenue
FROM suppliers
GROUP BY package;

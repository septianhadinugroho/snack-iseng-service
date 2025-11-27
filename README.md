# Snack Iseng Service (Backend) 🍿

Backend service untuk aplikasi manajemen penjualan "Snack Iseng". Dibangun menggunakan Node.js & Express, backend ini menangani manajemen pesanan, stok, pengeluaran, serta fitur notifikasi real-time (Web Push) dan Mode Demo.

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** PostgreSQL (via Neon/Supabase/Local)
* **ORM:** Sequelize
* **Auth:** JWT (JSON Web Token) & Bcrypt
* **Fitur Unggulan:**
    * **Demo Guard:** Middleware untuk proteksi mode tamu (Read-Only).
    * **Web Push:** Notifikasi real-time ke browser/HP.
    * **Excel Import:** Upload data pesanan/belanja via Excel.

## 📋 Prasyarat

Pastikan sudah menginstall:
1.  [Node.js](https://nodejs.org/) (v16+)
2.  [PostgreSQL](https://www.postgresql.org/) (atau akun Neon Tech)

## 🚀 Instalasi & Setup

1.  **Clone Repository & Install Dependensi:**
    ```bash
    npm install
    ```

2.  **Konfigurasi Environment (.env):**
    Buat file `.env` di root folder dan isi konfigurasi berikut:

    ```env
    PORT=5000
    JWT_SECRET=rahasia_negara_snack_iseng

    # Konfigurasi Database (Pilih salah satu)
    # Opsi A: Connection String (Disarankan untuk Neon/Vercel)
    DATABASE_URL=postgres://user:pass@host:port/dbname?sslmode=require

    # Opsi B: Manual (Untuk Localhost)
    # DB_USERNAME=postgres
    # DB_PASSWORD=password_kamu
    # DB_NAME=snack_iseng_db
    # DB_HOST=127.0.0.1
    # DB_PORT=5432

    # Web Push Notification (Generate via: npx web-push generate-vapid-keys)
    VAPID_PUBLIC_KEY=isi_public_key_disini
    VAPID_PRIVATE_KEY=isi_private_key_disini
    VAPID_EMAIL=mailto:admin@snackiseng.com
    ```

3.  **Setup Database (Migrasi & Seeding):**
    Jalankan perintah ini untuk membuat tabel dan mengisi data awal (Produk & Akun Demo):

    ```bash
    # 1. Membuat tabel di database
    npx sequelize-cli db:migrate

    # 2. Mengisi data produk & akun demo
    npx sequelize-cli db:seed:all
    ```

4.  **Menjalankan Server:**

    ```bash
    # Mode Development
    npm run dev

    # Mode Production
    npm start
    ```
    Server berjalan di `http://localhost:5000`.

## 👤 Akun Demo (Default)

Aplikasi ini memiliki fitur **Mode Demo** di mana user `demo` bisa melihat data tapi **tidak bisa** mengubah/menghapus data asli (simulasi sukses).

Gunakan akun berikut untuk login:
* **Username:** `demo`
* **Password:** `demo123`

## 📡 API Endpoints

Semua endpoint (kecuali Login & Subscribe) membutuhkan header:
`Authorization: Bearer <token_jwt>`

### 🔐 Auth & System
| Method | Endpoint | Deskripsi | Demo Guard? |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/login` | Login user/admin | ❌ |
| `GET` | `/api/vapid-public-key` | Ambil Public Key Push Notif | ❌ |
| `POST` | `/api/subscribe` | Subscribe device ke notifikasi | ❌ |

### 📦 Products (Produk)
| Method | Endpoint | Deskripsi | Demo Guard? |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | List produk & statistik | ❌ |
| `PUT` | `/api/products/:id` | Update harga produk | ✅ Protected |

### 🛒 Orders (Pesanan)
| Method | Endpoint | Deskripsi | Demo Guard? |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/orders` | List semua pesanan | ❌ |
| `POST` | `/api/orders` | Input pesanan baru | ✅ Protected |
| `PUT` | `/api/orders/:id` | Edit pesanan | ✅ Protected |
| `DELETE` | `/api/orders/:id` | Hapus pesanan | ✅ Protected |
| `POST` | `/api/orders/import` | Import Excel Pesanan | ✅ Protected |
| `DELETE` | `/api/orders/reset/all` | **RESET SEMUA DATA ORDER** | ✅ Protected |

### 💸 Expenses (Pengeluaran)
| Method | Endpoint | Deskripsi | Demo Guard? |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/expenses` | List pengeluaran belanja | ❌ |
| `POST` | `/api/expenses` | Input nota belanja baru | ✅ Protected |
| `PUT` | `/api/expenses/:id` | Edit nota belanja | ✅ Protected |
| `DELETE` | `/api/expenses/:id` | Hapus nota belanja | ✅ Protected |
| `DELETE` | `/api/expenses/items/:id` | Hapus 1 item dalam nota | ✅ Protected |
| `POST` | `/api/expenses/import` | Import Excel Belanja | ✅ Protected |
| `DELETE` | `/api/expenses/reset/all` | **RESET SEMUA DATA BELANJA** | ✅ Protected |

### 📊 Dashboard & Notifikasi
| Method | Endpoint | Deskripsi | Demo Guard? |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard` | Statistik omzet, chart, profit | ❌ |
| `GET` | `/api/notifications` | History log aktivitas | ❌ |
| `DELETE` | `/api/notifications/:id` | Hapus log aktivitas | ✅ Protected |

> **Catatan Demo Guard:** Jika login menggunakan user `demo`, semua request bertanda ✅ akan mengembalikan status "Sukses" palsu dan tidak akan merubah data di database.

## ☁️ Deployment (Vercel)

Project ini sudah dikonfigurasi (`vercel.json`) untuk deploy ke Vercel.
Pastikan set Environment Variables (`DATABASE_URL`, `JWT_SECRET`, dll) di dashboard Vercel.

---
Copyright © 2025 Snack Iseng Service
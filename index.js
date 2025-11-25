const express = require('express');
const cors = require('cors');
const { User, Product, Order, OrderItem, Expense, ExpenseItem, HistoryLog, Sequelize } = require('./models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const webpush = require('web-push'); // Untuk Notif PWA
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() }); // Simpan di RAM sebentar

const app = express();
app.use(cors());
app.use(express.json());

// --- Middleware Auth ---
const auth = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET || 'secret');
    next();
  } catch (e) { res.status(403).json({ error: 'Invalid token' }); }
};

// --- Routes ---

// 1. Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET || 'secret');
  res.json({ token, user: { username: user.username, role: user.role } });
});

// --- 2. Dashboard Stats (Gacor Logic) ---
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const totalOrders = await Order.count();
    const income = await Order.sum('totalPrice') || 0;
    
    // PERBAIKAN DISINI: Ganti 'price' jadi 'totalCost'
    const expenseTotal = await Expense.sum('totalCost') || 0; 
    
    // Grafik: Penjualan per Varian
    const salesByVariant = await OrderItem.findAll({
      attributes: ['productName', [Sequelize.fn('sum', Sequelize.col('quantity')), 'totalQty']],
      group: ['productName']
    });

    // History Logs
    const history = await HistoryLog.findAll({ limit: 10, order: [['createdAt', 'DESC']] });

    res.json({
      cards: { totalOrders, income, expenseTotal, profit: income - expenseTotal },
      chart: salesByVariant,
      history
    });
  } catch (error) {
    console.error("Dashboard Error:", error); // Biar kelihatan errornya di terminal
    res.status(500).json({ error: error.message });
  }
});

// 3. Products (Get & Variants Count)
app.get('/api/products', auth, async (req, res) => {
  const products = await Product.findAll();
  // Hitung pesanan per varian untuk card Product Management
  const variantStats = await OrderItem.findAll({
    attributes: ['productName', [Sequelize.fn('sum', Sequelize.col('quantity')), 'total']],
    group: ['productName']
  });
  res.json({ products, variantStats });
});

// --- CREATE ORDER (POST) ---
app.post('/api/orders', auth, async (req, res) => {
  const adminId = req.user.id;
  const adminName = req.user.username;

  // TAMBAHAN: isReceived
  const { customerName, items, paymentMethod, isPaid, isReceived, description, date } = req.body;
  
  let totalPrice = 0;
  let totalItems = 0;
  items.forEach(i => {
    totalPrice += i.quantity * 5000;
    totalItems += parseInt(i.quantity);
  });

  const order = await Order.create({
    customerName, 
    paymentMethod, 
    paymentStatus: isPaid,
    isReceived: isReceived || false, // Default false kalau null
    description, 
    totalItems, 
    totalPrice, 
    date,
    UserId: adminId
  });

  for (const item of items) {
    await OrderItem.create({
      OrderId: order.id,
      ProductId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      subtotal: item.quantity * 5000
    });
  }

  await HistoryLog.create({ action: `Order Baru (${customerName}) oleh ${adminName}`, type: 'ORDER' });
  res.json({ success: true });
});

app.get('/api/orders', auth, async (req, res) => {
  const orders = await Order.findAll({
    include: [
      { model: OrderItem, as: 'items' },
      // Include data Admin, ambil usernamenya aja biar hemat
      { model: User, as: 'admin', attributes: ['username'] } 
    ],
    order: [['createdAt', 'DESC']]
  });
  res.json(orders);
});

// Update Status Terima/Bayar
app.put('/api/products/:id', auth, async (req, res) => {
    const { price } = req.body;
    await Product.update({ price }, { where: { id: req.params.id } });
    res.json({ success: true });
});

// --- UPDATE ORDER & DELETE ---
app.delete('/api/orders/:id', auth, async (req, res) => {
    await Order.destroy({ where: { id: req.params.id } });
    await HistoryLog.create({ action: `Hapus Order ID: ${req.params.id}`, type: 'ORDER' });
    res.json({ success: true });
});

// 5. Expenses
// --- UPDATE LOGIC BELANJA (POST) ---
app.post('/api/expenses', auth, async (req, res) => {
  try {
    // 1. Ambil data yang dikirim dari Frontend
    // Frontend kirim: { date, items:Array, yieldEstimate, description }
    const { date, items, yieldEstimate, description } = req.body;

    // 2. Validasi: Pastikan ada barangnya
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Barang belanjaan gak boleh kosong!" });
    }

    // 3. Hitung Total Harga secara manual di Backend (Biar aman)
    let totalCost = 0;
    items.forEach(item => {
      // Pastikan harga dianggap angka (parseInt)
      if (item.price) totalCost += parseInt(item.price);
    });

    // 4. Simpan PARENT (Tabel Expenses / Notanya)
    const expense = await Expense.create({
      date,
      totalCost,
      yieldEstimate: parseInt(yieldEstimate) || 0, // Kalau kosong dianggap 0
      description
    });

    // 5. Simpan CHILDREN (Tabel ExpenseItems / Daftar Barangnya)
    // Kita loop array items dan simpan satu per satu dengan ID Parent
    for (const item of items) {
      // Cek biar gak nyimpen baris kosong
      if (item.name && item.price) {
        await ExpenseItem.create({
          ExpenseId: expense.id, // <--- INI KUNCINYA (Relasi ke Nota)
          name: item.name,
          quantity: item.quantity,
          price: parseInt(item.price)
        });
      }
    }

    // 6. Catat di History Log Dashboard
    await HistoryLog.create({ 
      action: `Belanja Stok (Rp ${totalCost.toLocaleString()})`, 
      type: 'EXPENSE' 
    });

    // 7. Berhasil!
    res.json({ success: true, message: "Belanja berhasil dicatat!" });

  } catch (error) {
    // Kalau ada error, tampilkan di Terminal Backend biar ketahuan
    console.error("ERROR POST EXPENSES:", error);
    res.status(500).json({ error: error.message });
  }
});

// TAMBAHAN: Get History Belanja
app.get('/api/expenses', auth, async (req, res) => {
  try {
    const expenses = await Expense.findAll({
      // include model ExpenseItem dengan alias 'items' (sesuai associate di model)
      include: [{ model: ExpenseItem, as: 'items' }], 
      order: [['date', 'DESC']]
    });
    res.json(expenses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- UPDATE ORDER (PUT) ---
app.put('/api/orders/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    // TAMBAHAN: isReceived dimasukin ke sini
    const { customerName, items, paymentMethod, isPaid, isReceived, description, date } = req.body;

    // 1. Hitung ulang total
    let totalPrice = 0;
    let totalItems = 0;
    items.forEach(i => {
      totalPrice += i.quantity * 5000;
      totalItems += parseInt(i.quantity);
    });

    // 2. Update Data Parent (Order)
    await Order.update({
      customerName, 
      paymentMethod, 
      paymentStatus: isPaid, 
      isReceived: isReceived, // <--- INI DIA BIANG KEROKNYA KEMARIN GAK ADA
      description, 
      totalItems, 
      totalPrice, 
      date
    }, { where: { id } });

    // 3. Reset Items (Hapus lama, buat baru)
    await OrderItem.destroy({ where: { OrderId: id } });

    for (const item of items) {
      await OrderItem.create({
        OrderId: id,
        ProductId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        subtotal: item.quantity * 5000
      });
    }

    await HistoryLog.create({ action: `Edit Order ID: ${id} (${customerName})`, type: 'ORDER' });
    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- UPDATE EXPENSE (PUT) ---
app.put('/api/expenses/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, items, yieldEstimate, description } = req.body;

    // 1. Hitung ulang total
    let totalCost = 0;
    items.forEach(i => { if (i.price) totalCost += parseInt(i.price); });

    // 2. Update Parent
    await Expense.update({
      date, totalCost, yieldEstimate, description
    }, { where: { id } });

    // 3. Reset Items
    await ExpenseItem.destroy({ where: { ExpenseId: id } });

    for (const item of items) {
       if (item.name && item.price) {
          await ExpenseItem.create({
            ExpenseId: id,
            name: item.name,
            quantity: item.quantity,
            price: parseInt(item.price)
          });
       }
    }
    
    await HistoryLog.create({ action: `Edit Belanja ID: ${id}`, type: 'EXPENSE' });
    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- IMPORT EXCEL ORDERS (FIX NAMA PEDAS BON CABE) ---
app.post('/api/orders/import', auth, upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: 0, raw: false });

    // MAPPING PINTAR: Header Excel -> Data Database
    // Kiri: Nama Kolom di Excel
    // Kanan: { id: ID di DB, realName: Nama Asli di DB }
    const variantMap = {
      'Balado':       { id: 1, realName: 'Balado' },
      'BBQ':          { id: 2, realName: 'BBQ' },
      'Jagung Bakar': { id: 3, realName: 'Jagung Bakar' },
      'Keju':         { id: 4, realName: 'Keju' },
      'Original':     { id: 5, realName: 'Original' },
      'Pedas':        { id: 6, realName: 'Pedas Bon Cabe' } // <--- INI PERBAIKANNYA
    };

    let count = 0;
    const adminId = req.user.id;

    for (const row of data) {
      if (!row['Nama']) continue; 

      // 1. Logic Tanggal
      let orderDate = new Date();
      if (row['Tanggal']) {
         const dateVal = row['Tanggal'];
         if (!isNaN(Date.parse(dateVal))) {
             orderDate = new Date(dateVal); 
         } else if (typeof dateVal === 'string' && dateVal.includes('/')) {
             const [day, month, year] = dateVal.split('/');
             orderDate = new Date(`${year}-${month}-${day}`);
         }
      }

      // 2. Logic Status Bayar
      const statusBayarRaw = (row['Status Pembayaran'] || '').toString().toLowerCase().trim();
      let isPaid = true;
      let paymentMethod = 'Cash';

      if (statusBayarRaw.includes('belum') || statusBayarRaw === '') {
          isPaid = false;
      } else {
          if (statusBayarRaw.includes('qris')) paymentMethod = 'QRIS';
      }

      // 3. Logic Snack Diterima
      const snackDiterimaRaw = (row['Snack Diterima'] || '').toString().toLowerCase().trim();
      const isReceived = snackDiterimaRaw.includes('sudah');

      // 4. Hitung Items & Convert Nama
      const items = [];
      let totalItemsCalc = 0;
      let calculatedPrice = 0;

      // Loop berdasarkan Mapping kita, bukan raw data excel
      for (const [excelHeader, dbData] of Object.entries(variantMap)) {
        // Ambil jumlah dari kolom Excel (misal kolom 'Pedas')
        let qty = parseInt(row[excelHeader]);
        if (isNaN(qty)) qty = 0;
        
        if (qty > 0) {
          items.push({ 
            ProductId: dbData.id, 
            productName: dbData.realName, // <--- DISINI KITA PAKAI NAMA ASLI (Pedas Bon Cabe)
            quantity: qty, 
            subtotal: qty * 5000 
          });
          totalItemsCalc += qty;
          calculatedPrice += qty * 5000;
        }
      }

      if (items.length > 0) {
        const order = await Order.create({
          customerName: row['Nama'],
          date: orderDate,
          paymentMethod: isPaid ? paymentMethod : 'Cash',
          paymentStatus: isPaid,
          isReceived: isReceived, 
          description: row['Deskripsi'] || '',
          totalItems: totalItemsCalc,
          totalPrice: calculatedPrice,
          UserId: adminId
        });

        for (const item of items) {
          await OrderItem.create({ ...item, OrderId: order.id });
        }
        count++;
      }
    }

    await HistoryLog.create({ action: `Import Excel: ${count} Pesanan`, type: 'ORDER' });
    res.json({ success: true, message: `Berhasil import ${count} data` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- IMPORT EXCEL EXPENSES (ANTI ERROR STRIP "-") ---
app.post('/api/expenses/import', auth, upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: 0, raw: false });

    // Helper: Ubah Strip/Rp/String jadi Angka Murni
    const cleanNumber = (val) => {
        if (!val) return 0;
        const strVal = val.toString().trim();
        if (strVal === '-' || strVal === '') return 0;
        // Hapus "Rp", titik, koma, spasi. Sisakan angka.
        const cleanStr = strVal.replace(/[^0-9]/g, ''); 
        return parseInt(cleanStr) || 0;
    };

    let currentExpense = null;
    let itemsBuffer = [];
    let count = 0;

    for (const row of data) {
        // Skip baris Total (karena kita hitung sendiri)
        if (row['Beli'] === 'Total') continue;

        // Cek Header Nota Baru (Kolom "Belanja ke" ada isinya)
        if (row['Belanja ke'] && row['Belanja ke'].toString().trim() !== '') {
            
            // Simpan nota sebelumnya kalau ada
            if (currentExpense && itemsBuffer.length > 0) {
                await saveFullExpense(currentExpense, itemsBuffer);
                count++;
            }

            // Inisialisasi Nota Baru
            currentExpense = {
                // Di sini kita bersihkan tanda strip "-" jadi 0
                yieldEstimate: cleanNumber(row['Bungkus']),
                date: new Date(), 
            };
            itemsBuffer = [];
        }

        // Ambil Item
        if (row['Beli']) {
            itemsBuffer.push({
                name: row['Beli'],
                quantity: row['Quantity'],
                // Bersihkan harga juga (jaga-jaga ada strip atau Rp)
                price: cleanNumber(row['Harga'])
            });
        }
    }

    // Simpan sisa terakhir
    if (currentExpense && itemsBuffer.length > 0) {
        await saveFullExpense(currentExpense, itemsBuffer);
        count++;
    }

    await HistoryLog.create({ action: `Import Excel: ${count} Nota Belanja`, type: 'EXPENSE' });
    res.json({ success: true, message: `Sukses import ${count} nota` });

  } catch (error) {
    console.error("ERROR IMPORT EXPENSE:", error); // Cek terminal backend kalau error
    res.status(500).json({ error: error.message });
  }
});

// Helper Function Simpan ke DB (Tetap Sama)
async function saveFullExpense(expData, items) {
    let totalCost = 0;
    items.forEach(i => totalCost += i.price);

    const expense = await Expense.create({
        date: expData.date,
        totalCost,
        yieldEstimate: expData.yieldEstimate,
        description: `Import Excel (Hasil: ${expData.yieldEstimate})`
    });

    for (const item of items) {
        await ExpenseItem.create({
            ExpenseId: expense.id,
            name: item.name,
            quantity: item.quantity ? item.quantity.toString() : '-',
            price: item.price
        });
    }
}

// --- RESET SEMUA ORDER (KHUSUS DEV) ---
app.delete('/api/orders/reset/all', auth, async (req, res) => {
  try {
    // Pakai truncate biar ID balik ke 1 dan lebih cepat
    // Cascade: true biar OrderItems ikut kehapus otomatis
    await Order.destroy({ where: {}, truncate: true, cascade: true });
    
    // Opsional: Hapus history log order juga biar bersih
    await HistoryLog.destroy({ where: { type: 'ORDER' } });

    res.json({ success: true, message: "Semua Data Order & History BERSIH!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- RESET SEMUA BELANJA (KHUSUS DEV) ---
app.delete('/api/expenses/reset/all', auth, async (req, res) => {
  try {
    // Truncate: Hapus isi tabel & Reset ID jadi 1
    // Cascade: True (Anak-anaknya di ExpenseItems ikut kehapus)
    await Expense.destroy({ where: {}, truncate: true, cascade: true });

    // Hapus log history belanja biar dashboard bersih
    await HistoryLog.destroy({ where: { type: 'EXPENSE' } });

    res.json({ success: true, message: "Semua Data Belanja & History BERSIH!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Setup Port
const PORT = process.env.PORT || 5000;

// Cek apakah sedang running di local atau production (Vercel)
if (require.main === module) {
    // Jika dijalankan manual (node index.js), jalankan listen
    app.listen(PORT, async () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// PENTING: Export app untuk Vercel
module.exports = app;
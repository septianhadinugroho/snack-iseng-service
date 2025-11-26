const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const { User, Product, Order, OrderItem, Expense, ExpenseItem, HistoryLog, Subscription, Sequelize } = require('./models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() }); 

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

// Setup Web Push
webPush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:test@test.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// --- Helper Function Kirim Notif ke Semua Orang ---
const broadcastNotification = async (title, body, url = '/') => {
  const subscriptions = await Subscription.findAll();
  
  const notificationPayload = JSON.stringify({ title, body, url });

  subscriptions.forEach(sub => {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: sub.keys
    };

    webPush.sendNotification(pushConfig, notificationPayload)
      .catch(err => {
        console.error("Gagal kirim notif", err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Kalau endpoint sudah basi/unregistered, hapus dari DB
          Subscription.destroy({ where: { endpoint: sub.endpoint } });
        }
      });
  });
};

// --- Routes ---

// 1. Endpoint untuk Frontend ambil Public Key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// 2. Endpoint Subscribe (Frontend lapor diri mau dikirimin notif)
app.post('/api/subscribe', async (req, res) => {
  const subscription = req.body;
  try {
    // Simpan atau Update jika sudah ada
    const [sub, created] = await Subscription.findOrCreate({
      where: { endpoint: subscription.endpoint },
      defaults: { keys: subscription.keys }
    });
    
    if (!created) {
        sub.keys = subscription.keys;
        await sub.save();
    }
    
    res.status(201).json({});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal subscribe' });
  }
});

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

// --- 2. Dashboard Stats ---
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const totalOrders = await Order.count();
    const income = await Order.sum('totalPrice') || 0;
    const expenseTotal = await Expense.sum('totalCost') || 0; 
    
    const salesByVariant = await OrderItem.findAll({
      attributes: ['productName', [Sequelize.fn('sum', Sequelize.col('quantity')), 'totalQty']],
      group: ['productName']
    });

    const history = await HistoryLog.findAll({ limit: 10, order: [['createdAt', 'DESC']] });

    res.json({
      cards: { totalOrders, income, expenseTotal, profit: income - expenseTotal },
      chart: salesByVariant,
      history
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Products
app.get('/api/products', auth, async (req, res) => {
  const products = await Product.findAll();
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
    isReceived: isReceived || false,
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

  // [LOGIC NOTIFIKASI REAL-TIME]
  const itemDetails = items.map(i => `${i.productName} (${i.quantity})`).join(', ');
  const logMsg = `${customerName} - ${itemDetails} - Rp ${totalPrice.toLocaleString()}`;

  await HistoryLog.create({ action: logMsg, type: 'ORDER' });

  // ==> TAMBAHAN: KIRIM NOTIFIKASI PUSH <==
  broadcastNotification('Order Baru Masuk! 💰', `${customerName} beli ${totalItems} item`, '/orders');

  res.json({ success: true });
});

app.get('/api/orders', auth, async (req, res) => {
  const orders = await Order.findAll({
    include: [
      { model: OrderItem, as: 'items' },
      { model: User, as: 'admin', attributes: ['username'] } 
    ],
    order: [['createdAt', 'DESC']]
  });
  res.json(orders);
});

// Update Harga Produk
app.put('/api/products/:id', auth, async (req, res) => {
    const { price } = req.body;
    await Product.update({ price }, { where: { id: req.params.id } });
    res.json({ success: true });
});

// --- DELETE ORDER ---
app.delete('/api/orders/:id', auth, async (req, res) => {
    // Ambil detail order sebelum dihapus untuk log
    const order = await Order.findByPk(req.params.id);
    const name = order ? order.customerName : 'Unknown';

    await Order.destroy({ where: { id: req.params.id } });
    
    await HistoryLog.create({ action: `Hapus Order: ${name}`, type: 'ORDER' });

    // [TAMBAHAN NOTIFIKASI]
    broadcastNotification(
        'Order Dihapus 🗑️', 
        `Order atas nama ${name} telah dihapus dari sistem.`, 
        '/orders'
    );

    res.json({ success: true });
});
// --- CREATE EXPENSE (POST) ---
app.post('/api/expenses', auth, async (req, res) => {
  try {
    const { date, items, yieldEstimate, description } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Barang belanjaan gak boleh kosong!" });
    }

    let totalCost = 0;
    items.forEach(item => {
      if (item.price) totalCost += parseInt(item.price);
    });

    const expense = await Expense.create({
      date,
      totalCost,
      yieldEstimate: parseInt(yieldEstimate) || 0,
      description
    });

    for (const item of items) {
      if (item.name && item.price) {
        await ExpenseItem.create({
          ExpenseId: expense.id,
          name: item.name,
          quantity: item.quantity,
          price: parseInt(item.price)
        });
      }
    }

    // [PERBAIKAN] Log Lebih Detail untuk Notifikasi
    const itemDetails = items.map(i => `${i.name}`).join(', ');
    const logMsg = `${itemDetails} - Rp ${totalCost.toLocaleString()}`;

    await HistoryLog.create({ 
      action: logMsg, 
      type: 'EXPENSE' 
    });

    // ==> TAMBAHAN: KIRIM NOTIFIKASI PUSH <==
    broadcastNotification('Belanja Stok Baru 🛒', `Total: Rp ${totalCost.toLocaleString()}`, '/expenses');
    
    res.json({ success: true, message: "Belanja berhasil dicatat!" });

  } catch (error) {
    console.error("ERROR POST EXPENSES:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/expenses', auth, async (req, res) => {
  try {
    const expenses = await Expense.findAll({
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
    const { customerName, items, paymentMethod, isPaid, isReceived, description, date } = req.body;

    let totalPrice = 0;
    let totalItems = 0;
    items.forEach(i => {
      totalPrice += i.quantity * 5000;
      totalItems += parseInt(i.quantity);
    });

    await Order.update({
      customerName, 
      paymentMethod, 
      paymentStatus: isPaid, 
      isReceived: isReceived,
      description, 
      totalItems, 
      totalPrice, 
      date
    }, { where: { id } });

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

    await HistoryLog.create({ action: `Edit Order: ${customerName}`, type: 'ORDER' });
    
    // [TAMBAHAN NOTIFIKASI]
    broadcastNotification(
        'Order Diupdate ✏️', 
        `Order atas nama ${customerName} telah diubah. Total: Rp ${totalPrice.toLocaleString()}`, 
        '/orders'
    );

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

    let totalCost = 0;
    items.forEach(i => { if (i.price) totalCost += parseInt(i.price); });

    await Expense.update({
      date, totalCost, yieldEstimate, description
    }, { where: { id } });

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

    // [TAMBAHAN NOTIFIKASI]
    broadcastNotification(
        'Nota Belanja Diupdate ✏️', 
        `Data belanja ID ${id} diubah. Total baru: Rp ${totalCost.toLocaleString()}`, 
        '/expenses'
    );

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- DELETE EXPENSE ---
app.delete('/api/expenses/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Expense.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({ error: "Data belanja tidak ditemukan" });
    }

    await HistoryLog.create({ action: `Hapus Nota Belanja ID: ${id}`, type: 'EXPENSE' });

    // [TAMBAHAN NOTIFIKASI]
    broadcastNotification(
        'Nota Belanja Dihapus 🗑️', 
        `Nota belanja ID ${id} telah dihapus permanen.`, 
        '/expenses'
    );

    res.json({ success: true, message: "Nota belanja berhasil dihapus" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- DELETE EXPENSE ITEM ---
app.delete('/api/expenses/items/:itemId', auth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const item = await ExpenseItem.findByPk(itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item barang tidak ditemukan' });
    }

    const parentId = item.ExpenseId;
    const priceToRemove = item.price;

    await item.destroy();

    const parentExpense = await Expense.findByPk(parentId);
    if (parentExpense) {
      const newTotal = (parentExpense.totalCost || 0) - priceToRemove;
      await parentExpense.update({ totalCost: newTotal < 0 ? 0 : newTotal });
    }

    res.json({ success: true, message: "Item berhasil dihapus & Total harga diperbarui" });

  } catch (error) {
    console.error("Error delete item:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- IMPORT ORDERS ---
app.post('/api/orders/import', auth, upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: 0, raw: false });

    const variantMap = {
      'Balado':       { id: 1, realName: 'Balado' },
      'BBQ':          { id: 2, realName: 'BBQ' },
      'Jagung Bakar': { id: 3, realName: 'Jagung Bakar' },
      'Keju':         { id: 4, realName: 'Keju' },
      'Original':     { id: 5, realName: 'Original' },
      'Pedas':        { id: 6, realName: 'Pedas Bon Cabe' }
    };

    let count = 0;
    const adminId = req.user.id;

    for (const row of data) {
      if (!row['Nama']) continue; 

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

      const statusBayarRaw = (row['Status Pembayaran'] || '').toString().toLowerCase().trim();
      let isPaid = true;
      let paymentMethod = 'Cash';

      if (statusBayarRaw.includes('belum') || statusBayarRaw === '') {
          isPaid = false;
      } else {
          if (statusBayarRaw.includes('qris')) paymentMethod = 'QRIS';
      }

      const snackDiterimaRaw = (row['Snack Diterima'] || '').toString().toLowerCase().trim();
      const isReceived = snackDiterimaRaw.includes('sudah');

      const items = [];
      let totalItemsCalc = 0;
      let calculatedPrice = 0;

      for (const [excelHeader, dbData] of Object.entries(variantMap)) {
        let qty = parseInt(row[excelHeader]);
        if (isNaN(qty)) qty = 0;
        
        if (qty > 0) {
          items.push({ 
            ProductId: dbData.id, 
            productName: dbData.realName,
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

// --- IMPORT EXPENSES ---
app.post('/api/expenses/import', auth, upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: 0, raw: false });

    const cleanNumber = (val) => {
        if (!val) return 0;
        const strVal = val.toString().trim();
        if (strVal === '-' || strVal === '') return 0;
        const cleanStr = strVal.replace(/[^0-9]/g, ''); 
        return parseInt(cleanStr) || 0;
    };

    let currentExpense = null;
    let itemsBuffer = [];
    let count = 0;

    for (const row of data) {
        if (row['Beli'] === 'Total') continue;

        if (row['Belanja ke'] && row['Belanja ke'].toString().trim() !== '') {
            if (currentExpense && itemsBuffer.length > 0) {
                await saveFullExpense(currentExpense, itemsBuffer);
                count++;
            }
            currentExpense = {
                yieldEstimate: cleanNumber(row['Bungkus']),
                date: new Date(), 
            };
            itemsBuffer = [];
        }

        if (row['Beli']) {
            itemsBuffer.push({
                name: row['Beli'],
                quantity: row['Quantity'],
                price: cleanNumber(row['Harga'])
            });
        }
    }

    if (currentExpense && itemsBuffer.length > 0) {
        await saveFullExpense(currentExpense, itemsBuffer);
        count++;
    }

    await HistoryLog.create({ action: `Import Excel: ${count} Nota Belanja`, type: 'EXPENSE' });
    res.json({ success: true, message: `Sukses import ${count} nota` });

  } catch (error) {
    console.error("ERROR IMPORT EXPENSE:", error);
    res.status(500).json({ error: error.message });
  }
});

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

// --- RESET DATA (DEV) ---
app.delete('/api/orders/reset/all', auth, async (req, res) => {
  try {
    await Order.destroy({ where: {}, truncate: true, cascade: true });
    await HistoryLog.destroy({ where: { type: 'ORDER' } });
    res.json({ success: true, message: "Semua Data Order & History BERSIH!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expenses/reset/all', auth, async (req, res) => {
  try {
    await Expense.destroy({ where: {}, truncate: true, cascade: true });
    await HistoryLog.destroy({ where: { type: 'EXPENSE' } });
    res.json({ success: true, message: "Semua Data Belanja & History BERSIH!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 8. NOTIFICATIONS ENDPOINT (Get & Delete)
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const logs = await HistoryLog.findAll({ 
      limit: 50, 
      order: [['createdAt', 'DESC']] 
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [BARU] Endpoint Delete Notif
app.delete('/api/notifications/:id', auth, async (req, res) => {
    try {
        await HistoryLog.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
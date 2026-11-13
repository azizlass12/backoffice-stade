require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Database Connection with graceful fallback
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas successfully.'))
    .catch(err => console.log('⚠️ MongoDB connection notice:', err.message));
} else {
  console.log('ℹ️ MONGODB_URI not provided; running in in-memory catalog mode.');
}

// Catalog Data for Spider Tech (Starts clean/empty, populated by your real data/database)
const productsCatalog = [];

// In-Memory Orders
const orders = [];

// REST API Endpoints
// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'Spider Tech API by Zaydoun',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Products Routes
app.get('/api/products', (req, res) => {
  let list = [...productsCatalog];
  const { category, brand, search, maxPrice } = req.query;

  if (category && category !== 'all') {
    list = list.filter(p => 
      p.category.toLowerCase() === category.toLowerCase() ||
      p.subCategory?.toLowerCase() === category.toLowerCase()
    );
  }
  if (brand) {
    list = list.filter(p => p.brand.toLowerCase() === brand.toLowerCase());
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(s) || p.description.toLowerCase().includes(s));
  }
  if (maxPrice) {
    list = list.filter(p => p.price <= parseFloat(maxPrice));
  }

  res.json({ success: true, count: list.length, data: list });
});

app.get('/api/products/:id', (req, res) => {
  const p = productsCatalog.find(item => item.id === req.params.id);
  if (!p) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }
  res.json({ success: true, data: p });
});

app.post('/api/products', (req, res) => {
  const { title, price, originalPrice, category, brand, description, stockCount, imageUrl, specs } = req.body;
  if (!title || price === undefined || price === null) {
    return res.status(400).json({ success: false, error: 'Title and price are required' });
  }

  const stock = stockCount !== undefined ? parseInt(stockCount, 10) : 10;
  const newProduct = {
    id: 'prod-' + Date.now(),
    title,
    price: parseFloat(price),
    originalPrice: originalPrice ? parseFloat(originalPrice) : parseFloat(price),
    category: category || 'Laptops',
    brand: brand || 'Spider Tech',
    description: description || '',
    inStock: stock > 0,
    stockCount: Math.max(0, stock),
    rating: 5.0,
    reviewCount: 1,
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=800&q=80',
    specs: specs || {}
  };

  productsCatalog.unshift(newProduct);
  io.emit('productAdded', newProduct);

  res.status(201).json({ success: true, data: newProduct });
});

// Update product (Stock / Price / Details)
app.put('/api/products/:id', (req, res) => {
  const idx = productsCatalog.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const existing = productsCatalog[idx];
  const { title, price, originalPrice, category, brand, description, stockCount, inStock, imageUrl, specs } = req.body;

  if (title !== undefined) existing.title = title;
  if (price !== undefined) existing.price = parseFloat(price);
  if (originalPrice !== undefined) existing.originalPrice = parseFloat(originalPrice);
  if (category !== undefined) existing.category = category;
  if (brand !== undefined) existing.brand = brand;
  if (description !== undefined) existing.description = description;
  if (imageUrl !== undefined) existing.imageUrl = imageUrl;
  if (specs !== undefined) existing.specs = { ...existing.specs, ...specs };

  if (stockCount !== undefined) {
    existing.stockCount = Math.max(0, parseInt(stockCount, 10));
    existing.inStock = existing.stockCount > 0;
  } else if (inStock !== undefined) {
    existing.inStock = Boolean(inStock);
    if (!existing.inStock) existing.stockCount = 0;
    else if (existing.stockCount === 0) existing.stockCount = 1;
  }

  io.emit('productUpdated', existing);
  res.json({ success: true, data: existing });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  const idx = productsCatalog.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const deleted = productsCatalog.splice(idx, 1)[0];
  io.emit('productDeleted', { id: req.params.id });
  res.json({ success: true, message: 'Product deleted', data: deleted });
});

// Auth Routes (Supporting the 3 demo accounts)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const validUsers = [
    { email: 'admin-demo@example.com', pass: 'DemoAdmin123!', role: 'admin', username: 'demo_admin' },
    { email: 'seller-demo@example.com', pass: 'DemoSeller123!', role: 'seller', username: 'demo_seller' },
    { email: 'customer-demo@example.com', pass: 'DemoCustomer123!', role: 'customer', username: 'demo_customer' }
  ];

  const match = validUsers.find(u => u.email.toLowerCase() === email?.toLowerCase() && u.pass === password);

  if (match) {
    return res.json({
      success: true,
      token: 'jwt-mock-spider-tech-' + Buffer.from(match.email).toString('base64'),
      user: {
        id: 'usr-' + match.role,
        username: match.username,
        email: match.email,
        role: match.role
      }
    });
  }

  // Allow test credentials
  if (email && password && password.length >= 6) {
    return res.json({
      success: true,
      token: 'jwt-mock-spider-tech-dynamic',
      user: {
        id: 'usr-' + Date.now(),
        username: email.split('@')[0],
        email: email,
        role: 'customer'
      }
    });
  }

  res.status(401).json({ success: false, error: 'Invalid email or password' });
});

// Orders Route
app.post('/api/orders', (req, res) => {
  const { items, totalAmount, shippingAddress } = req.body;
  const order = {
    id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
    items: items || [],
    totalAmount: totalAmount || 0,
    shippingAddress: shippingAddress || 'Standard Delivery',
    status: 'Confirmed',
    createdAt: new Date().toISOString()
  };

  orders.unshift(order);
  io.emit('orderCreated', order);

  res.status(201).json({ success: true, data: order });
});

// =========================================================================
// Spider Tech ERP & Management System Endpoints
// =========================================================================
const erpSales = [];
const erpRepairs = [];
const erpClients = [];
const erpSuppliers = [];
let erpCashSession = {
  id: 'cs-init',
  openedAt: new Date().toISOString(),
  openedBy: 'Zaydoun Admin',
  initialCash: 350,
  currentCash: 350,
  expectedCash: 350,
  status: 'open',
  transactions: []
};

// ERP Sales
app.get('/api/erp/sales', (req, res) => {
  res.json({ success: true, count: erpSales.length, data: erpSales });
});

app.post('/api/erp/sales', (req, res) => {
  const sale = {
    id: 'sale-' + Date.now(),
    invoiceNumber: req.body.invoiceNumber || 'FAC-' + Date.now(),
    date: new Date().toISOString(),
    ...req.body
  };
  erpSales.unshift(sale);
  io.emit('erpSaleCreated', sale);
  res.status(201).json({ success: true, data: sale });
});

// ERP Repairs
app.get('/api/erp/repairs', (req, res) => {
  res.json({ success: true, count: erpRepairs.length, data: erpRepairs });
});

app.post('/api/erp/repairs', (req, res) => {
  const repair = {
    id: 'rep-' + Date.now(),
    ticketNumber: req.body.ticketNumber || 'SAV-' + Date.now(),
    dateReceived: new Date().toISOString(),
    status: 'received',
    ...req.body
  };
  erpRepairs.unshift(repair);
  io.emit('erpRepairCreated', repair);
  res.status(201).json({ success: true, data: repair });
});

app.put('/api/erp/repairs/:id', (req, res) => {
  const idx = erpRepairs.findIndex(r => r.id === req.params.id);
  if (idx !== -1) {
    erpRepairs[idx] = { ...erpRepairs[idx], ...req.body };
    io.emit('erpRepairUpdated', erpRepairs[idx]);
    return res.json({ success: true, data: erpRepairs[idx] });
  }
  res.status(404).json({ success: false, error: 'Ticket de réparation non trouvé' });
});

// ERP Clients
app.get('/api/erp/clients', (req, res) => {
  res.json({ success: true, count: erpClients.length, data: erpClients });
});

app.post('/api/erp/clients', (req, res) => {
  const client = {
    id: 'cli-' + Date.now(),
    createdAt: new Date().toISOString(),
    ...req.body
  };
  erpClients.unshift(client);
  res.status(201).json({ success: true, data: client });
});

// ERP Suppliers
app.get('/api/erp/suppliers', (req, res) => {
  res.json({ success: true, count: erpSuppliers.length, data: erpSuppliers });
});

app.post('/api/erp/suppliers', (req, res) => {
  const supplier = {
    id: 'sup-' + Date.now(),
    createdAt: new Date().toISOString(),
    ...req.body
  };
  erpSuppliers.unshift(supplier);
  res.status(201).json({ success: true, data: supplier });
});

// ERP Supplier Invoices
const erpSupplierInvoices = [];
app.get('/api/erp/invoices', (req, res) => {
  res.json({ success: true, count: erpSupplierInvoices.length, data: erpSupplierInvoices });
});

app.post('/api/erp/invoices', (req, res) => {
  const inv = {
    id: 'inv-sup-' + Date.now(),
    createdAt: new Date().toISOString(),
    ...req.body
  };
  erpSupplierInvoices.unshift(inv);
  res.status(201).json({ success: true, data: inv });
});

// ERP Cash Session
app.get('/api/erp/cash', (req, res) => {
  res.json({ success: true, data: erpCashSession });
});

app.post('/api/erp/cash/movement', (req, res) => {
  const tx = {
    id: 'tx-' + Date.now(),
    time: new Date().toISOString(),
    ...req.body
  };
  erpCashSession.transactions = [tx, ...(erpCashSession.transactions || [])];
  if (tx.type === 'in') erpCashSession.currentCash += (Number(tx.amount) || 0);
  else if (tx.type === 'out') erpCashSession.currentCash -= (Number(tx.amount) || 0);
  io.emit('erpCashUpdated', erpCashSession);
  res.json({ success: true, data: erpCashSession });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Socket client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Spider Tech API Server running on port ${PORT}`);
});

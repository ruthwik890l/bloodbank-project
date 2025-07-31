require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Schemas

const donorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  bloodType: { type: String, required: true, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  address: { type: String, required: true },
  lastDonation: { type: Date }
}, { timestamps: true });

const inventorySchema = new mongoose.Schema({
  bloodType: { type: String, required: true, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  collectionDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  status: { type: String, enum: ['Available', 'Used', 'Expired'], default: 'Available' }
}, { timestamps: true });

const requestSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  bloodType: { type: String, required: true, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  unitsNeeded: { type: Number, required: true, min: 1 },
  hospital: { type: String, required: true },
  priority: { type: String, required: true, enum: ['Low', 'Medium', 'High', 'Critical'] },
  status: { type: String, enum: ['Pending', 'Fulfilled', 'Cancelled'], default: 'Pending' }
}, { timestamps: true });

const Donor = mongoose.model('Donor', donorSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Request = mongoose.model('Request', requestSchema);

// Routes

// Donors
app.get('/api/donors', async (req, res) => {
  try {
    const donors = await Donor.find().sort({ createdAt: -1 });
    res.json(donors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch donors' });
  }
});

app.post('/api/donors', async (req, res) => {
  try {
    const donor = new Donor(req.body);
    await donor.save();
    res.json({ success: true, donor });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/donors/:id', async (req, res) => {
  try {
    await Donor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(400).json({ success: false, error: 'Failed to delete donor' });
  }
});

// Inventory
app.get('/api/inventory', async (req, res) => {
  try {
    const inventory = await Inventory.find().sort({ collectionDate: -1 });
    res.json(inventory);
  } catch {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const { donorId, bloodType, collectionDate } = req.body;

    if (!donorId || !bloodType || !collectionDate) {
      return res.status(400).json({ success: false, error: 'donorId, bloodType and collectionDate are required' });
    }

    const expiryDate = new Date(collectionDate);
    expiryDate.setDate(expiryDate.getDate() + 42); // Blood expires in 42 days

    const newUnit = new Inventory({
      donorId,
      bloodType,
      collectionDate: new Date(collectionDate),
      expiryDate,
      status: 'Available'
    });

    await newUnit.save();

    // Update donor's last donation date
    await Donor.findByIdAndUpdate(donorId, { lastDonation: collectionDate });

    res.json({ success: true, inventory: newUnit });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(400).json({ success: false, error: 'Failed to delete blood unit' });
  }
});

// Requests
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = new Request(req.body);
    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/requests/:id', async (req, res) => {
  try {
    const allowedUpdates = ['status', 'priority', 'unitsNeeded', 'patientName', 'hospital', 'bloodType'];
    const updates = Object.keys(req.body);

    const isValidOperation = updates.every(update => allowedUpdates.includes(update));
    if (!isValidOperation) return res.status(400).json({ error: 'Invalid update fields' });

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    updates.forEach(update => request[update] = req.body[update]);
    await request.save();

    res.json({ success: true, request });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/requests/:id', async (req, res) => {
  try {
    await Request.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(400).json({ success: false, error: 'Failed to delete request' });
  }
});

// Catch-all handler: send back React's index.html file for any non-API routes
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`HealWithBlood backend running on port ${PORT}`);
});

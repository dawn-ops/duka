/**
 * DukaSmart Backend Server
 * - Firebase Firestore (database)
 * - M-Pesa Daraja STK Push
 * - REST API for frontend
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Firebase Init ─────────────────────────────────────────────────────────
let db;
try {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log('✅ Firebase connected');
} catch (err) {
  console.error('❌ Firebase init failed. Make sure firebase-service-account.json exists.');
  console.error(err.message);
  process.exit(1);
}

// ─── M-Pesa Helpers ─────────────────────────────────────────────────────────
const MPESA = {
  CONSUMER_KEY:    process.env.MPESA_CONSUMER_KEY,
  CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
  SHORTCODE:       process.env.MPESA_SHORTCODE,       // Paybill or Till
  PASSKEY:         process.env.MPESA_PASSKEY,
  CALLBACK_URL:    process.env.MPESA_CALLBACK_URL,    // Your public URL + /api/mpesa/callback
  ENV:             process.env.MPESA_ENV || 'sandbox', // 'sandbox' | 'production'
};

const mpesaBaseURL = MPESA.ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getMpesaToken() {
  const creds = Buffer.from(`${MPESA.CONSUMER_KEY}:${MPESA.CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(`${mpesaBaseURL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` }
  });
  return res.data.access_token;
}

function getMpesaTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function getMpesaPassword(timestamp) {
  const raw = `${MPESA.SHORTCODE}${MPESA.PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

// ─── API: Entries (Purchase Records) ─────────────────────────────────────────

// GET all entries
app.get('/api/entries', async (req, res) => {
  try {
    const snap = await db.collection('entries').orderBy('createdAt', 'desc').get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new entry
app.post('/api/entries', async (req, res) => {
  try {
    const data = { ...req.body, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    const ref = await db.collection('entries').add(data);
    res.json({ id: ref.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE entry
app.delete('/api/entries/:id', async (req, res) => {
  try {
    await db.collection('entries').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Config (Store Settings) ────────────────────────────────────────────

app.get('/api/config', async (req, res) => {
  try {
    const doc = await db.collection('config').doc('store').get();
    res.json(doc.exists ? doc.data() : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    await db.collection('config').doc('store').set(req.body, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: M-Pesa STK Push ────────────────────────────────────────────────────

/**
 * POST /api/mpesa/pay
 * Body: { phone, amount, entryRef }
 * - phone: Kenyan number, e.g. "0712345678" or "254712345678"
 * - amount: integer KES amount
 * - entryRef: optional reference string
 */
app.post('/api/mpesa/pay', async (req, res) => {
  try {
    let { phone, amount, entryRef } = req.body;

    // Normalize phone: strip leading 0 and add 254
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    phone = String(phone).replace(/\s+/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (!phone.startsWith('254')) phone = '254' + phone;

    amount = Math.ceil(Number(amount));
    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });

    const token = await getMpesaToken();
    const timestamp = getMpesaTimestamp();
    const password = getMpesaPassword(timestamp);

    const stkBody = {
      BusinessShortCode: MPESA.SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline', // or 'CustomerPayBillOnline' for Paybill
      Amount: amount,
      PartyA: phone,
      PartyB: MPESA.SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: MPESA.CALLBACK_URL,
      AccountReference: entryRef || 'DukaSmart',
      TransactionDesc: `DukaSmart purchase - KES ${amount}`,
    };

    const stkRes = await axios.post(
      `${mpesaBaseURL}/mpesa/stkpush/v1/processrequest`,
      stkBody,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Save pending transaction to Firestore
    const checkoutId = stkRes.data.CheckoutRequestID;
    await db.collection('mpesa_transactions').doc(checkoutId).set({
      checkoutRequestId: checkoutId,
      phone,
      amount,
      entryRef: entryRef || null,
      status: 'pending',
      merchantRequestId: stkRes.data.MerchantRequestID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      checkoutRequestId: checkoutId,
      message: 'STK Push sent — check your phone'
    });

  } catch (err) {
    console.error('M-Pesa STK Push error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.errorMessage || err.message });
  }
});

/**
 * POST /api/mpesa/callback
 * Safaricom calls this URL after the customer confirms/rejects payment
 */
app.post('/api/mpesa/callback', async (req, res) => {
  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) return res.json({ ResultCode: 0, ResultDesc: 'ok' });

    const checkoutId = body.CheckoutRequestID;
    const resultCode = body.ResultCode; // 0 = success

    const update = {
      status: resultCode === 0 ? 'success' : 'failed',
      resultCode,
      resultDesc: body.ResultDesc,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // If success, extract transaction details
    if (resultCode === 0 && body.CallbackMetadata?.Item) {
      const items = body.CallbackMetadata.Item;
      const get = (name) => items.find(i => i.Name === name)?.Value;
      update.mpesaReceiptNumber = get('MpesaReceiptNumber');
      update.transactionDate = get('TransactionDate');
      update.phoneUsed = get('PhoneNumber');
      update.amountPaid = get('Amount');
    }

    await db.collection('mpesa_transactions').doc(checkoutId).update(update);
    console.log(`M-Pesa callback: ${checkoutId} → ${update.status}`);

    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (err) {
    console.error('Callback error:', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'ok' }); // Always 200 to Safaricom
  }
});

/**
 * GET /api/mpesa/status/:checkoutRequestId
 * Frontend polls this to know if payment was confirmed
 */
app.get('/api/mpesa/status/:id', async (req, res) => {
  try {
    const doc = await db.collection('mpesa_transactions').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Transaction not found' });
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Catch-all: serve frontend ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 DukaSmart running on http://localhost:${PORT}`));

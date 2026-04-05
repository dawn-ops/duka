# DukaSmart — Full Setup Guide
## M-Pesa + Firebase + Live Deployment

---

## 📁 What's in This Package

```
dukasmart/
├── server/
│   └── index.js              ← Node.js backend (M-Pesa + Firebase)
├── public/
│   ├── index.html            ← Main app (upgraded with M-Pesa modal)
│   └── admin.html            ← Admin panel
├── package.json              ← Node dependencies
├── .env.example              ← Environment variables template
└── SETUP_GUIDE.md            ← This file
```

---

## STEP 1 — Set Up Firebase (Free Database)

Firebase gives you a real database that syncs across all devices.

### 1a. Create a Firebase Project
1. Go to **https://console.firebase.google.com**
2. Click **"Add Project"** → Name it `dukasmart` → Continue
3. Disable Google Analytics (optional) → **Create Project**

### 1b. Enable Firestore
1. In left sidebar → **Build → Firestore Database**
2. Click **"Create Database"**
3. Choose **"Start in production mode"** → Next
4. Select region: **`europe-west1`** (closest to Nairobi) → Enable

### 1c. Set Firestore Rules (allow your server)
In Firestore → **Rules** tab, replace with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false; // Server-only access via Admin SDK
    }
  }
}
```
Click **Publish**.

### 1d. Download Service Account Key
1. In Firebase Console → ⚙️ **Project Settings** (gear icon)
2. Click **"Service Accounts"** tab
3. Click **"Generate New Private Key"** → **Generate Key**
4. A JSON file downloads — **rename it to `firebase-service-account.json`**
5. Place it inside the `server/` folder:
   ```
   dukasmart/server/firebase-service-account.json
   ```
   ⚠️ **Never share or commit this file** — it's your secret key.

---

## STEP 2 — Get M-Pesa Daraja API Credentials

### 2a. Register on Safaricom Developer Portal
1. Go to **https://developer.safaricom.co.ke**
2. Click **"Sign Up"** → Create account with your phone
3. Verify your email

### 2b. Create an App (Sandbox for Testing)
1. Log in → Click **"Add New App"**
2. Name: `DukaSmart` → Tick **"Lipa Na M-Pesa Sandbox"** → Create
3. You'll see your **Consumer Key** and **Consumer Secret** — copy these

### 2c. Get Your Sandbox Passkey
1. In the portal → **APIs** → **Lipa Na M-Pesa Online**
2. Under "Test Credentials", find the **Lipa Na M-Pesa Online Passkey**
3. Copy it

### 2d. Sandbox Shortcode
- Use the test shortcode: **`174379`** (Safaricom's sandbox Paybill)

> ✅ **You can fully test M-Pesa with sandbox credentials** — no real Paybill needed yet.
> When you're ready to go live, apply for a real Paybill through your bank or Safaricom.

---

## STEP 3 — Configure Environment Variables

1. In the `dukasmart/` folder, **copy `.env.example` to `.env`**:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your values:
   ```
   MPESA_CONSUMER_KEY=your_actual_consumer_key
   MPESA_CONSUMER_SECRET=your_actual_consumer_secret
   MPESA_SHORTCODE=174379
   MPESA_PASSKEY=your_actual_passkey
   MPESA_CALLBACK_URL=https://YOUR_DOMAIN/api/mpesa/callback
   MPESA_ENV=sandbox
   ```
   (We'll fill in MPESA_CALLBACK_URL after deployment in Step 5)

---

## STEP 4 — Install & Run Locally (Testing)

### 4a. Install Node.js
- Download from **https://nodejs.org** → Install the LTS version

### 4b. Install Dependencies
Open Terminal in the `dukasmart/` folder:
```bash
npm install
```

### 4c. Run the Server
```bash
npm start
```
You should see:
```
✅ Firebase connected
🚀 DukaSmart running on http://localhost:3000
```

Open **http://localhost:3000** in your browser — the app loads!

### 4d. Test M-Pesa (Local)
To test M-Pesa callbacks locally, use **ngrok** (free tunnel):
1. Download from **https://ngrok.com** → Sign up free
2. Run: `ngrok http 3000`
3. Copy the HTTPS URL it gives you (e.g. `https://abc123.ngrok.io`)
4. Update your `.env`:
   ```
   MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/mpesa/callback
   ```
5. Restart the server

For sandbox testing, use the **Safaricom test phone**: `254708374149` and PIN `1234`.

---

## STEP 5 — Deploy Live on Render (Free Hosting)

Render gives you a free server that stays online 24/7.

### 5a. Put Code on GitHub
1. Create a free **https://github.com** account
2. Click **"New Repository"** → Name: `dukasmart` → Create
3. Upload all your `dukasmart/` files to the repo
   - **Important:** Add `firebase-service-account.json` to `.gitignore` — don't upload it!
   - Instead you'll paste its contents as an environment variable (see 5c)

### 5b. Deploy on Render
1. Go to **https://render.com** → Sign up free (use GitHub account)
2. Click **"New Web Service"**
3. Connect your GitHub → Select `dukasmart` repo
4. Settings:
   - **Name:** `dukasmart`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

### 5c. Add Environment Variables on Render
In your Render service → **Environment** tab → Add each variable:

| Key | Value |
|-----|-------|
| `MPESA_CONSUMER_KEY` | your key |
| `MPESA_CONSUMER_SECRET` | your secret |
| `MPESA_SHORTCODE` | 174379 |
| `MPESA_PASSKEY` | your passkey |
| `MPESA_ENV` | sandbox |
| `MPESA_CALLBACK_URL` | https://dukasmart.onrender.com/api/mpesa/callback |
| `FIREBASE_SERVICE_ACCOUNT` | *(paste the entire contents of firebase-service-account.json as a single line)* |

For the Firebase service account as an env var, update `server/index.js` line:
```js
// Change this line:
const serviceAccount = require('./firebase-service-account.json');

// To this:
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
```

### 5d. Deploy!
Click **"Create Web Service"** — Render builds and deploys automatically.

Your site will be live at: **`https://dukasmart.onrender.com`**

### 5e. Update Callback URL
Now update `MPESA_CALLBACK_URL` in Render's environment variables to your actual URL:
```
https://dukasmart.onrender.com/api/mpesa/callback
```

---

## STEP 6 — Apply for a Real Paybill (When Ready)

Once you're happy with testing:

### Option A — Safaricom Till Number (Buy Goods)
- Free to get via Safaricom agent or Safaricom app
- Customers pay your till directly
- Money goes to your M-Pesa account

### Option B — Paybill Number (Pay Bill)
- Apply via your bank (Equity, KCB, Co-op etc.)
- Better for businesses with account reference tracking
- Takes 2–5 business days

Once you have your real shortcode:
1. Update `MPESA_SHORTCODE` in Render environment
2. Get your **production passkey** from Safaricom Daraja portal
3. Update `MPESA_PASSKEY`
4. Change `MPESA_ENV=production`
5. Redeploy on Render

---

## 🔒 Security Checklist

- [ ] `firebase-service-account.json` is in `.gitignore` — never committed to GitHub
- [ ] `.env` file is in `.gitignore` — never committed to GitHub
- [ ] All secrets added as Render environment variables, not hardcoded
- [ ] Firestore rules deny direct client access (server-only)

---

## 💡 How M-Pesa Works in the App

1. Staff records a purchase → selects **M-Pesa** as payment
2. App asks for **customer's phone number**
3. Customer receives **STK Push** on their phone ("Enter PIN to pay KES X to DukaSmart")
4. Customer enters PIN → Payment confirmed
5. App shows ✅ and records the purchase with M-Pesa receipt number
6. All data saved to Firebase — visible on all devices

---

## 🆘 Common Issues

**"Firebase init failed"** → Check that `firebase-service-account.json` is in the `server/` folder or `FIREBASE_SERVICE_ACCOUNT` env var is set correctly.

**"M-Pesa STK Push failed"** → Double-check Consumer Key, Consumer Secret, and Passkey. Make sure MPESA_ENV matches your credentials (sandbox vs production).

**"Callback not received"** → Your MPESA_CALLBACK_URL must be a public HTTPS URL. Use ngrok for local testing. Safaricom cannot reach `localhost`.

**App shows "Offline" badge** → Server not running or wrong API URL. Data still saves locally via localStorage as backup.

---

## 📞 Support Resources

- Safaricom Daraja Docs: https://developer.safaricom.co.ke/docs
- Firebase Docs: https://firebase.google.com/docs/firestore
- Render Docs: https://render.com/docs
- ngrok: https://ngrok.com/docs

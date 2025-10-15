// api/receive-sms.js
const admin = require('firebase-admin');

function initFirebase() {
    if (admin.apps.length) return;
    const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!svc) {
        // try default credentials (useful if running on GCP)
        try {
            admin.initializeApp();
            return;
        } catch (err) {
            console.error('firebase init fallback failed', err);
        }
    }
    try {
        // SUPPORT: raw JSON or base64-encoded JSON in env var
        const json = svc.trim().startsWith('{')
            ? JSON.parse(svc)
            : JSON.parse(Buffer.from(svc, 'base64').toString('utf8'));
        admin.initializeApp({ credential: admin.credential.cert(json) });
    } catch (err) {
        console.error('Failed to initialize firebase-admin from FIREBASE_SERVICE_ACCOUNT:', err);
        try { admin.initializeApp(); } catch (e) { /* ignore */ }
    }
}

// --- 2. SMS PARSING FUNCTION (Regex) ---
// This function extracts Amount, Payee, and Date from the raw SMS text.
function parseSms(smsText) {
    // Regex optimized for: Sent Rs.15.00 ... To NEW PEOPLES MART ... On 13/10/25
    // Captures: Amount (1), Payee (2), Date (3)
    // /Rs\.?([\d,]+\.\d{2})/s : Finds Rs. and the decimal number (captures group 1)
    // /.*?To\s(.*?)/s : Finds 'To ' and captures everything until the next label (captures group 2)
    // /\s*?On\s(\d{2}\/\d{2}\/\d{2})/s : Finds 'On ' and captures the date (captures group 3)
    const regex = /Rs\.?([\d,]+\.\d{2}).*?To\s(.*?)\s*?On\s(\d{2}\/\d{2}\/\d{2})/si;
    const match = smsText.match(regex);

    if (match) {
        // Remove commas from amount before converting to number
        const cleanAmount = match[1].replace(/,/g, ''); 
        return {
            amount: parseFloat(cleanAmount),
            payee: match[2].trim(),
            date_extracted: match[3]
        };
    }
    return null; // Return null if parsing fails
}


// --- 3. VERSEL API HANDLER (Main Endpoint) ---
module.exports = async (req, res) => {
    initFirebase();

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // Accept JSON and urlencoded bodies (Vercel will parse JSON automatically)
        const payload = {
            from: req.body?.from || req.query?.from || null,
            to: req.body?.to || req.query?.to || null,
            text: req.body?.body || req.body?.text || req.query?.body || null,
            receivedAt: new Date().toISOString()
        };

        // If Firestore available store, otherwise return payload
        if (admin.firestore) {
            const db = admin.firestore();
            const doc = await db.collection('sms').add(payload);
            return res.status(200).json({ ok: true, id: doc.id });
        }

        return res.status(200).json({ ok: true, payload });
    } catch (err) {
        console.error('receive-sms error:', err);
        return res.status(500).json({ error: 'internal_error' });
    }
};
// api/receive-sms.js
const admin = require('firebase-admin');

function initFirebase() {
    if (admin.apps.length) return;
    const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!svc) {
        try {
            admin.initializeApp();
            return;
        } catch (err) {
            console.error('firebase init fallback failed', err);
        }
    }
    try {
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
    const regex = /Rs\.?([\d,]+\.\d{2}).*?To\s(.*?)\s*?On\s(\d{2}\/\d{2}\/\d{2})/si;
    const match = smsText.match(regex);

    if (match) {
        const cleanAmount = match[1].replace(/,/g, ''); 
        return {
            amount: parseFloat(cleanAmount),
            payee: match[2].trim(),
            date_extracted: match[3]
        };
    }
    return null;
}


// --- 3. VERSEL API HANDLER (Main Endpoint) ---
module.exports = async (req, res) => {
    initFirebase();

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const textContent = req.body?.body || req.body?.text || req.query?.body || '';
        const parsed = parseSms(textContent);

        const payload = {
            from: req.body?.from || req.query?.from || null,
            to: req.body?.to || req.query?.to || null,
            text: textContent || null,
            parsed: parsed, // include parsed object (null if parse failed)
            receivedAt: new Date().toISOString()
        };

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
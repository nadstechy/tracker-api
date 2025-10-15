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

// simple SMS parser: adjust regex as needed for your SMS format
function parseSms(smsText = '') {
    if (!smsText) return null;
    // Example: "Your A/c XXXX debited by Rs.1,200.00 To MERCHANT On 12/10/25"
    const regex = /Rs\.?\s*([\d,]+(?:\.\d{1,2})?).*?To\s(.*?)\s*On\s(\d{1,2}\/\d{1,2}\/\d{2,4})/si;
    const match = smsText.match(regex);
    if (match) {
        const cleanAmount = match[1].replace(/,/g, '');
        return {
            amount: Number(cleanAmount),
            payee: match[2].trim(),
            date_extracted: match[3].trim()
        };
    }
    return null;
}

module.exports = async (req, res) => {
    initFirebase();

    // Optional API_KEY protection
    const expectedKey = process.env.API_KEY;
    const provided = req.headers['x-api-key'] || req.query?.api_key;
    if (expectedKey && provided !== expectedKey) {
        return res.status(401).json({ error: 'invalid_api_key' });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // Accept JSON body or form data. Vercel parses JSON automatically.
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        const textContent = (body.body || body.text || req.query?.body || '').toString();
        const parsed = parseSms(textContent);

        const payload = {
            from: body.from || req.query?.from || null,
            to: body.to || req.query?.to || null,
            text: textContent || null,
            parsed: parsed,
            receivedAt: new Date().toISOString(),
            raw: body
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
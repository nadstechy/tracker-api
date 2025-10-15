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

module.exports = async (req, res) => {
    initFirebase();

    // Optional API_KEY protection for listing
    const expectedKey = process.env.API_KEY;
    const provided = req.headers['x-api-key'] || req.query?.api_key;
    if (expectedKey && provided !== expectedKey) {
        return res.status(401).json({ error: 'invalid_api_key' });
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // Try to read from Firestore
        if (admin.firestore) {
            const db = admin.firestore();
            const limit = Math.min(200, Number(req.query.limit) || 100);
            const snap = await db.collection('sms').orderBy('receivedAt', 'desc').limit(limit).get();
            const items = [];
            snap.forEach(doc => {
                const data = doc.data() || {};
                items.push({
                    id: doc.id,
                    from: data.from || null,
                    to: data.to || null,
                    text: data.text || null,
                    parsed: data.parsed || null,
                    receivedAt: data.receivedAt || null,
                    timestamp: data.receivedAt || (doc.createTime ? doc.createTime.toDate().toISOString() : null),
                    raw: data.raw || null
                });
            });

            if (items.length > 0) {
                return res.status(200).json({ ok: true, items });
            }
        }

        // If Firestore not available or no records, return a dummy sample item for testing
        const now = new Date().toISOString();
        const dummy = {
            id: 'sample-1',
            from: '+1000000000',
            to: '+1999999999',
            text: 'Sample SMS text for testing',
            parsed: {
                amount: 15.00,
                payee: 'Sample Payee',
                date_extracted: '01/01/25'
            },
            receivedAt: now,
            timestamp: now,
            raw: {}
        };
        return res.status(200).json({ ok: true, items: [dummy], note: 'dummy_returned' });
    } catch (err) {
        console.error('list-sms error:', err);
        return res.status(500).json({ error: 'internal_error' });
    }
};
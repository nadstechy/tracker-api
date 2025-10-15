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

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).send('Method Not Allowed');
    }

    try {
        if (!admin.firestore) {
            return res.status(500).json({ error: 'firestore_unavailable' });
        }
        const db = admin.firestore();
        const snap = await db.collection('sms')
            .orderBy('receivedAt', 'desc')
            .limit(50)
            .get();

        const items = [];
        snap.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });

        return res.status(200).json({ ok: true, items });
    } catch (err) {
        console.error('list-sms error:', err);
        return res.status(500).json({ error: 'internal_error' });
    }
};
// api/receive-sms.js
const admin = require('firebase-admin');

// --- 1. FIREBASE INITIALIZATION ---
// Initialize the Firebase Admin SDK using the securely stored environment variable.
let db;
if (!admin.apps.length) {
    try {
        // The process.env.FIREBASE_SERVICE_ACCOUNT_KEY holds the full JSON string.
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY); 

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
    } catch (error) {
        console.error("Firebase initialization failed. Check FIREBASE_SERVICE_ACCOUNT_KEY.", error);
        // Ensure a response is sent if initialization fails
        db = null; 
    }
} else {
    db = admin.firestore();
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
export default async (req, res) => {
    // Basic validation
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed. Use POST.');
    }
    if (!db) {
         return res.status(503).json({ success: false, error: 'Database service unavailable.' });
    }

    // Expecting payload: { "message": "...", "sender": "..." } from iPhone Shortcut
    const rawSms = req.body.message; 
    
    if (!rawSms) {
        return res.status(400).send('Missing "message" in request body from shortcut.');
    }

    try {
        const extractedData = parseSms(rawSms);

        if (extractedData) {
            // Build the final document to store
            const dataToStore = {
                ...extractedData, 
                raw_sms: rawSms.trim(),
                sender: req.body.sender || 'Unknown', 
                // Use the server timestamp for accurate chronological sorting
                timestamp: admin.firestore.FieldValue.serverTimestamp() 
            };

            // Write to the 'sms_logs' collection
            await db.collection('sms_logs').add(dataToStore);

            return res.status(200).json({ success: true, message: 'SMS logged and parsed successfully' });
        } else {
            // Log the unparsed SMS for review if the format didn't match
            await db.collection('sms_logs').add({
                 raw_sms: rawSms.trim(),
                 sender: req.body.sender || 'Unknown',
                 parse_status: 'FAILED',
                 timestamp: admin.firestore.FieldValue.serverTimestamp()
             });
            return res.status(202).json({ success: false, message: 'SMS received but format was unparsable, logged raw.' });
        }
    } catch (error) {
        console.error('API Execution Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error during database operation.' });
    }
};
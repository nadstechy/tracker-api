const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.receiveSms = functions.https.onRequest((req, res) => {
    const smsData = req.body;

    // Process the incoming SMS data
    console.log('Received SMS:', smsData);

    // Respond to the request
    res.status(200).send('SMS received successfully');
});
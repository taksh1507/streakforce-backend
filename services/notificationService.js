const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * Path to the Firebase Service Account JSON file.
 * Ensure you download this from the Firebase Console (Project Settings -> Service Accounts)
 * and place it in the streakforce-backend/config/ directory.
 */
const serviceAccountDir = path.join(__dirname, '../config/');

let messaging;

try {
  let serviceAccount;

  // 1. Check for Environment Variable (Best for Cloud like Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('[PUSH] Firebase Admin initializing via ENV variable.');
    } catch (e) {
      console.error('[PUSH] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    }
  }

  // 2. Fallback to Local Config Directory
  if (!serviceAccount && fs.existsSync(serviceAccountDir)) {
    const files = fs.readdirSync(serviceAccountDir);
    const keyFile = files.find(f => f.endsWith('.json'));

    if (keyFile) {
      serviceAccount = require(path.join(serviceAccountDir, keyFile));
      console.log(`[PUSH] Firebase Admin initializing via Local File: ${keyFile}`);
    }
  }

  // 3. Complete Initialization
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    messaging = admin.messaging();
    console.log('[PUSH] Firebase Admin successfully started.');
  } else {
    console.warn('[PUSH] No Firebase credentials found (ENV or Local). Push notifications disabled.');
  }
} catch (error) {
  console.error('[PUSH] Exception during Firebase Admin initialization:', error.message);
}

/**
 * Send a push notification to a specific device.
 */
async function sendNotification(token, title, body) {
  if (!messaging || !token) return;

  try {
    const message = {
      notification: { title, body },
      token: token,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          color: '#55ADAD'
        }
      }
    };

    const response = await messaging.send(message);
    console.log('[PUSH] Notification sent successfully:', response);
  } catch (error) {
    console.error('[PUSH] Error sending notification:', error.message);
  }
}

module.exports = {
  sendNotification
};

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
  const files = fs.readdirSync(serviceAccountDir);
  const keyFile = files.find(f => f.endsWith('.json'));

  if (keyFile) {
    const serviceAccount = require(path.join(serviceAccountDir, keyFile));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    messaging = admin.messaging();
    console.log(`[PUSH] Firebase Admin initialized with: ${keyFile}`);
  } else {
    console.warn('[PUSH] No firebase key found in config/. Push notifications disabled.');
  }
} catch (error) {
  console.error('[PUSH] Failed to initialize Firebase Admin:', error.message);
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

// server.js - Complete Baileys WhatsApp Service with Web QR
const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let isReady = false;
let isInitializing = false;
let qrCodeData = null;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Ensure auth directory exists
const authDir = path.join(__dirname, 'auth_info');
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

console.log('╔═══════════════════════════════════════════════════╗');
console.log('║   🚀 Expirel WhatsApp Service (Baileys)          ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

// Initialize Baileys WhatsApp
async function initializeWhatsApp() {
    if (isInitializing) {
        console.log('⏳ Already initializing...');
        return;
    }

    if (sock && isReady) {
        console.log('✅ Already initialized');
        return;
    }

    isInitializing = true;
    qrCodeData = null;

    try {
        console.log('🤖 Initializing Baileys WhatsApp...');
        console.log('📁 Auth directory:', authDir);

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            browser: ['Expirel', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            printQRInTerminal: false, // Disabled - we'll handle QR ourselves
        });

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Handle QR code
            if (qr) {
                console.log('\n📱 QR Code generated!');
                console.log('🌐 View QR: http://localhost:' + (process.env.PORT || 3001) + '/qr\n');

                try {
                    // Generate QR code as base64 image
                    qrCodeData = await qrcode.toDataURL(qr);
                    console.log('✅ QR code ready for scanning\n');
                } catch (err) {
                    console.error('❌ Error generating QR:', err);
                }
            }

            // Connection opened
            if (connection === 'open') {
                isReady = true;
                isInitializing = false;
                qrCodeData = null;
                connectionAttempts = 0;

                console.log('\n╔═══════════════════════════════════════════════════╗');
                console.log('║   ✅ WHATSAPP CONNECTED SUCCESSFULLY!             ║');
                console.log('╚═══════════════════════════════════════════════════╝\n');
                console.log('💚 Ready to send messages');
                console.log('📱 Service is now live\n');
            }

            // Connection closed
            if (connection === 'close') {
                isReady = false;
                isInitializing = false;
                qrCodeData = null;

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error;

                console.log('\n⚠️ Connection closed');
                console.log('   Reason:', reason || 'Unknown');
                console.log('   Status Code:', statusCode);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('\n❌ Device logged out - Clearing auth data');
                    console.log('   You need to scan QR code again\n');

                    // Clear auth data
                    if (fs.existsSync(authDir)) {
                        fs.rmSync(authDir, { recursive: true, force: true });
                        fs.mkdirSync(authDir, { recursive: true });
                    }

                    // Wait 5 seconds then reinitialize
                    setTimeout(() => {
                        console.log('🔄 Reinitializing for new QR code...\n');
                        initializeWhatsApp();
                    }, 5000);

                } else if (statusCode === DisconnectReason.restartRequired) {
                    console.log('🔄 Restart required, reconnecting...\n');
                    setTimeout(() => initializeWhatsApp(), 3000);

                } else if (statusCode === DisconnectReason.timedOut) {
                    console.log('⏱️ Connection timed out, retrying...\n');

                    if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
                        connectionAttempts++;
                        console.log(`   Attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS}\n`);
                        setTimeout(() => initializeWhatsApp(), 5000);
                    } else {
                        console.log('❌ Max reconnection attempts reached');
                        console.log('   Please restart the service or check your connection\n');
                        connectionAttempts = 0;
                    }

                } else {
                    console.log('🔄 Reconnecting...\n');
                    setTimeout(() => initializeWhatsApp(), 5000);
                }
            }
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages (optional)
        sock.ev.on('messages.upsert', ({ messages }) => {
            const message = messages[0];
            if (!message.key.fromMe && message.message) {
                console.log('📨 Received:', message.key.remoteJid);
            }
        });

        console.log('⏳ Waiting for connection...\n');

    } catch (error) {
        console.error('❌ Error initializing WhatsApp:', error.message);
        isReady = false;
        isInitializing = false;
        qrCodeData = null;

        // Retry after 30 seconds
        setTimeout(() => {
            console.log('🔄 Retrying initialization in 30 seconds...\n');
            initializeWhatsApp();
        }, 30000);
    }
}

// Keep connection alive
setInterval(async () => {
    try {
        if (sock && isReady) {
            await sock.sendPresenceUpdate('available');
            console.log('💚 Heartbeat - ' + new Date().toLocaleTimeString());
        }
    } catch (error) {
        console.error('⚠️ Heartbeat failed:', error.message);
    }
}, 300000); // Every 5 minutes

// Format phone number
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('92')) {
        cleaned = '92' + cleaned;
    }
    return `${cleaned}@s.whatsapp.net`;
}

// Format expiry message
function formatExpiryMessage(data) {
    const expiryDate = new Date(data.expiry_date);
    const formattedDate = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let expiryStatus = '';
    if (data.days_until_expiry === 0) {
        expiryStatus = '*expires TODAY* ⏰';
    } else if (data.days_until_expiry === 1) {
        expiryStatus = '*expires TOMORROW* ⚠️';
    } else {
        expiryStatus = `*expires in ${data.days_until_expiry} days*`;
    }

    const urgencyEmoji = data.days_until_expiry <= 3 ? '🚨' : '⏰';
    const category = data.product_category
        ? `\n📦 *Category:* ${data.product_category}`
        : '';

    const tip = data.days_until_expiry <= 3
        ? '⚠️ *URGENT:* Please use this item soon to avoid waste!'
        : '💡 *Tip:* Plan to use this item in the coming days.';

    // FIX: Put URL on its own line without any formatting before/after it
    return `${urgencyEmoji} *EXPIRY REMINDER*

🏷️ *Product:* ${data.product_name}${category}
📅 *Expiry Date:* ${formattedDate}
⏳ *Status:* ${expiryStatus}

${tip}

━━━━━━━━━━━━━━━━

_Expirel - Smart expiry tracking made simple_

📱 *Manage your expiry alerts:*

https://expirel.com
`;
}
// ============== ROUTES ==============

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Expirel WhatsApp Service</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 500px;
                    width: 100%;
                    text-align: center;
                }
                h1 { color: #333; margin: 0 0 10px 0; }
                .status {
                    display: inline-block;
                    padding: 10px 20px;
                    border-radius: 20px;
                    font-weight: bold;
                    margin: 20px 0;
                }
                .status.ready { background: #d4edda; color: #155724; }
                .status.initializing { background: #fff3cd; color: #856404; }
                .status.offline { background: #f8d7da; color: #721c24; }
                .btn {
                    display: inline-block;
                    padding: 15px 30px;
                    margin: 10px;
                    background: #25D366;
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: bold;
                    transition: background 0.3s;
                }
                .btn:hover { background: #128C7E; }
                .info {
                    text-align: left;
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 Expirel WhatsApp Service</h1>
                <p style="color: #666;">Powered by Baileys</p>
                
                <div class="status ${isReady ? 'ready' : isInitializing ? 'initializing' : 'offline'}">
                    ${isReady ? '✅ Connected' : isInitializing ? '⏳ Initializing...' : '❌ Offline'}
                </div>
                
                <div>
                    <a href="/qr" class="btn">📱 View QR Code</a>
                    <a href="/status" class="btn" style="background: #667eea;">📊 Check Status</a>
                </div>
                
                <div class="info">
                    <strong>📋 Quick Links:</strong><br><br>
                    <strong>QR Code:</strong> <a href="/qr">/qr</a><br>
                    <strong>Status:</strong> <a href="/status">/status</a><br>
                    <strong>Health:</strong> <a href="/health">/health</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/qr', (req, res) => {
    if (!qrCodeData) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp QR Code</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="3">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 500px;
                    }
                    .loader {
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #667eea;
                        border-radius: 50%;
                        width: 50px;
                        height: 50px;
                        animation: spin 1s linear infinite;
                        margin: 20px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .info {
                        background: #fff3cd;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 20px;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>⏳ ${isReady ? 'Already Connected!' : 'Generating QR Code...'}</h1>
                    ${!isReady ? '<div class="loader"></div>' : ''}
                    <div class="info">
                        <strong>Status:</strong> ${isReady ? '✅ WhatsApp is connected' : isInitializing ? '⏳ Initializing connection...' : '❌ Not connected'}<br>
                        ${!isReady ? '<br><strong>Note:</strong> Page will auto-refresh every 3 seconds until QR appears.' : ''}
                    </div>
                </div>
            </body>
            </html>
        `);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Scan WhatsApp QR Code</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 600px;
                    }
                    h1 { color: #128C7E; margin-bottom: 10px; }
                    img {
                        max-width: 400px;
                        width: 100%;
                        border: 4px solid #25D366;
                        border-radius: 12px;
                        margin: 20px 0;
                    }
                    .instructions {
                        text-align: left;
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 8px;
                        margin-top: 20px;
                    }
                    .instructions ol {
                        padding-left: 20px;
                    }
                    .instructions li {
                        margin: 10px 0;
                        line-height: 1.6;
                    }
                    .warning {
                        background: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 15px;
                        margin-top: 20px;
                        border-radius: 4px;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📱 Scan QR Code</h1>
                    <p>Connect your WhatsApp Business Account</p>
                    
                    <img src="${qrCodeData}" alt="WhatsApp QR Code" />
                    
                    <div class="instructions">
                        <h3>📋 How to Connect:</h3>
                        <ol>
                            <li>Open <strong>WhatsApp</strong> on your phone</li>
                            <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                            <li>Tap <strong>"Link a Device"</strong></li>
                            <li>Scan this QR code</li>
                            <li>Wait for confirmation ✅</li>
                        </ol>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Note:</strong> QR code expires after 60 seconds. Refresh this page if expired.
                    </div>
                </div>
            </body>
            </html>
        `);
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        whatsappReady: isReady,
        isInitializing: isInitializing,
        hasQR: !!qrCodeData,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/status', async (req, res) => {
    try {
        if (!sock || !isReady) {
            return res.json({
                connected: false,
                initializing: isInitializing,
                hasQR: !!qrCodeData,
                message: isInitializing ? 'Initializing WhatsApp...' : 'WhatsApp not connected'
            });
        }

        const user = sock.authState.creds.me;

        res.json({
            connected: true,
            device: {
                phone: user?.id?.split(':')[0] || 'Unknown',
                name: user?.name || 'Business Account'
            },
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            connected: false,
            error: error.message
        });
    }
});

app.post('/send', async (req, res) => {
    try {
        if (!isReady) {
            if (!isInitializing) {
                initializeWhatsApp();
            }
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected. Please scan QR code first.',
                qrAvailable: !!qrCodeData
            });
        }

        const data = req.body;

        if (!data.phone_number) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        const phoneNumber = formatPhoneNumber(data.phone_number);
        const message = formatExpiryMessage(data);

        console.log(`📱 Sending to: ${data.phone_number}`);

        await sock.sendMessage(phoneNumber, { text: message });

        console.log(`✅ Sent to ${data.phone_number}`);

        res.json({
            success: true,
            message: 'WhatsApp notification sent',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/init', async (req, res) => {
    if (isReady) {
        return res.json({ success: true, message: 'Already connected' });
    }

    initializeWhatsApp();
    res.json({ success: true, message: 'Initialization started' });
});

// Start server
const PORT = process.env.PORT || 3002;

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open: http://localhost:${PORT}`);
    console.log(`📱 QR Code: http://localhost:${PORT}/qr\n`);

    await initializeWhatsApp();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    if (sock) await sock.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down...');
    if (sock) await sock.end();
    process.exit(0);
});
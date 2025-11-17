const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let isReady = false;
let isInitializing = false;

// Ensure auth directory exists
const authDir = path.join(__dirname, 'auth_info');
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

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

    try {
        console.log('🤖 Initializing Baileys WhatsApp...');
        console.log('📁 Auth directory:', authDir);

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }), // Reduce logs
            printQRInTerminal: true,
            auth: state,
            browser: ['Expirel Bot', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
        });

        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 Scan the QR code above to connect WhatsApp');
            }

            if (connection === 'open') {
                isReady = true;
                isInitializing = false;
                console.log('✅ WhatsApp connected successfully!');
                console.log('💚 WhatsApp ready for messages');
            }

            if (connection === 'close') {
                isReady = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('❌ Device logged out, please scan QR again');
                    // Clear auth data to force new login
                    if (fs.existsSync(authDir)) {
                        fs.rmSync(authDir, { recursive: true, force: true });
                        fs.mkdirSync(authDir, { recursive: true });
                    }
                } else {
                    console.log('⚠️ Connection closed, reconnecting...');
                    setTimeout(() => initializeWhatsApp(), 5000);
                }
            }
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages (optional - for two-way communication)
        sock.ev.on('messages.upsert', ({ messages }) => {
            const message = messages[0];
            if (!message.key.fromMe && message.message) {
                console.log('📨 Received message:', message.message);
            }
        });

        // Keep session alive - ping every 5 minutes
        setInterval(async () => {
            try {
                if (sock && isReady) {
                    await sock.sendPresenceUpdate('available');
                    console.log('💚 Session alive - ' + new Date().toLocaleTimeString());
                }
            } catch (error) {
                console.error('⚠️ Session check failed:', error.message);
                isReady = false;
                // Try to reconnect
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect...');
                    initializeWhatsApp();
                }, 10000);
            }
        }, 300000); // Every 5 minutes

    } catch (error) {
        console.error('❌ Error initializing WhatsApp:', error);
        isReady = false;
        isInitializing = false;

        // Retry after 30 seconds
        setTimeout(() => {
            console.log('🔄 Retrying initialization...');
            initializeWhatsApp();
        }, 30000);
    }
}

// Format phone number (Pakistan +92)
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('92')) {
        cleaned = '92' + cleaned;
    }
    return `${cleaned}@s.whatsapp.net`;
}

// Format expiry message (same as before)
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
        expiryStatus = `*expires in ${data.days_until_expiry} days* 📅`;
    }

    const urgencyEmoji = data.days_until_expiry <= 3 ? '🚨' : '⏰';
    const category = data.product_category
        ? `\n📦 *Category:* ${data.product_category}`
        : '';

    const tip = data.days_until_expiry <= 3
        ? '⚠️ *URGENT:* Please use this item soon to avoid waste!'
        : '💡 *Tip:* Plan to use this item in the coming days.';

    return `${urgencyEmoji} *EXPIRY REMINDER*

🏷️ *Product:* ${data.product_name}${category}
📅 *Expiry Date:* ${formattedDate}
⏳ *Status:* ${expiryStatus}

${tip}

━━━━━━━━━━━━━━━━
_Expirel - Your expiry tracking assistant_`;
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'Expirel WhatsApp Service',
        status: isReady ? 'ready' : isInitializing ? 'initializing' : 'offline',
        version: '1.0.0',
        platform: 'Render.com',
        library: 'Baileys'
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        whatsappReady: isReady,
        isInitializing: isInitializing,
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
                message: isInitializing ? 'Initializing WhatsApp...' : 'WhatsApp not connected'
            });
        }

        // Get connection info
        const user = sock.authState.creds.me;
        
        res.json({
            connected: true,
            device: {
                phone: user?.id,
                name: user?.name || 'Unknown'
            },
            uptime: process.uptime()
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
        // If not ready, try to initialize
        if (!isReady && !isInitializing) {
            console.log('⚠️ Client not ready, initializing...');
            initializeWhatsApp();
            return res.status(503).json({
                success: false,
                error: 'WhatsApp service is initializing. Please try again in 30 seconds.'
            });
        }

        if (isInitializing) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp is still initializing. Please wait...'
            });
        }

        if (!sock || !isReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp client not ready'
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

        // Send message using Baileys
        await sock.sendMessage(phoneNumber, { text: message });

        console.log(`✅ Sent successfully to ${data.phone_number}`);

        res.json({
            success: true,
            message: 'WhatsApp notification sent',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error sending WhatsApp:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manual initialization endpoint (for testing)
app.post('/init', async (req, res) => {
    try {
        if (isReady) {
            return res.json({
                success: true,
                message: 'Already initialized'
            });
        }

        initializeWhatsApp();

        res.json({
            success: true,
            message: 'Initialization started. Check logs for QR code or wait for auto-connection.'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
    console.log(`🚀 WhatsApp Service running on port ${PORT}`);
    console.log(`🌐 Platform: Render.com`);
    console.log(`📱 Library: Baileys`);
    console.log(`🔗 Initializing WhatsApp connection...`);

    // Auto-initialize on startup
    await initializeWhatsApp();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (sock) {
        await sock.end();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (sock) {
        await sock.end();
    }
    process.exit(0);
});
const express = require('express');
const venom = require('venom-bot');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

let client = null;
let isReady = false;
let isInitializing = false;

// Ensure tokens directory exists
const tokensDir = path.join(__dirname, 'tokens');
if (!fs.existsSync(tokensDir)) {
    fs.mkdirSync(tokensDir, { recursive: true });
}

// Initialize Venom-bot
async function initializeVenom() {
    if (isInitializing) {
        console.log('⏳ Already initializing...');
        return;
    }

    if (client && isReady) {
        console.log('✅ Already initialized');
        return;
    }

    isInitializing = true;

    try {
        console.log('🤖 Initializing Venom-bot...');
        console.log('📁 Tokens directory:', tokensDir);

        client = await venom.create({
            session: 'expirel-session',
            multidevice: true,
            folderNameToken: tokensDir,
            headless: true,
            useChrome: true,
            logQR: true,
            disableSpins: true,
            browserArgs: [
                '--disable-web-security',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ],
            autoClose: 0, // Don't auto-close
            disableWelcome: true
        });

        isReady = true;
        isInitializing = false;
        console.log('✅ Venom-bot initialized successfully!');
        console.log('💚 WhatsApp connected and ready');

        // Keep session alive - ping every 5 minutes
        setInterval(async () => {
            try {
                if (client) {
                    await client.getHostDevice();
                    console.log('💚 Session alive - ' + new Date().toLocaleTimeString());
                }
            } catch (error) {
                console.error('⚠️ Session check failed:', error.message);
                isReady = false;
                // Try to reconnect
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect...');
                    initializeVenom();
                }, 10000);
            }
        }, 300000); // Every 5 minutes

    } catch (error) {
        console.error('❌ Error initializing Venom-bot:', error);
        isReady = false;
        isInitializing = false;

        // Retry after 30 seconds
        setTimeout(() => {
            console.log('🔄 Retrying initialization...');
            initializeVenom();
        }, 30000);
    }
}

// Format phone number (Pakistan +92)
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('92')) {
        cleaned = '92' + cleaned;
    }
    return `${cleaned}@c.us`;
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
        platform: 'Render.com'
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
        if (!client || !isReady) {
            return res.json({
                connected: false,
                initializing: isInitializing,
                message: isInitializing ? 'Initializing WhatsApp...' : 'WhatsApp not connected'
            });
        }

        const hostDevice = await client.getHostDevice();

        res.json({
            connected: true,
            device: {
                phone: hostDevice.id.user,
                platform: hostDevice.platform
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
            initializeVenom();
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

        if (!client || !isReady) {
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

        await client.sendText(phoneNumber, message);

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

        initializeVenom();

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
    console.log(`📱 Initializing WhatsApp connection...`);

    // Auto-initialize on startup
    await initializeVenom();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});
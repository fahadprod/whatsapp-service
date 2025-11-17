// server-local.js - FOR LOCAL QR SCANNING ONLY
// Use this file ONLY for initial QR scan, then use server.js for production

const express = require('express');
const venom = require('venom-bot');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

let client = null;
let qrCodeBase64 = null;

// Ensure tokens directory exists
const tokensDir = path.join(__dirname, 'tokens');
if (!fs.existsSync(tokensDir)) {
  fs.mkdirSync(tokensDir, { recursive: true });
}

console.log('╔═══════════════════════════════════════════════════╗');
console.log('║                                                   ║');
console.log('║     🚀 WHATSAPP QR CODE SCANNER                   ║');
console.log('║     For Initial Setup Only                        ║');
console.log('║                                                   ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

console.log('📱 Starting WhatsApp initialization...');
console.log('🌐 Open your browser and go to: http://localhost:3001/qr\n');

// Initialize Venom-bot with visible browser for QR scan
async function initializeVenom() {
  try {
    console.log('🤖 Initializing Venom-bot (browser will open)...\n');

    client = await venom.create({
      session: 'expirel-session',
      multidevice: true,
      folderNameToken: tokensDir,
      headless: false, // SHOW BROWSER for QR scan
      useChrome: true,
      logQR: true,
      disableSpins: true,
      browserArgs: [
        '--disable-web-security',
        '--no-sandbox'
      ],
      autoClose: 0,
      disableWelcome: true,
      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        console.log('\n╔═══════════════════════════════════════════════════╗');
        console.log('║                                                   ║');
        console.log('║     📱 QR CODE READY!                             ║');
        console.log('║                                                   ║');
        console.log('╚═══════════════════════════════════════════════════╝\n');
        
        console.log(`📊 Attempt ${attempts} of 5\n`);
        console.log('🌐 OPEN IN BROWSER: http://localhost:3001/qr\n');
        console.log('OR scan this ASCII QR code:\n');
        console.log(asciiQR);
        console.log('\n');
        
        // Save QR as base64 for web display
        qrCodeBase64 = base64Qr;
      },
      statusFind: (statusSession, session) => {
        console.log(`\n📊 Status: ${statusSession}`);
        
        if (statusSession === 'qrReadSuccess') {
          console.log('\n╔═══════════════════════════════════════════════════╗');
          console.log('║                                                   ║');
          console.log('║     ✅ QR CODE SCANNED SUCCESSFULLY!              ║');
          console.log('║                                                   ║');
          console.log('╚═══════════════════════════════════════════════════╝\n');
          qrCodeBase64 = null;
        }
        
        if (statusSession === 'isLogged') {
          console.log('\n╔═══════════════════════════════════════════════════╗');
          console.log('║                                                   ║');
          console.log('║     🎉 WHATSAPP CONNECTED!                        ║');
          console.log('║                                                   ║');
          console.log('╚═══════════════════════════════════════════════════╝\n');
          
          console.log('✅ Session saved in tokens folder');
          console.log('✅ You can now close this and use server.js for production\n');
          console.log('📁 Tokens location:', tokensDir);
          console.log('\n🚀 Next steps:');
          console.log('   1. Stop this server (Ctrl+C)');
          console.log('   2. Use server.js for production/Render deployment');
          console.log('   3. Your tokens folder will work everywhere!\n');
        }
        
        if (statusSession === 'qrReadFail') {
          console.log('\n❌ QR code scan failed. Generating new QR code...\n');
        }
      }
    });

    console.log('\n✅ Venom-bot initialized successfully!');
    console.log('💚 WhatsApp is now connected\n');

  } catch (error) {
    console.error('\n❌ Error initializing Venom-bot:', error.message);
    console.log('\n🔄 Retrying in 10 seconds...\n');
    setTimeout(initializeVenom, 10000);
  }
}

// Web interface for QR code
app.get('/qr', (req, res) => {
  if (!qrCodeBase64) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Scanner</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
          h1 { color: #333; margin-bottom: 20px; }
          .loading {
            display: inline-block;
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .status {
            margin-top: 20px;
            padding: 15px;
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            border-radius: 4px;
            text-align: left;
          }
          .refresh-btn {
            margin-top: 20px;
            padding: 12px 30px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
          }
          .refresh-btn:hover {
            background: #5568d3;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔄 Generating QR Code...</h1>
          <div class="loading"></div>
          <div class="status">
            <strong>⏳ Status:</strong> Initializing WhatsApp connection...<br>
            <strong>⏱️ Please wait:</strong> This may take 10-30 seconds<br>
            <strong>🔄 Auto-refresh:</strong> Page will update when QR is ready
          </div>
          <button class="refresh-btn" onclick="location.reload()">Refresh Now</button>
        </div>
        <script>
          // Auto-refresh every 3 seconds
          setTimeout(() => location.reload(), 3000);
        </script>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 600px;
          }
          h1 {
            color: #128C7E;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
          }
          img {
            max-width: 400px;
            width: 100%;
            height: auto;
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
          .instructions h3 {
            margin-top: 0;
            color: #128C7E;
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
          <p class="subtitle">Use your WhatsApp to scan this code</p>
          
          <img src="${qrCodeBase64}" alt="WhatsApp QR Code" />
          
          <div class="instructions">
            <h3>📋 How to Scan:</h3>
            <ol>
              <li><strong>Open WhatsApp</strong> on your phone</li>
              <li>Go to <strong>Settings</strong> (⚙️)</li>
              <li>Tap <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li><strong>Scan this QR code</strong> above</li>
              <li>Wait for confirmation ✅</li>
            </ol>
          </div>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> QR code expires after 60 seconds. If it expires, refresh this page to get a new one.
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

app.get('/status', async (req, res) => {
  if (!client) {
    return res.json({ connected: false, message: 'Initializing...' });
  }
  
  try {
    const hostDevice = await client.getHostDevice();
    res.json({
      connected: true,
      device: {
        phone: hostDevice.id.user,
        platform: hostDevice.platform
      }
    });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp QR Scanner</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        h1 { color: #333; margin-bottom: 20px; }
        a {
          display: inline-block;
          padding: 15px 40px;
          background: #25D366;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-size: 18px;
          font-weight: bold;
          margin-top: 20px;
          transition: background 0.3s;
        }
        a:hover {
          background: #128C7E;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 WhatsApp QR Scanner</h1>
        <p>Click the button below to view and scan the QR code</p>
        <a href="/qr">📱 View QR Code</a>
      </div>
    </body>
    </html>
  `);
});

// Start server
const PORT = 3001;

app.listen(PORT, async () => {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║                                                   ║');
  console.log(`║     🌐 Server running on port ${PORT}              ║`);
  console.log('║                                                   ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
  
  console.log('📱 OPEN YOUR BROWSER:');
  console.log(`   👉 http://localhost:${PORT}/qr\n`);
  
  console.log('⏳ Initializing WhatsApp...\n');
  
  await initializeVenom();
});

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  if (client) {
    await client.close();
  }
  console.log('✅ Goodbye!\n');
  process.exit(0);
});
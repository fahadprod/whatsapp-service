// Add this endpoint to your WhatsApp service (expirel-whatsapp.onrender.com)
// File: routes/habits.js or add to your existing routes

const express = require('express');
const router = express.Router();

/**
 * Send habit reminder via WhatsApp
 * POST /send-habit
 */
router.post('/send-habit', async (req, res) => {
  try {
    const { phone_number, habit_name, habit_icon, habit_description, user_name } = req.body;

    // Validate required fields
    if (!phone_number || !habit_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phone_number and habit_name are required'
      });
    }

    // Check if WhatsApp client is ready
    if (!global.whatsappClient || !global.whatsappClient.info) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp service is not connected. Please try again in a moment.'
      });
    }

    // Format phone number (remove any non-digit characters except +)
    const formattedNumber = phone_number.replace(/[^\d+]/g, '');
    
    // WhatsApp ID format: number@c.us
    const chatId = formattedNumber.includes('@') 
      ? formattedNumber 
      : `${formattedNumber.replace('+', '')}@c.us`;

    // Compose the message
    const greeting = user_name ? `Hi ${user_name}! 👋` : 'Hi there! 👋';
    
    const message = `${greeting}

🎯 *Habit Reminder*

${habit_icon || '📝'} *${habit_name}*
${habit_description ? `\n_${habit_description}_\n` : ''}
⏰ It's time to complete your habit!

Every small step counts towards building a better you. Let's keep the momentum going! 🌟

💪 *Stay consistent and achieve your goals!*

_Reply STOP to unsubscribe from habit reminders._`;

    // Send message via WhatsApp client
    await global.whatsappClient.sendMessage(chatId, message);

    console.log(`✅ Habit reminder sent to ${phone_number}: ${habit_name}`);

    return res.status(200).json({
      success: true,
      message: 'Habit reminder sent successfully',
      data: {
        phone_number: formattedNumber,
        habit_name: habit_name,
        sent_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error sending habit reminder:', error);

    // Handle specific WhatsApp errors
    if (error.message.includes('not registered')) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is not registered on WhatsApp'
      });
    }

    if (error.message.includes('rate limit')) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.'
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send habit reminder'
    });
  }
});

/**
 * Health check endpoint for habit reminders
 * GET /habit-status
 */
router.get('/habit-status', (req, res) => {
  const isConnected = global.whatsappClient && global.whatsappClient.info;
  
  res.status(200).json({
    success: true,
    service: 'habit-reminders',
    status: isConnected ? 'connected' : 'disconnected',
    ready: isConnected,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
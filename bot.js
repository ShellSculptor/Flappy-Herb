const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GAME_URL = process.env.GAME_URL;

// Initialize bot and database
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🤖 Bot starting...');

const rateLimiter = new Map();

// Start command - Shows game button
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Player';
    
    const welcomeMessage = `🎮 Welcome ${firstName}!\n\nReady to play? Tap the button below to start the game!`;
    
    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🎮 Play Game',
                    web_app: { url: GAME_URL }
                }
            ],
            [
                {
                    text: '🏆 View Leaderboard',
                    callback_data: 'leaderboard'
                }
            ]
        ]
    };
    
    bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: keyboard
    });
});

// Leaderboard command
bot.onText(/\/leaderboard/, async (msg) => {
    await showLeaderboard(msg.chat.id);
});


// Handle callback queries (button presses)
bot.on('callback_query', async (callbackQuery) => {
    const userId = callbackQuery.from.id;
    const now = Date.now();
    
    // Rate limit: 1 request per 3 seconds per user
    if (rateLimiter.has(userId) && now - rateLimiter.get(userId) < 3000) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Please wait...' });
        return;
    }
    
    rateLimiter.set(userId, now);
    
    const message = callbackQuery.message;
    const data = callbackQuery.data;
        
    if (data === 'leaderboard') {
        await showLeaderboard(message.chat.id);
    }
        
    // Answer the callback query
    bot.answerCallbackQuery(callbackQuery.id);
});


// Function to show leaderboard
async function showLeaderboard(chatId) {
    try {
        // Add timeout and retry logic
        const { data, error } = await supabase
            .from('leaderboard')
            .select('username, first_name, score')
            .order('score', { ascending: false })
            .limit(10)
            .abortSignal(AbortSignal.timeout(5000)); // 5 second timeout
                
        if (error) throw error;
        
        let leaderboard = '🏆 *TOP 10 LEADERBOARD*\n\n';
        
        if (data.length === 0) {
            leaderboard += '🎯 No scores yet!\nBe the first to play and set a record!';
        } else {
            data.forEach((row, index) => {
                const position = index + 1;
                let medal = '';
                
                switch (position) {
                    case 1: medal = '🥇'; break;
                    case 2: medal = '🥈'; break;
                    case 3: medal = '🥉'; break;
                    default: medal = `${position}.`; break;
                }
                
                const name = row.username ? `@${row.username}` : row.first_name;
                leaderboard += `${medal} ${name}: *${row.score}* points\n`;
            });
        }
        
        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: '🎮 Play Game',
                        web_app: { url: GAME_URL }
                    }
                ]
            ]
        };
        
        bot.sendMessage(chatId, leaderboard, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Leaderboard error:', error);
        
        // Better error message
        bot.sendMessage(chatId, '⏳ Leaderboard is busy right now. Please try again in a few seconds.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔄 Try Again', callback_data: 'leaderboard' },
                    { text: '🎮 Play Game', web_app: { url: GAME_URL } }
                ]]
            }
        });
    }
}

// Handle errors
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('✅ Bot is running and ready!');

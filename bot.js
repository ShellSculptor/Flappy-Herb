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

// Start command - Works in both private chats and groups
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type;
    const firstName = msg.from.first_name || 'Player';
    
    console.log(`Start command from ${firstName} in ${chatType}`);
    
    let welcomeMessage;
    
    if (chatType === 'private') {
        // Private chat - personal welcome
        welcomeMessage = `🎮 Welcome ${firstName}!\n\nReady to play? Tap the button below to start the game!`;
    } else if (['group', 'supergroup'].includes(chatType)) {
        // Group chat - group-friendly message
        welcomeMessage = `🎮 ${firstName} wants to play!\n\nAnyone can join the fun - tap the button below!`;
    } else {
        // Channel or unknown
        welcomeMessage = `🎮 Welcome to the game!\n\nTap the button below to start playing!`;
    }
    
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

// Game command - Specifically for groups
bot.onText(/\/game/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Player';
    const chatType = msg.chat.type;
    
    let gameMessage;
    
    if (['group', 'supergroup'].includes(chatType)) {
        gameMessage = `🎮 ${firstName} started a game session!\n\nWho's ready to compete? 🏆`;
    } else {
        gameMessage = `🎮 Ready to play, ${firstName}?`;
    }
    
    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🎮 Join Game',
                    web_app: { url: GAME_URL }
                }
            ]
        ]
    };
    
    bot.sendMessage(chatId, gameMessage, {
        reply_markup: keyboard
    });
});

// Challenge command - For group competitions
bot.onText(/\/challenge/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Player';
    const chatType = msg.chat.type;
    
    if (!['group', 'supergroup'].includes(chatType)) {
        bot.sendMessage(chatId, '🏆 Challenges work best in groups! Invite some friends and try again.');
        return;
    }
    
    const challengeMessage = `🏆 ${firstName} challenges the group!\n\n"Think you can beat my score? Prove it!" 💪\n\nWho accepts the challenge?`;
    
    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '⚔️ Accept Challenge',
                    web_app: { url: GAME_URL }
                }
            ],
            [
                {
                    text: '🏆 Group Leaderboard',
                    callback_data: 'group_leaderboard'
                }
            ]
        ]
    };
    
    bot.sendMessage(chatId, challengeMessage, {
        reply_markup: keyboard
    });
});

// Global leaderboard command
bot.onText(/\/leaderboard/, async (msg) => {
    await showLeaderboard(msg.chat.id, 'global');
});

// Group leaderboard command
bot.onText(/\/groupboard/, async (msg) => {
    const chatType = msg.chat.type;
    
    if (!['group', 'supergroup'].includes(chatType)) {
        bot.sendMessage(msg.chat.id, '📊 Group leaderboard only works in groups!\n\nUse /leaderboard for global rankings.');
        return;
    }
    
    await showLeaderboard(msg.chat.id, 'group', msg.chat.title);
});

// Handle mentions and keywords in groups
bot.on('text', async (msg) => {
    const chatType = msg.chat.type;
    const text = msg.text.toLowerCase();
    
    // Only respond to mentions/keywords in groups
    if (['group', 'supergroup'].includes(chatType)) {
        const botUsername = (await bot.getMe()).username.toLowerCase();
        
        // Check if bot is mentioned or game keywords are used
        if (text.includes(`@${botUsername}`) || 
            text.includes('game') || 
            text.includes('play') || 
            text.includes('score')) {
            
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
            
            bot.sendMessage(msg.chat.id, '🎮 Ready to play? Click the button!', {
                reply_markup: keyboard
            });
        }
    }
});

// Handle callback queries (button presses)
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatType = message.chat.type;
    
    if (data === 'leaderboard') {
        await showLeaderboard(message.chat.id, 'global');
    } else if (data === 'group_leaderboard') {
        if (['group', 'supergroup'].includes(chatType)) {
            await showLeaderboard(message.chat.id, 'group', message.chat.title);
        } else {
            await showLeaderboard(message.chat.id, 'global');
        }
    }
    
    // Answer the callback query
    bot.answerCallbackQuery(callbackQuery.id);
});

// Enhanced leaderboard function
async function showLeaderboard(chatId, type = 'global', groupTitle = null) {
    try {
        let query = supabase
            .from('leaderboard')
            .select('username, first_name, score, chat_title')
            .order('score', { ascending: false })
            .limit(10);
        
        // Filter for group leaderboard
        if (type === 'group' && groupTitle) {
            query = query.eq('chat_title', groupTitle);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        let leaderboard;
        
        if (type === 'group' && groupTitle) {
            leaderboard = `🏆 *${groupTitle.toUpperCase()} LEADERBOARD*\n\n`;
        } else {
            leaderboard = '🏆 *GLOBAL TOP 10 LEADERBOARD*\n\n';
        }
        
        if (data.length === 0) {
            if (type === 'group') {
                leaderboard += '🎯 No scores in this group yet!\nBe the first to play and set a record!';
            } else {
                leaderboard += '🎯 No scores yet!\nBe the first to play and set a record!';
            }
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
            
            // Add footer for global leaderboard
            if (type === 'global') {
                leaderboard += '\n💡 _Use /groupboard in groups for group-specific rankings_';
            }
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
        
        // Add group leaderboard button if in a group
        if (type === 'global' && ['group', 'supergroup'].includes((await bot.getChat(chatId)).type)) {
            keyboard.inline_keyboard.push([
                {
                    text: '👥 Group Leaderboard',
                    callback_data: 'group_leaderboard'
                }
            ]);
        }
        
        bot.sendMessage(chatId, leaderboard, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Leaderboard error:', error);
        bot.sendMessage(chatId, '❌ Error loading leaderboard. Please try again later.');
    }
}

// Handle web app data (when scores are submitted)
bot.on('web_app_data', async (msg) => {
    try {
        const data = JSON.parse(msg.web_app.data);
        console.log('Received web app data:', data);
        
        if (data.action === 'new_high_score') {
            const chatType = msg.chat.type;
            
            if (['group', 'supergroup'].includes(chatType)) {
                // Announce new high score in group
                const announcement = `🎉 *NEW HIGH SCORE!*\n\n🏆 ${data.user} just scored *${data.score}* points!\n🥇 Global Rank: #${data.rank}`;
                
                const keyboard = {
                    inline_keyboard: [
                        [
                            {
                                text: '🎮 Beat This Score!',
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
                
                bot.sendMessage(msg.chat.id, announcement, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        }
    } catch (error) {
        console.error('Web app data error:', error);
    }
});

// Handle errors
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('✅ Bot is running and ready for groups!');

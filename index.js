require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const axios = require('axios');

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => res.send('Bot is running'));

app.listen(port, () => console.log(`Health check running on port ${port}`));


const girlfriendNumber = process.env.GIRLFRIEND_NUMBER;
const client = new Client({ authStrategy: new LocalAuth() });

const memory = { name: 'Oyinkansola', favoriteFood: '', favoriteSong: '' };
let lastActiveDate = null;
let loveStreak = 0;

function detectMood(text) {
  const happy = ['happy', 'yay', 'good', 'love', 'great'];
  const sad = ['sad', 'miss', 'cry', 'bad', 'lonely'];
  const t = text.toLowerCase();
  if (happy.some(w => t.includes(w))) return '😊💖';
  if (sad.some(w => t.includes(w))) return '😔💔';
  return '🥰';
}

function updateLoveStreak() {
  const today = new Date().toDateString();
  if (lastActiveDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  loveStreak = lastActiveDate === yesterday ? loveStreak + 1 : 1;
  lastActiveDate = today;
}

const goodMorningMessages = [
  "Good morning beautiful ☀️. You light up my world 💖",
  "Rise and shine, angel 😇. Today is your day!",
];
const goodNightMessages = [
  "Good night my queen 👑. Dream sweet things 💫",
  "Sleep tight baby 💕. I'm holding you in my thoughts 💭"
];

// Every day at 8 AM
cron.schedule('0 8 * * *', async () => {
    await sendAIMessage(`Write a cute good morning message for my girlfriend named ${memory.name || 'baby'}.`, 'morning');
  });
  
  // Every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    await sendAIMessage(`Write a romantic good night message for my girlfriend named ${memory.name || 'baby'}.`, 'night');
  });

// // Send memes at 9am, 12pm, 3pm, 6pm, 9pm
cron.schedule('0 9,12,15,18,21 * * *', () => {
    sendRandomMeme(girlfriendNumber)
  });
  
  

const reminders = [
  { date: '06-25', message: "Happy anniversary my love 💍❤️!" },
  { date: '02-14', message: "Happy Valentine's Day 💘!" },
  { date: '12-12', message: "Happy Birthday, my queen 🎂💐!" }
];
cron.schedule('0 8 * * *', () => {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  reminders.forEach(reminder => {
    if (reminder.date === todayStr) {
      client.sendMessage(girlfriendNumber, reminder.message);
    }
  });
});

client.on('message', async message => {
  if (message.from !== girlfriendNumber) return;

  const text = message.body.toLowerCase().trim();
  if (!text.startsWith('!')) return;
  updateLoveStreak();

  if (text === '!hug') return message.reply("🤗 Here's a warm hug just for you!");
  if (text === '!streak') return message.reply(`You've talked to me ${loveStreak} day(s) in a row 🥰`);
  if (message.body === '!meme') {
    await sendRandomMeme(message);
    return;
  }

  if (text.startsWith('!setname')) {
    memory.name = text.replace('!setname', '').trim();
    return message.reply(`Got it! Your name is now ${memory.name} 💖`);
  }
  if (text.startsWith('!setfood')) {
    memory.favoriteFood = text.replace('!setfood', '').trim();
    return message.reply(`Yum! I’ll remember you love ${memory.favoriteFood} 🍽️`);
  }
  if (text.startsWith('!setsong')) {
    memory.favoriteSong = text.replace('!setsong', '').trim();
    return message.reply(`🎶 Your favorite song is now "${memory.favoriteSong}"`);
  }

  if (text === '!joke') {
    return sendLoveMessage(`Tell me a romantic joke for my girlfriend named ${memory.name || 'baby'}.`, message);
  }

  if (text === '!poem') {
    return sendLoveMessage(`Write a romantic poem for my girlfriend named ${memory.name || 'baby'}.`, message);
  }

  const romanticPrompt = `You are a romantic boyfriend. Her name is ${memory.name || 'baby'}. Her favorite food is ${memory.favoriteFood || 'jollof rice'}. Her favorite song is ${memory.favoriteSong || 'Perfect by Ed Sheeran'}. Respond lovingly to: ${text}`;
  return sendLoveMessage(romanticPrompt, message);
});

async function sendLoveMessage(prompt, message) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct',
        messages: [
          { role: 'system', content: 'You are Victor, a loving and romantic boyfriend' },
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const aiReply = response.data.choices?.[0]?.message?.content || "You're always on my mind 💘";
    const mood = detectMood(prompt);
    message.reply(aiReply + ' ' + mood);

  } catch (err) {
    console.error("❌ OpenRouter error:", err.message);
    message.reply("Oops, my love circuits are a bit off right now 💔");
  }
}

async function sendAIMessage(prompt, type) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'mistralai/mistral-7b-instruct',
          messages: [
            { role: 'system', content: 'You are Victor, a loving and romantic boyfriend. Speak from your heart. Reply with one short sweet message only.' },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
  
      const message = response.data.choices?.[0]?.message?.content || (type === 'morning' ? 'Good morning, my love 💖' : 'Good night, my sweet angel 🌙');
      await client.sendMessage(girlfriendNumber, message);
  
    } catch (err) {
      console.error(`❌ Failed to send ${type} message:`, err.message);
      const fallback = type === 'morning' ? 'Good morning ☀️' : 'Good night 🌙';
      await client.sendMessage(girlfriendNumber, fallback + ' (AI error)');
    }
  }

  async function sendRandomMeme(target) {
    try {
      const response = await axios.get('https://meme-api.com/gimme');
      const meme = response.data;
  
      const isImage = meme.url.match(/\.(jpg|jpeg|png|gif)$/i);
      if (!isImage) {
        throw new Error('Meme URL is not a valid image');
      }
  
      const media = await MessageMedia.fromUrl(meme.url, { unsafeMime: true });
  
      // Send meme with caption
      if (typeof target === 'string') {
        return client.sendMessage(target, media, { caption: meme.title });
      } else {
        return target.reply(media, undefined, { caption: meme.title });
      }
  
    } catch (error) {
      console.error('🐾 Meme API error:', error.message);
      // Silent fail — don't send a fallback message
    }
  }
  
  
  
  
  

async function sendCuteMeme(message) {
  try {
    const memeUrls = [
      'https://i.imgur.com/5M0Y0Gf.jpg',
      'https://i.imgur.com/NpFYd9z.jpg',
      'https://i.imgur.com/7Y5EEnY.jpg',
      'https://i.imgur.com/yGbKExP.jpg',
      'https://i.imgur.com/kldLvGQ.jpg'
    ];
    const randomUrl = memeUrls[Math.floor(Math.random() * memeUrls.length)];
    const media = await MessageMedia.fromUrl(randomUrl);
    await message.reply(media, undefined, { caption: 'Here’s a cute one for you 🥰' });

  } catch (error) {
    console.error('🐾 Meme error:', error.message);
    message.reply("Couldn't fetch a meme right now, but you’re still the cutest! 💖");
  }
}


client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('💌 Romantic bot is ready!'));
client.initialize();

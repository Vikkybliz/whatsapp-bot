require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { uploadAllAuthFiles, downloadAllAuthFiles } = require('./supabaseSession');

const girlfriendNumber = process.env.GIRLFRIEND_NUMBER;

const memory = { name: 'Oyinkansola', favoriteFood: '', favoriteSong: '' };
let lastActiveDate = null;
let loveStreak = 0;

async function startBot() {
  const authDir = './auth';
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir);
}

await downloadAllAuthFiles();

  const { state, saveCreds } = await useMultiFileAuthState('./auth');

  // const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    // version,
    auth: state,
    // printQRInTerminal: true,
  });

  let lastUploadTime = 0;
sock.ev.on('creds.update', async () => {
  const now = Date.now();
  if (now - lastUploadTime > 30000) { // 30 seconds
    await uploadAllAuthFiles();
    lastUploadTime = now;
  }
});

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📲 Scan the QR code below:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = 
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('❌ Connection closed', lastDisconnect?.error);

      if (shouldReconnect) {
        startBot();
      } else {
        console.log('❌ You are logged out. Delete auth_info.json and scan QR again.');
      }
    }

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
  
    const remoteJid = msg.key.remoteJid;
    const expectedJid = girlfriendNumber.endsWith('@s.whatsapp.net') ? girlfriendNumber : girlfriendNumber + '@s.whatsapp.net';
    if (remoteJid !== expectedJid) {
      console.log("❌ Message from unknown number:", remoteJid);
      return;
    }
  
    // Extract text from different message types
    let text = '';
    if (msg.message.conversation) {
      text = msg.message.conversation;
    } else if (msg.message.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text;
    } else if (msg.message.imageMessage?.caption) {
      text = msg.message.imageMessage.caption;
    } else {
      console.log("❌ Unrecognized message format:", msg.message);
      return;
    }
  
    text = text.trim().toLowerCase();
    console.log("✅ Received message:", text);
  
    if (!text.startsWith('!')) return;
  
    updateLoveStreak();
    const send = (message) => sock.sendMessage(expectedJid, { text: message });
  
    if (text === '!hug') return send("🤗 Here's a warm hug just for you!");
    if (text === '!streak') return send(`You've talked to me ${loveStreak} day(s) in a row 🥰`);
    if (text === '!meme') return await sendRandomMeme(sock);
    if (text === '!joke') return sendLoveMessage(`Tell me a romantic joke for my girlfriend named ${memory.name}.`, send);
    if (text === '!poem') return sendLoveMessage(`Write a romantic poem for my girlfriend named ${memory.name}.`, send);
  
    if (text.startsWith('!setname')) {
      memory.name = text.replace('!setname', '').trim();
      return send(`Got it! Your name is now ${memory.name} 💖`);
    }
    if (text.startsWith('!setfood')) {
      memory.favoriteFood = text.replace('!setfood', '').trim();
      return send(`Yum! I’ll remember you love ${memory.favoriteFood} 🍽️`);
    }
    if (text.startsWith('!setsong')) {
      memory.favoriteSong = text.replace('!setsong', '').trim();
      return send(`🎶 Your favorite song is now "${memory.favoriteSong}"`);
    }
  
    // Default fallback for romantic replies
    const romanticPrompt = `You are a romantic boyfriend. Her name is ${memory.name}. Her favorite food is ${memory.favoriteFood || 'jollof rice'}. Her favorite song is ${memory.favoriteSong || 'Perfect by Ed Sheeran'}. Respond lovingly to: ${text}`;
    return sendLoveMessage(romanticPrompt, send);
  });  

  scheduleTasks(sock);
}

// 🕒 Cron Tasks
function scheduleTasks(sock) {
  const send = (text) => sock.sendMessage(girlfriendNumber, { text });

  cron.schedule('0 8 * * *', () =>
    sendLoveMessage(`Write a cute good morning message for my girlfriend named ${memory.name}`, send)
  );

  cron.schedule('0 2 * * *', () =>
    sendLoveMessage(`Write a romantic good night message for my girlfriend named ${memory.name}`, send)
  );

  cron.schedule('0 9,12,15,18,21 * * *', () =>
    sendRandomMeme(sock)
  );

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
        send(reminder.message);
      }
    });
  });
}

function updateLoveStreak() {
  const today = new Date().toDateString();
  if (lastActiveDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  loveStreak = lastActiveDate === yesterday ? loveStreak + 1 : 1;
  lastActiveDate = today;
}

async function sendLoveMessage(prompt, send) {
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'mistralai/mistral-7b-instruct',
      messages: [
        { role: 'system', content: 'You are Victor, a loving boyfriend' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    const reply = response.data.choices?.[0]?.message?.content || 'Thinking about you 💖';
    send(reply + ' 🥰');
  } catch (err) {
    console.error('❌ AI error:', err.message, err.response?.data);
    send("Couldn't fetch a loving response 😔");
  }
}

async function sendRandomMeme(sock) {
  try {
    const response = await axios.get('https://meme-api.com/gimme');
    const { url, title } = response.data;

    const buffer = (await axios.get(url, { responseType: 'arraybuffer' })).data;

    await sock.sendMessage(girlfriendNumber, {
      image: buffer,
      caption: title,
    });
  } catch (err) {
    console.error('❌ Meme error:', err.message);
  }
}

// Express Health Check
const app = express();
app.get('/health', (_, res) => res.send('Baileys Bot Running!'));
app.listen(process.env.PORT || 3000);

startBot();

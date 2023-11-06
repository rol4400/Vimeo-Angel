
require('dotenv').config();

// Telegram MTPROTO API Configuration
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require("input");

// Telegram API configuration
const apiId = parseInt(process.env.TELE_API_ID);
const apiHash = process.env.TELE_API_HASH;

const { Telegraf } = require('telegraf');

// Replace these with your own values
const botToken = process.env.BOT_TOKEN;

const stringSession = new StringSession("");
const client = new TelegramClient("stringSession", apiId, apiHash);

// Initialize Telegraf bot
const bot = new Telegraf(botToken);
// bot.use(Telegraf.session());

// Handle the /start command
var authenticated = false;
bot.command('start', async (ctx) => {
  const userId = ctx.message.from.id;

  // Check if the user has an existing session
  if (!authenticated) {
    await ctx.reply('Welcome! Please enter your phone number to start the authentication process.');
    authenticated = false;
  } else {
    await ctx.reply('You are already authenticated. Use /info to get information.');
  }
});

// Handle the phone number input
bot.hears(/\/auth (.+)/, async (ctx) => {
  const phoneNumber = ctx.match[1];

  // Start the authentication process
  await authenticateUser(phoneNumber, ctx);
});

// Handle the /info command to get user information
bot.command('info', async (ctx) => {
  if (authenticated) {
    const me = await client.getMe();
    await ctx.reply(`Authenticated user: ${me.username}`);
  } else {
    await ctx.reply('You are not authenticated. Use /start to begin the authentication process.');
  }
});

// Start the Telegraf bot
bot.launch();

// Function to authenticate the user
async function authenticateUser(phoneNumber, ctx) {
  try {
    // Start the TelegramClient authentication
    await client.connect();

    // Request phone code
    const phoneCode = await input.text('Please enter the code you received on your phone: ');
    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => phoneCode,
    });

    // Save the session after successful authentication
    authenticated = true;
    await ctx.reply('Authentication successful! Use /info to get information.');
  } catch (error) {
    console.error('Error during authentication:', error);
    await ctx.reply('Authentication failed. Please try again.');
  } finally {
    // Disconnect the client after authentication
    await client.disconnect();
  }
}

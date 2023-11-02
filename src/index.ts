import "dotenv/config";
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Store user settings
const userSettings = {};

// Define destinations
const destinations = ['Destination1', 'Destination2', 'Destination3'];

// Middleware to check if the user has settings
bot.use((ctx, next) => {
  const userId = getUserId(ctx);
  if (!userId) {
    // Handle the case when userId is not available
    console.error('Unable to determine user ID');
    return;
  }

  if (!userSettings[userId]) {
    userSettings[userId] = {};
  }
  return next();
});

// Start command handler
bot.start((ctx) => {
  ctx.reply('Welcome! Please upload a video file to start.');
});

// Handle video messages
bot.on('video', (ctx) => {
  const userId = getUserId(ctx);
  if (!userId) {
    console.error('Unable to determine user ID');
    return;
  }

  const chatId = ctx.message.chat.id;

  // Save the video file id
  userSettings[userId].videoFileId = ctx.message.video.file_id;

  // Show settings panel
  showSettingsPanel(ctx, chatId);
});

// Handle button clicks
bot.on('callback_query', (ctx) => {
    const userId = getUserId(ctx);
    if (!userId) {
      console.error('Unable to determine user ID');
      return;
    }
  
    // Use type assertion to tell TypeScript that data exists
    const action = (ctx.callbackQuery as any).data;
  
    switch (action) {
      case 'edit_date':
        ctx.reply('📅 Please enter the date in the format YYMMDD:',
        {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: "YYMMDD",
            },
        },);
        break;
  
      case 'edit_password':
        ctx.reply('🔐 Please enter the password:',
        {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: "Password",
            },
        },);
        break;
  
      case 'edit_title':
        ctx.reply('📝 Please enter the title:',
        {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: "Education Title",
            },
        },);
        break;
  
      case 'edit_leader':
        ctx.reply('👤 Please enter the leader:',
        {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: "Education Leader Name & Title",
            },
        },);
        break;
  
      case 'edit_destination':
        ctx.reply('🌍 Please select a destination:', Markup.inlineKeyboard(
          destinations.map(dest => [Markup.button.callback(`📍 ${dest}`, `select_destination_${dest}`)])
        ));
        break;
    }
  });
  
  

// Handle destination selection
bot.action(/select_destination_(.+)/, (ctx) => {
  const userId = getUserId(ctx);
  if (!userId) {
    console.error('Unable to determine user ID');
    return;
  }

  const destination = ctx.match[1];

  // Save the selected destination
  userSettings[userId].destination = destination;

  // Show settings panel
  showSettingsPanel(ctx, ctx.chat!.id);
});

// Handle text messages
bot.on('text', (ctx) => {
    const userId = getUserId(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }

    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    // Handle specific setting inputs
    handleSettingInput(ctx, userId, text);
});

// Function to show the settings panel
function showSettingsPanel(ctx, chatId) {
  const userId = getUserId(ctx);
  if (!userId) {
    console.error('Unable to determine user ID');
    return;
  }

  const userSetting = userSettings[userId];

  // Check if a video is being uploaded
  const uploadingVideoMessage = userSetting.videoFileId
    ? `Uploading Video:\nTitle: ${userSetting.date || 'YYMMDD'} ${userSetting.title || 'Title'} (${userSetting.leader || 'Leader'})\nPassword: ${userSetting.password || 'password'}\nSend destination: ${userSetting.destination || 'destination'}`
    : 'No video uploaded yet. Please upload a video to start.';

  ctx.reply(uploadingVideoMessage, Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Edit Date', 'edit_date'),
      Markup.button.callback('🔐 Edit Password', 'edit_password'),
    ],
    [
      Markup.button.callback('📝 Edit Title', 'edit_title'),
      Markup.button.callback('👤 Edit Leader', 'edit_leader'),
    ],
    [
      Markup.button.callback('🌍 Edit Destination', 'edit_destination'),
    ],
    [
      Markup.button.callback('✅ Complete', 'complete'),
      Markup.button.callback('❌ Cancel', 'cancel'),
    ],
  ]));
}

// Function to handle setting inputs
function handleSettingInput(ctx, userId, input) {
    const lowercaseInput = ctx.update.message.text;

    // Use a simplified regex to extract the setting
    const match = ctx.update.message.reply_to_message.text.match(/.*Please enter the (\w+)/);
    console.log(match);

    switch (lowercaseInput) {
        case 'complete':
            // Save settings and perform necessary actions
            // For now, just log the settings
            console.log(`Settings for user ${userId}:`, userSettings[userId]);

            // Reset user settings
            userSettings[userId] = {};

            break;

        case 'cancel':
            // Reset user settings
            userSettings[userId] = {};

            break;

        default:
            // Handle specific setting inputs
            updateSetting(ctx, userId, lowercaseInput, match);
            break;
    }
}

// Function to update specific settings
function updateSetting(ctx, userId, input, match) {
    const userSetting = userSettings[userId];

    // Determine which setting to update based on the context
    if (match && match[1]) {
        const setting = match[1];

        switch (setting) {
            case 'date':
                // Validate and update the date setting
                const year = Number(input.substring(0, 2));
                const month = Number(input.substring(2, 4));
                const day = Number(input.substring(4, 6));

                if (
                    /^\d{6}$/.test(input) &&
                    year >= 40 &&
                    month >= 1 && month <= 12 && // Validating month
                    day >= 1 && day <= new Date(year + 2000, month, 0).getDate() // Validating day based on the month
                ) {
                    userSetting.date = input;
                    ctx.reply('Date updated successfully.');
                    showSettingsPanel(ctx, ctx.message.chat.id);
                } else {
                    ctx.reply('Invalid date format. You must use the format YYMMDD.');
                    ctx.reply('📅 Please enter the date:',
                    {
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: "YYMMDD",
                        },
                    },);
                }
                break;

            case 'password':
                // Update the password setting
                userSetting.password = input;
                ctx.reply('Password updated successfully.');
                showSettingsPanel(ctx, ctx.message.chat.id);
                break;

            case 'title':
                // Update the title setting
                userSetting.title = input;
                ctx.reply('Title updated successfully.');
                showSettingsPanel(ctx, ctx.message.chat.id);
                break;

            case 'leader':
                // Update the leader setting
                userSetting.leader = input;
                ctx.reply('Leader updated successfully.');
                showSettingsPanel(ctx, ctx.message.chat.id);
                break;

            default:
                // Handle other settings if needed
                break;
        }
    }
}

// Function to get user ID from context
function getUserId(ctx) {
  return ctx.from?.id || ctx.message?.from?.id;
}

// Start the bot
bot.launch();

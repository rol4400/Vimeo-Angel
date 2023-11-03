import axios from "axios";
import "dotenv/config";
import { Telegraf, Markup } from 'telegraf';
import { Vimeo } from 'vimeo';

import fs from 'fs';
import path from 'path';

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Vimeo client credentials
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const accessToken = process.env.ACCESS_TOKEN;

const vimeoClient = new Vimeo(
    clientId,
    clientSecret,
    accessToken
  );

// Store user settings
const userSettings = {};

// Define destinations
const destinations = [['Destination1', '123123123'], ['Destination2', '3453453453'], ['Destination3', '76798667']];

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
          destinations.map(dest => [Markup.button.callback(`📍 ${dest[0]}`, `select_destination_${dest[1]}`)])
        ));
        break;

    case 'complete':
        // Save settings and perform necessary actions
        // For now, just log the settings
        console.log(`Settings for user ${userId}:`, userSettings[userId]);

        processUpload(ctx);

        break;

    case 'cancel':
        // Reset user settings
        userSettings[userId] = {};
        ctx.reply("Cancelled. Please send me another video when you are ready");

        break;
    }
  });
  
  

// Handle destination selection
bot.action(/select_destination_(.+)/, (ctx) => {

    console.log(ctx.match[1])

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

    if (!userSettings[userId].videoFileId) {
        ctx.reply("Please upload a video file here before I can do anything");
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

    // Check if the message is a premature reply
    if (!ctx.update.message.reply_to_message || !ctx.update.message.reply_to_message.text) {
        ctx.reply("Please reply to the question to provide your answer.");
        return;
    }

    // Use a simplified regex to extract the setting
    const match = ctx.update.message.reply_to_message.text.match(/.*Please enter the (\w+)/);
    console.log(match);

     // Handle specific setting inputs
     updateSetting(ctx, userId, lowercaseInput, match);

    // switch (lowercaseInput) {
    //     case 'complete':
    //         // Save settings and perform necessary actions
    //         // For now, just log the settings
    //         console.log(`Settings for user ${userId}:`, userSettings[userId]);

    //         processUpload(ctx, 5);

    //         // Reset user settings
    //         userSettings[userId] = {};

    //         break;

    //     case 'cancel':
    //         // Reset user settings
    //         userSettings[userId] = {};
    //         ctx.reply("Upload has been cancelled. Please send me another video when you are ready");

    //         break;

    //     default:
           
    //         break;
// }
    
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
                showSettingsPanel(ctx, ctx.message.chat.id);
                break;

            case 'title':
                // Update the title setting
                userSetting.title = input;
                showSettingsPanel(ctx, ctx.message.chat.id);
                break;

            case 'leader':
                // Update the leader setting
                userSetting.leader = input;
                showSettingsPanel(ctx, ctx.message.chat.id);
                break;

            default:
                // Handle other settings if needed
                break;
        }
    }
}

// Store message IDs and chat IDs for progress bars
const progressBars = {};

// Function to download video by file_id with progress bar
async function downloadVideo(fileId, chatId, progressCallback) {
    try {
        const file = await bot.telegram.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        const response = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                const totalMB = progressEvent.total! / (1024 * 1024);
                const downloadedMB = progressEvent.loaded / (1024 * 1024);
                const percentage = ((progressEvent.loaded / progressEvent.total!) * 100).toFixed(2);
            
                // Check if downloadedMB is a valid number before using toFixed
                const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB.toString())) ? parseFloat(downloadedMB.toString()).toFixed(2) : 'N/A';
            
                progressCallback(percentage, downloadedMBFormatted, totalMB);
            },
            
        });

        const storagePath = path.join(__dirname, '..', 'video_store');
        const filePath = `${storagePath}/${file.file_id}.mp4`;
        const fileStream = fs.createWriteStream(filePath);
        response.data.pipe(fileStream);

        return new Promise((resolve, reject) => {
            fileStream.on('finish', () => resolve(filePath));
            fileStream.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading video:', error);
        throw error;
    }
}

// Function to upload video to Vimeo with progress bar
async function uploadToVimeo(localFilePath, userId, chatId, progressCallback) {
    return new Promise(async (resolve, reject) => {
        
        // Get the user settings
        const userSetting = userSettings[userId];

        try {
            const videoUpload = await vimeoClient.upload(
                localFilePath,
                {
                    name: `${userSetting.date || 'YYMMDD'} ${userSetting.title || 'Title'} (${userSetting.leader || 'Leader'})`,
                    description: `Uploaded on ${new Date().toLocaleDateString()}`,
                },
                async function (uri) {
                    // Complete callback
                    console.log('Video uploaded successfully. Vimeo link: https://vimeo.com/manage/', uri);

                    // Set privacy settings with the provided password
                    const password = userSetting.password || process.env.DEFAULT_VIMEO_PASSWORD; // Replace with the actual property from your settings
                    await setPrivacySettings(uri.split('/').pop(), password);

                    // Delete the local file after the upload is complete
                    await deleteLocalFile(localFilePath);

                    resolve(uri);
                },
                function (bytes_uploaded, bytes_total) {
                    // Progress callback
                    const totalMB = bytes_total / (1024 * 1024);
                    const uploadedMB = !isNaN(parseFloat(bytes_uploaded)) ? bytes_uploaded / (1024 * 1024) : 'N/A';
                    const percentage = ((bytes_uploaded / bytes_total) * 100).toFixed(2);
                    progressCallback(percentage, uploadedMB, totalMB);
                },
                function (error) {
                    // Error callback
                    console.error('Vimeo upload error:', error);

                    // Delete the local file after the upload fails
                    deleteLocalFile(localFilePath);
                    reject(error);
                }
            );
        } catch (error) {
            console.error('Error uploading video to Vimeo:', error);

            // Delete the local file after the upload fails
            deleteLocalFile(localFilePath);
            reject(error);
        }
    });
}

async function deleteLocalFile(filePath) {
    try {
        await fs.unlink(filePath, (err) => {
            if (err) throw err;
            console.log('Local file deleted successfully:', filePath);
          });
    } catch (deleteError) {
        console.error('Error deleting local file:', deleteError);
    }
}

// Function to set privacy settings for the video on Vimeo
async function setPrivacySettings(videoId, password) {
    return new Promise((resolve, reject) => {
        vimeoClient.request({
            method: 'PATCH',
            path: `/videos/${videoId}`,
            query: {
                password: password,
                privacy: {
                    view: 'password',
                },
            },
        }, function (error, body, status_code, headers) {
            if (error) {
                console.error('Vimeo set privacy settings error:', error);
                reject(error);
            } else {
                resolve(body);
            }
        });
    });
}

async function processUpload(ctx) {
    const userId = getUserId(ctx);
    const chatId = ctx.chat.id;
    const userSetting = userSettings[userId];

    let progressMessage;

    promptSendVideo(ctx);
    return;
    try {
        // Check if progress message has been sent
        if (!progressBars[chatId] || !progressBars[chatId].message_id) {
            progressMessage = await ctx.reply('Preparing for processing...');
            progressBars[chatId] = { message_id: progressMessage.message_id };
        }

        // Download the video from telegram
        const localFilePath = await downloadVideo(userSetting.videoFileId, chatId, (percentage, downloadedMB, totalMB) => {
            const progressBar = generateProgressBar(percentage);

            const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB)) ? parseFloat(downloadedMB).toFixed(2) : 'N/A';
            updateProgressMessage(chatId, progressBars[chatId].message_id, `Downloading... ${percentage}% (${downloadedMBFormatted} MB / ${totalMB.toFixed(2)} MB)\n${progressBar}`);
           
        });
        console.log('Video downloaded successfully:', localFilePath);

        // Upload the video to vimeo
        const vimeoUri = await uploadToVimeo(localFilePath, userId, chatId, (percentage, uploadedMB, totalMB) => {
            const progressBar = generateProgressBar(percentage);

            const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
            updateProgressMessage(chatId, progressBars[chatId].message_id, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${totalMB.toFixed(2)} MB)\n${progressBar}`);
        });

        // Do something with the Vimeo URI (save it, send it in a message, etc.)
        ctx.reply(`Video uploaded successfully. Vimeo link: https://vimeo.com/manage/${vimeoUri}`);

        // Prompt user to send the link to the designated chatroom
        promptSendVideo(ctx);

        // Reset user settings
        // userSettings[userId] = {};

    } catch (error) {
        console.error('Error processing video:', error);
        ctx.reply('Error processing video. Please try again later.');
    }

    // Simulate additional processing time
    // for (let i = 0; i < steps; i++) {
    //     const progress = (i + 1) * (100 / steps);
    //     const progressBar = generateProgressBar(progress);

    //     if (!progressMessage) {
    //         // Send the initial progress message
    //         progressMessage = await ctx.reply(`Processing... ${progress.toFixed(2)}%\n${progressBar}`);
    //         progressBars[chatId] = { message_id: progressMessage.message_id };
    //     } else {
    //         // Edit the existing message to update progress
    //         await ctx.telegram.editMessageText(
    //             chatId,
    //             progressBars[chatId].message_id,
    //             null,
    //             `Processing... ${progress.toFixed(2)}%\n${progressBar}`
    //         );
    //     }

    //     // Simulate some processing time
    //     await new Promise(resolve => setTimeout(resolve, 1000));
    // }

    // Edit the final message indicating completion
    await ctx.telegram.editMessageText(
        chatId,
        progressBars[chatId].message_id,
        null,
        'Processing complete!\n' + generateProgressBar(100)
    );
}

// Function to prompt where to send the video
function promptSendVideo(ctx) {
    // Prompt user to send the link to the designated chatroom
    const sendLinkOptions = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ Send', 'send_link'),
            Markup.button.callback('Select Another Room', 'select_different_room'),
        ],
        [
            Markup.button.callback('❌ Cancel', 'cancel'),
        ]
    ]);

    ctx.replyWithMarkdown('Send the Vimeo link to the designated chatroom?', sendLinkOptions);
}

// Function to generate a simple ASCII progress bar
function generateProgressBar(progress) {
    const numericProgress = parseFloat(progress);

    if (isNaN(numericProgress) || numericProgress < 0 || numericProgress > 100) {
        return 'Invalid progress value';
    }

    const barLength = 20;
    const completed = Math.round(barLength * (numericProgress / 100));
    const remaining = barLength - completed;

    const progressBar = '█'.repeat(Math.max(completed, 0)) + '░'.repeat(Math.max(remaining, 0));

    return `[${progressBar}] ${numericProgress.toFixed(2)}%`;
}


// Function to update progress message using editMessageText
async function updateProgressMessage(chatId, messageId, text) {
    try {
        if (!progressBars[chatId]) {
            progressBars[chatId] = {};
        }

        if (progressBars[chatId].message_id) {
            // If message_id is defined, edit the existing message
            await bot.telegram.editMessageText(chatId, progressBars[chatId].message_id, null!, text);
        } else {
            // If message_id is undefined, send a new message and store the message ID
            const newMessage = await bot.telegram.sendMessage(chatId, text);
            progressBars[chatId].message_id = newMessage.message_id;
        }
    } catch (error) {
        console.error('Error updating progress message:', error);
    }
}

// Function to get user ID from context
function getUserId(ctx) {
    return ctx.from?.id || ctx.message?.from?.id;
}

// Start the bot
bot.launch();

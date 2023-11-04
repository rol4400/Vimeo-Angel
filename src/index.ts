import axios from "axios";
import "dotenv/config";
import { Telegraf, Markup } from 'telegraf';
import { Vimeo } from 'vimeo';
import { Deta } from 'deta';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

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

// Deta space data storage
const detaInstance = Deta();  //instantiate with Data Key or env DETA_PROJECT_KEY
const configDb = detaInstance.Base("Configuration");

// Store user settings
const userSettings = {};

// Define destinations
var destinations = [];

// Initialisation
async function init () {
    destinations = (await configDb.get("destinations")).value;
};
init();

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

// Function to handle new members (including the bot) joining a chat
bot.on('new_chat_members', (ctx) => {
    const chatId = ctx.message.chat.id;
    const chatName = ctx.message.chat.title; // Use chat.title instead of chat.name

    // Check if the bot is among the new members
    const botJoined = ctx.message.new_chat_members.some(member => member.id === bot.botInfo!.id);

    if (botJoined) {
        // Check if the chat is not already in destinations
        if (!destinations.some(dest => dest[1] === chatId.toString())) {
            
            // Add the chat to destinations array
            destinations.push([chatName, chatId.toString()]);

            // Update the databse
            configDb.update(
                { value: destinations },
                "destinations",
            );

            // Log the addition
            console.log(`Bot added to group: ${chatName} (ID: ${chatId})`);
        }
    }
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
  userSettings[userId].videoDuration = ctx.message.video.duration;

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

    // Handle destination selection
    var match = action.match(/select_destination_(.+)/);
    if (match && match[1]) {

        const destination = match[1];

        // Save the selected destination
        userSettings[userId].destination = destination;

        // Show settings panel
        showSettingsPanel(ctx, ctx.chat!.id);

        return;
    }
  
    // Handle directly sending to a destination
    match = action.match(/send_to_destination_(.+)/);
    if (match && match[1]) {
        const userId = getUserId(ctx);

        const destination = match[1];

        // Save the selected destination
        userSettings[userId].destination = destination;

       // Send the message
       sendToDestination(ctx, destination);

        return;
    }
  
    // Handle other simple actions
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

        case 'select_different_room':
            ctx.reply('🌍 Please select a destination:', Markup.inlineKeyboard(
                destinations.map(dest => [Markup.button.callback(`📍 ${dest[0]}`, `send_to_destination_${dest[1]}`)])
            ));
            break;

        case 'edit_start_time':
            ctx.reply('⏰ Please enter the start time in the format hh:mm or hh:mm:ss.',
                {
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "Start Time",
                    },
                });
            break;

        case 'edit_end_time':
            ctx.reply('⏰ Please enter the end time in the format hh:mm or hh:mm:ss.',
                {
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "End Time",
                    },
                });
            break;

        case 'complete':
            // Save settings and perform necessary actions
            // For now, just log the settings
            console.log(`Settings for user ${userId}:`, userSettings[userId]);

            // Check if both start and end times are set
            if (userSettings[userId].startTime !== undefined && userSettings[userId].endTime !== undefined) {
                // Check if end time is after start time
                if (userSettings[userId].endTime <= userSettings[userId].startTime) {
                    ctx.reply('End time must be after start time. Please adjust your settings.');
                    return;
                }

                // Check if end time is within the duration of the video
                const videoDuration = userSettings[userId].videoDuration; // You need to implement a function to get the video duration
                if (userSettings[userId].endTime > videoDuration) {
                    ctx.reply('End time must be within the duration of the video. Please adjust your settings.');
                    return;
                }
            }

            // Perform the upload
            processUpload(ctx);

            break;

        case 'cancel':
            // Reset user settings
            userSettings[userId] = {};
            ctx.reply("Cancelled. Please send me another video when you are ready");

            break;

        case 'send_link':
            // Send the link to the specified destination
            sendToDestination(ctx, userSettings[userId].destination);
            break;

        default:
            console.log("DEFAULT")
            console.log(action)
            break;

    }
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

    const destinationName = destinations.find(([_, id]) => id === userSetting.destination)?.[0];

    // Include information about start and end times
    const timeInfo = userSetting.startTime && userSetting.endTime
        ? `\n⏰ Start Time: ${formatTime(userSetting.startTime)}\n⏰ End Time: ${formatTime(userSetting.endTime)}`
        : userSetting.startTime
            ? `\n⏰ Start Time: ${formatTime(userSetting.startTime)}`
            : userSetting.endTime
                ? `\n⏰ End Time: ${formatTime(userSetting.endTime)}`
                : '';

    // The title of the message
    const uploadingVideoMessage = userSetting.videoFileId
    ? `📹 Video: ${userSetting.date || 'YYMMDD'} ${userSetting.title || 'Title'} (${userSetting.leader || 'Leader'})${timeInfo}\n\n🔐 Password: ${userSetting.password || '********'}\n🌍 Destination: ${destinationName || 'None'}`
    : '🚫 No video uploaded yet. Please upload a video to start.';

    // Generate the buttons
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
            Markup.button.callback('⏰ Edit Start Time', 'edit_start_time'),
            Markup.button.callback('⏰ Edit End Time', 'edit_end_time'),
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

            case 'start':
                // Validate and update the start time setting
                const startTime = parseTime(input);

                if (startTime !== null) {
                    userSetting.startTime = startTime;
                    showSettingsPanel(ctx, ctx.message.chat.id);
                } else {
                    ctx.reply('Invalid start time. Please enter a valid time in the format hh:mm or hh:mm:ss.');
                    ctx.reply('⏰ Please enter the start time:',
                        {
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: "Start Time",
                            },
                        });
                }
                break;

            case 'end':
                // Validate and update the end time setting
                const endTime = parseTime(input);

                if (endTime !== null) {
                    userSetting.endTime = endTime;
                    showSettingsPanel(ctx, ctx.message.chat.id);
                } else {
                    ctx.reply('Invalid end time. Please enter a valid time in the format hh:mm or hh:mm:ss.');
                    ctx.reply('⏰ Please enter the end time:',
                        {
                            reply_markup: {
                                force_reply: true,
                                input_field_placeholder: "End Time",
                            },
                        });
                }
                break;

            default:
                // Handle other settings if needed
                break;
        }
    }
}

// Function to parse time in hh:mm or hh:mm:ss format
function parseTime(input) {
    const timeRegex = /^(?:(\d{1,2}):)?([0-5]?\d)(?::([0-5]?\d))?$/;
    const match = input.match(timeRegex);

    if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;

        return hours * 3600 + minutes * 60 + seconds;
    }

    console.log("Couldn't match a time in hh:mm:ss or hh:mm format");

    return null;
}

// Function to format time in hh:mm:ss format
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
}

// Function to pad zero for single-digit numbers
function padZero(num) {
    return num.toString().padStart(2, '0');
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

// Function to cut the video using ffmpeg
async function cutVideo(inputPath, outputPath, startTime, endTime) {
    try {
        let command = `ffmpeg -i ${inputPath}`;

        if (startTime !== undefined) {
            command += ` -ss ${startTime}`;
        }

        if (endTime !== undefined) {
            command += ` -to ${endTime}`;
        }

        command += ` ${outputPath}`;

        await exec(command);
        console.log('Video cut successfully:', outputPath);
        return outputPath;
    } catch (error) {
        console.error('Error processing video:', error);
        throw error;
    }
}

async function processUpload(ctx) {
    const userId = getUserId(ctx);
    const chatId = ctx.chat.id;
    const userSetting = userSettings[userId];

    let progressMessage;

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

        // Cut the video based on start and end times
        const storagePath = path.join(__dirname, '..', 'video_store');
        const outputPath = `${storagePath}/${userSetting.videoFileId}_cut.mp4`;

        updateProgressMessage(chatId, progressBars[chatId].message_id, "Processing video...");
        await cutVideo(localFilePath, outputPath, userSetting.startTime, userSetting.endTime);
        console.log('Video cut successfully:', outputPath);

        // Upload the video to vimeo
        const vimeoUri = await uploadToVimeo(outputPath, userId, chatId, (percentage, uploadedMB, totalMB) => {
            const progressBar = generateProgressBar(percentage);

            const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
            updateProgressMessage(chatId, progressBars[chatId].message_id, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${totalMB.toFixed(2)} MB)\n${progressBar}`);
        });

        // Do something with the Vimeo URI (save it, send it in a message, etc.)
        await ctx.reply(`Video uploaded successfully. Vimeo link: https://vimeo.com/manage${vimeoUri}`);
        userSetting.vimeoLink = `https://vimeo.com/manage${vimeoUri}`;

        // Prompt user to send the link to the designated chatroom
        promptSendVideo(ctx);

        // Reset user settings
        // userSettings[userId] = {};

    } catch (error) {
        console.error('Error processing video:', error);
        ctx.reply('Error processing video. Please try again later.');

        //TODO: Deletion here
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
    const userId = getUserId(ctx);
    
    if (!userId || !userSettings[userId]) {
        console.error('Unable to determine user ID or user settings');
        return;
    }

    const destinationExists = userSettings[userId].destination !== undefined;

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

    const keyboardOptions = destinationExists
        ? sendLinkOptions
        : Markup.inlineKeyboard([
            [
                Markup.button.callback('Select Another Room', 'select_different_room'),
            ],
            [
                Markup.button.callback('❌ Cancel', 'cancel'),
            ]
        ]);

    const message = destinationExists
        ? 'Send the Vimeo link to the designated chatroom?'
        : 'Do you want to send the link to a chatroom?.';

    ctx.replyWithMarkdown(message, keyboardOptions);
}


function sendToDestination(ctx, chatId) {

    // Get the settings for the current video
    const userId = getUserId(ctx);
    const userSetting = userSettings[userId];

    // Generate the telegram message 
    var message = `${userSetting.date || 'YYMMDD'} ${userSetting.title || 'Title'} (${userSetting.leader || 'Leader'})
    ${userSetting.vimeoLink}
    Pass: ${userSetting.password}`;

    bot.telegram.sendMessage(chatId, message)

    ctx.reply(`Link has been sent to the chat`);

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

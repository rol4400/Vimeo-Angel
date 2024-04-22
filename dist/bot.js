"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default_pass = exports.sendToDestination = void 0;
const telegraf_1 = require("telegraf");
const deta_1 = require("deta");
const helpers_1 = require("./helpers");
const uploader_1 = require("./uploader");
const folder_watcher_1 = require("./folder-watcher");
const uuid_1 = require("uuid");
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const connect_busboy_1 = __importDefault(require("connect-busboy"));
require("dotenv/config.js");
const path_1 = __importDefault(require("path"));
const tcp_port_used_1 = __importDefault(require("tcp-port-used"));
const querystring_1 = __importDefault(require("querystring"));
// Default telegram bot handler
const bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN, {
    telegram: {
        apiRoot: `http://${process.env.BOT_URI}`
    }
});
// MTPROTO enabled Telegram User Client
// This gets past many restrictions such as the rate limiting on messages
// const apiId = parseInt(process.env.TELEGRAM_API_ID!);
// const apiHash = process.env.TELEGRAM_API_HASH!;
// const session = new StringSession(process.env.TELE_STR_SESSION);
// const user_bot = new TelegramClient(session, apiId, apiHash, {});
// Deta space data storage
const detaInstance = (0, deta_1.Deta)(); //instantiate with Data Key or env DETA_PROJECT_KEY
const configDb = detaInstance.Base("Configuration");
const queueDb = detaInstance.Base("QueuedFiles");
// // Telegram MTPROTO API Configuration
// import { Api, TelegramClient } from 'telegram';
// import { StringSession } from 'telegram/sessions';
// Store the user MTPROTO telegram clients for auth purposes
let userClients;
const userSettings = {};
// Define destinations to send messages to
var destinations;
// The default password for uploading videos
var default_pass;
// Initialisation
async function init() {
    // Populate the destinations array
    const resultDestination = await configDb.get("destinations");
    destinations = (resultDestination && resultDestination.value);
    // Get the default password
    const configDbPassInstance = await configDb.get("default-pass");
    exports.default_pass = default_pass = ((configDbPassInstance && configDbPassInstance.value)?.toString());
    // Populate the userClients array
    const resultUsers = await configDb.get("users");
    userClients = (resultUsers && resultUsers.value) || [{}];
}
init();
// Start the express server to listen to API requests
const app = (0, express_1.default)();
app.use((0, connect_busboy_1.default)({
    highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
}));
const uploadPath = path_1.default.join(__dirname, '..', 'uploads'); // Register the upload path
app.route('/getChats').get((_req, res, _next) => {
    res.send(destinations);
});
app.route('/upload').post((req, res, _next) => {
    console.log("Upload method called");
    req.pipe(req.busboy); // Pipe it trough busboy
    req.busboy.on('file', (_fieldname, file, fileInfo) => {
        console.log(`Upload of '${fileInfo.filename}' started`);
        const fileExt = fileInfo.filename.split('.').pop();
        const fileName = (0, uuid_1.v4)() + "." + fileExt;
        // Create a write stream of the new file
        const fstream = fs_1.default.createWriteStream(path_1.default.join(uploadPath, fileName));
        // Pipe it trough
        file.pipe(fstream);
        // On finish of the upload
        fstream.on('close', () => {
            console.log(`Upload of '${fileInfo.filename}' finished`);
            // Extract the chatroom number from the FormData
            const chatroomParam = req.query.chatroom?.toString();
            const chatroomId = chatroomParam ? chatroomParam.split(',')[1] : '';
            // Generate the complete file path
            const filePath = uploadPath + "/" + fileName;
            (0, folder_watcher_1.processNewlyDetectedFile)(bot, filePath, Number(chatroomId));
        });
    });
    req.busboy.on('finish', () => {
        console.log('File finished parsing');
        res.status(200).send('File uploaded successfully');
    });
    req.busboy.on('error', (err) => {
        console.error('Error during file upload:', err);
        res.status(500).send('Internal Server Error');
    });
});
// Middleware to check if the user has settings
bot.use((ctx, next) => {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId) {
        // Handle the case when userId is not available
        console.error('Unable to determine user ID');
        return;
    }
    if (!userSettings[userId]) {
        userSettings[userId] = {
            autocut: false
        };
    }
    return next();
});
// Start command handler
bot.start((ctx) => {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }
    if (!checkAuthenticated(ctx, userId)) {
        return;
    }
    ctx.reply('Welcome! Please upload a video file to start.');
});
function checkAuthenticated(ctx, userId) {
    if (userClients !== undefined) {
        const userData = userClients.find((user) => {
            return user.id == userId;
        });
        if (userData) {
            return true;
        }
    }
    ctx.reply("You are not authenticated to use this bot. Please contact an admin to undergo the authentication process");
    ctx.reply("Please give them this code: " + userId);
    return false;
}
// Function to handle new members (including the bot) joining a chat
bot.on('new_chat_members', (ctx) => {
    const chatId = ctx.message.chat.id;
    const chatName = ctx.message.chat.title;
    // Check if the bot is among the new members
    const botJoined = ctx.message.new_chat_members.some((member) => member.id === bot.botInfo.id);
    if (botJoined) {
        // Check if the chat is not already in destinations
        if (!destinations.some((dest) => dest[1] === chatId.toString())) {
            // Add the chat to destinations array
            destinations.push([chatName, chatId.toString()]);
            // Update the databse
            configDb.update({ value: destinations }, "destinations");
            // Log the addition
            console.log(`Bot added to group: ${chatName} (ID: ${chatId})`);
        }
    }
});
// Function to handle the bot being removed from a chat
bot.on('left_chat_member', (ctx) => {
    const chatId = ctx.message.chat.id;
    // Check if the bot is the one being removed
    if (ctx.message.left_chat_member.id === bot.botInfo.id) {
        // Remove the chat from destinations array
        destinations = destinations.filter((dest) => dest[1] !== chatId.toString());
        // Update the database
        configDb.update({ value: destinations }, "destinations");
        // Log the removal
        console.log(`Bot removed from group (ID: ${chatId})`);
    }
});
// Handle video messages
bot.on('video', (ctx) => {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }
    if (!checkAuthenticated(ctx, userId)) {
        return;
    }
    // Clear any previous videos
    userSettings[userId] = {
        autocut: false
    };
    // Save the video file id
    userSettings[userId].videoFileId = ctx.message.video.file_id;
    userSettings[userId].videoDuration = ctx.message.video.duration;
    // Show settings panel
    const chatId = ctx.message.chat.id;
    showSettingsPanel(ctx);
});
// Handle button clicks
bot.on('callback_query', (ctx) => {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }
    if (!checkAuthenticated(ctx, userId)) {
        return;
    }
    // Use type assertion to tell TypeScript that data exists
    const action = ctx.callbackQuery.data;
    // Handle destination selection
    var match = action.match(/select_destination_(.+)/);
    if (match && match[1]) {
        const destination = match[1];
        // Save the selected destination
        userSettings[userId].destination = destination;
        // Show settings panel
        showSettingsPanel(ctx);
        return;
    }
    // Handle directly sending to a destination
    match = action.match(/send_to_destination_(.+)/);
    if (match && match[1]) {
        const userId = (0, helpers_1.getUserId)(ctx);
        const destination = match[1];
        // Save the selected destination
        userSettings[userId].destination = destination;
        // Send the message
        sendToDestination(ctx, destination, false);
        return;
    }
    // Handle directly uploaded file selection
    match = action.match(/process_upload_(.+)/);
    if (match && match[1]) {
        const userId = (0, helpers_1.getUserId)(ctx);
        if (!userId) {
            console.error('Unable to determine user ID');
            return;
        }
        if (!checkAuthenticated(ctx, userId)) {
            return;
        }
        const filePath = querystring_1.default.unescape(match[1]);
        // Clear any previous videos
        userSettings[userId] = {
            autocut: false
        };
        // Save the video file id
        userSettings[userId].videoPath = filePath;
        userSettings[userId].videoFileId = path_1.default.basename(filePath); // The id is just the filename in this case
        // Show settings panel
        showSettingsPanel(ctx);
        return;
    }
    // Handle other simple actions
    switch (action) {
        case 'edit_date':
            ctx.reply('📅 Please enter the date in the format YYMMDD:', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "YYMMDD",
                },
            });
            break;
        case 'edit_password':
            ctx.reply('🔐 Please enter the password:', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Password",
                },
            });
            break;
        case 'edit_title':
            ctx.reply('📝 Please enter the title:', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Education Title",
                },
            });
            break;
        case 'edit_leader':
            ctx.reply('👤 Please enter the leader:', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Education Leader Name & Title",
                },
            });
            break;
        case 'autocut_sermon':
            // Save the selected destination
            userSettings[userId].autocut = !userSettings[userId].autocut;
            // Show settings panel
            showSettingsPanel(ctx);
            break;
        case 'edit_destination':
            ctx.reply('🌍 Please select a destination:', telegraf_1.Markup.inlineKeyboard(destinations.map((dest) => [telegraf_1.Markup.button.callback(`📍 ${dest[0]}`, `select_destination_${dest[1]}`)])));
            break;
        case 'select_different_room':
            ctx.reply('🌍 Please select a destination:', telegraf_1.Markup.inlineKeyboard(destinations.map((dest) => [telegraf_1.Markup.button.callback(`📍 ${dest[0]}`, `send_to_destination_${dest[1]}`)])));
            break;
        case 'edit_start_time':
            ctx.reply('⏰ Please enter the start time in the format hh:mm or hh:mm:ss.', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Start Time",
                },
            });
            break;
        case 'edit_end_time':
            ctx.reply('⏰ Please enter the end time in the format hh:mm or hh:mm:ss.', {
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
            if (userSettings[userId].title === undefined) {
                ctx.reply('Please at minimum set a title');
                return;
            }
            // Check if both start and end times are set
            if (userSettings[userId].startTime !== undefined && userSettings[userId].endTime !== undefined) {
                // Check if end time is after start time
                if (userSettings[userId].endTime <= userSettings[userId].startTime) {
                    ctx.reply('End time must be after start time. Please adjust your settings.');
                    return;
                }
                // Check if end time is within the duration of the video
                const videoDuration = userSettings[userId].videoDuration; // You need to implement a function to get the video duration
                if (userSettings[userId].endTime > videoDuration.toString()) {
                    ctx.reply('End time must be within the duration of the video. Please adjust your settings.');
                    return;
                }
            }
            // Perform the upload
            const success = (0, uploader_1.processUpload)(ctx, bot, userSettings, promptSendVideo, false);
            if (!success) {
                // Upload failed, ask if they should queue the file to try again later
                ctx.reply('⌚ Do you want to queue the upload for a later date and try again then?', telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('✅ Try again now', 'complete'),
                    // Markup.button.callback('⌚ Queue', 'queue'), TODO: Implement Queue
                    telegraf_1.Markup.button.callback('❌ Cancel', 'cancel'),
                ]));
            }
            break;
        case 'cancel':
            // Reset user settings
            userSettings[userId] = {
                autocut: false
            };
            ctx.reply("Cancelled. Please send me another video when you are ready");
            break;
        case 'queue':
            if (userSettings[userId].title === undefined) {
                ctx.reply('Please at minimum set a title');
                return;
            }
            // Check if both start and end times are set
            if (userSettings[userId].startTime !== undefined && userSettings[userId].endTime !== undefined) {
                // Check if end time is after start time
                if (userSettings[userId].endTime <= userSettings[userId].startTime) {
                    ctx.reply('End time must be after start time. Please adjust your settings.');
                    return;
                }
                // Check if end time is within the duration of the video
                const videoDuration = userSettings[userId].videoDuration; // You need to implement a function to get the video duration
                if (userSettings[userId].endTime > videoDuration.toString()) {
                    ctx.reply('End time must be within the duration of the video. Please adjust your settings.');
                    return;
                }
            }
            // Ask the user for when they want to queue the upload for
            ctx.reply('⏰ Please enter the time or date of when you want to upload the video', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "End Date or Time",
                },
            });
            break;
        case 'send_link':
            // Send the link to the specified destination
            sendToDestination(ctx, userSettings[userId].destination, false);
            break;
        default:
            console.log("DEFAULT");
            console.log(action);
            break;
    }
});
// Handle text messages
bot.on('text', (ctx) => {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }
    if (!checkAuthenticated(ctx, userId)) {
        return;
    }
    if (!(userSettings[userId].videoFileId || userSettings[userId].videoPath)) {
        ctx.reply("Please upload a video file here before I can do anything");
        return;
    }
    // Handle specific setting inputs
    handleSettingInput(ctx, userId);
});
// Function to show the settings panel
function showSettingsPanel(ctx) {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }
    const userSetting = userSettings[userId];
    const destinationName = (destinations.find(([_, id]) => id === userSetting.destination) ?? [])[0] ?? '';
    // Include information about start and end times
    const timeInfo = userSetting.startTime && userSetting.endTime
        ? `\n⏰ Start Time: ${(0, helpers_1.formatTime)(userSetting.startTime)}\n⏰ End Time: ${(0, helpers_1.formatTime)(userSetting.endTime)}`
        : userSetting.startTime
            ? `\n⏰ Start Time: ${(0, helpers_1.formatTime)(userSetting.startTime)}`
            : userSetting.endTime
                ? `\n⏰ End Time: ${(0, helpers_1.formatTime)(userSetting.endTime)}`
                : '';
    // Get the date with default option
    const formattedDate = userSetting.date || (0, uploader_1.getCurrentDate)();
    // The title of the message
    const uploadingVideoMessage = (userSetting.videoFileId || userSetting.videoPath)
        ? `📹 Video: ${formattedDate} ${userSetting.title || 'Title'} (${userSetting.leader || 'Leader'})${timeInfo}\n\n🔐 Password: ${userSetting.password || '********'}\n🌍 Destination: ${destinationName || 'None'}\n✂️ Autocut Sermon: ${userSetting.autocut || 'None'}`
        : '🚫 No video uploaded yet. Please upload a video to start.';
    // Generate the buttons
    ctx.reply(uploadingVideoMessage, telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('📅 Edit Date', 'edit_date'),
            telegraf_1.Markup.button.callback('🔐 Edit Password', 'edit_password'),
        ],
        [
            telegraf_1.Markup.button.callback('📝 Edit Title', 'edit_title'),
            telegraf_1.Markup.button.callback('👤 Edit Leader', 'edit_leader'),
        ],
        [
            telegraf_1.Markup.button.callback('⏰ Edit Start Time', 'edit_start_time'),
            telegraf_1.Markup.button.callback('⏰ Edit End Time', 'edit_end_time'),
        ],
        [
            telegraf_1.Markup.button.callback('✂️ Autocut Sermon', 'autocut_sermon'),
        ],
        [
            telegraf_1.Markup.button.callback('🌍 Edit Destination', 'edit_destination'),
        ],
        [
            telegraf_1.Markup.button.callback('✅ Complete', 'complete'),
            // Markup.button.callback('⌚ Queue', 'queue'), TODO: Implement Queue
            telegraf_1.Markup.button.callback('❌ Cancel', 'cancel'),
        ],
    ]));
}
// Function to handle setting inputs
async function handleSettingInput(ctx, userId) {
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
    await updateSetting(ctx, userId, lowercaseInput, match);
}
// Function to update specific settings
async function updateSetting(ctx, userId, input, match) {
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
                if (/^\d{6}$/.test(input) &&
                    year >= 40 &&
                    month >= 1 && month <= 12 && // Validating month
                    day >= 1 && day <= new Date(year + 2000, month, 0).getDate() // Validating day based on the month
                ) {
                    userSetting.date = input;
                    showSettingsPanel(ctx);
                }
                else {
                    ctx.reply('Invalid date format. You must use the format YYMMDD.');
                    ctx.reply('📅 Please enter the date:', {
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: "YYMMDD",
                        },
                    });
                }
                break;
            case 'password':
                // Update the password setting
                userSetting.password = input;
                showSettingsPanel(ctx);
                break;
            case 'title':
                // Update the title setting
                userSetting.title = input;
                showSettingsPanel(ctx);
                break;
            case 'leader':
                // Update the leader setting
                userSetting.leader = input;
                showSettingsPanel(ctx);
                break;
            case 'start':
                // Validate and update the start time setting
                const startTime = (0, helpers_1.parseTime)(input);
                if (startTime !== null) {
                    userSetting.startTime = startTime.toString();
                    showSettingsPanel(ctx);
                }
                else {
                    ctx.reply('Invalid start time. Please enter a valid time in the format hh:mm or hh:mm:ss.');
                    ctx.reply('⏰ Please enter the start time:', {
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: "Start Time",
                        },
                    });
                }
                break;
            case 'end':
                // Validate and update the end time setting
                const endTime = (0, helpers_1.parseTime)(input);
                if (endTime !== null) {
                    userSetting.endTime = endTime.toString();
                    showSettingsPanel(ctx);
                }
                else {
                    ctx.reply('Invalid end time. Please enter a valid time in the format hh:mm or hh:mm:ss.');
                    ctx.reply('⏰ Please enter the end time:', {
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: "End Time",
                        },
                    });
                }
                break;
            case 'time':
                try {
                    // Enqueue the file
                    ctx.reply('Uploading the video to storage, please wait...');
                    await (0, uploader_1.enqueueFile)(ctx, userId.toString(), userSettings, input, queueDb, bot);
                    ctx.reply('Successfully queued the file for upload');
                }
                catch (error) {
                    ctx.reply('Error queueing the file, please check the date or time you gave is a valid future date');
                    console.log(error);
                    return;
                }
                break;
            default:
                // Handle other settings if needed
                break;
        }
    }
}
// Function to prompt where to send the video
function promptSendVideo(ctx) {
    const userId = (0, helpers_1.getUserId)(ctx);
    if (!userId || !userSettings[userId]) {
        console.error('Unable to determine user ID or user settings');
        return;
    }
    const destinationExists = userSettings[userId].destination !== undefined;
    // Send the link automatically if we have a destination set to send to
    if (destinationExists) {
        sendToDestination(ctx, userSettings[userId].destination, false);
    }
    // Prompt user to send the link to the designated chatroom
    const keyboardOptions = telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('Send to a Room', 'select_different_room'),
        ],
        [
            telegraf_1.Markup.button.callback('❌ Cancel', 'cancel'),
        ]
    ]);
    const message = destinationExists
        ? 'Link sent to the designated chatroom. Do you want to send to another?'
        : 'Do you want to send the link to a chatroom?';
    ctx.replyWithMarkdown(message, keyboardOptions);
}
function sendToDestination(ctx, chatId, silent) {
    // Get the settings for the current video
    const userId = (0, helpers_1.getUserId)(ctx);
    const userSetting = userSettings[userId];
    // Format the name of the video
    const currentDate = new Date();
    const sYear = currentDate.getFullYear() - 1984 + 1; // +1 because we count from 0 XD;
    const formattedDate = userSetting.date || `${sYear}${(currentDate.getMonth() + 1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}`;
    const leaderText = userSetting.leader ? ` (${userSetting.leader})` : '';
    const name = `${formattedDate} ${userSetting.title || 'Title'}${leaderText}`;
    // Generate the telegram message 
    var message = `<${name}>
${userSetting.vimeoLink}
Pass: ${userSetting.password || default_pass}`;
    bot.telegram.sendMessage(chatId, message);
    if (!silent)
        ctx.reply(`Link has been sent to the chat`);
}
exports.sendToDestination = sendToDestination;
// Start the bot and express server
tcp_port_used_1.default.check(3000, 'localhost').then(function (inUse) {
    if (!inUse) {
        console.log("Port 3000 is not in use");
        app.listen(3000, () => console.log('API listening on port 3000'));
        bot.launch();
        // Start the file watcher on the configured path
        (0, folder_watcher_1.startFileWatcher)(bot, process.env.WATCH_PATH);
    }
    else {
        console.warn("Port 3000 is in use");
    }
}, function (err) {
    console.error('Error on check:', err.message);
});
//# sourceMappingURL=bot.js.map
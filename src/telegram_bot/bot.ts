import { Telegraf, Markup } from 'telegraf';
import { Deta } from 'deta';
import { getUserId, formatTime, parseTime} from "./helpers"
import { processUpload, enqueueFile } from "./uploader"
import { v4 as uuidv4 } from 'uuid';

import fs from 'fs';
import express from 'express';
import busboy from 'connect-busboy';

import "dotenv/config.js";
import path from 'path';

const genThumbnail = require('simple-thumbnail')

const bot = new Telegraf(process.env.BOT_TOKEN!, {
    telegram: {
      apiRoot: `http://${process.env.BOT_URI}`
    }
  });

// Deta space data storage
const detaInstance = Deta();  //instantiate with Data Key or env DETA_PROJECT_KEY
const configDb = detaInstance.Base("Configuration");
const queueDb = detaInstance.Base("QueuedFiles");
const filesDb = detaInstance.Drive("FileStorage");

// // Telegram MTPROTO API Configuration
// import { Api, TelegramClient } from 'telegram';
// import { StringSession } from 'telegram/sessions';

// Store the user MTPROTO telegram clients for auth purposes
let userClients:any;

// Store user settings that have been applied to each video
interface UserSetting {
    date?: string;
    password?: string;
    title?: string;
    leader?: string;
    startTime?: string;
    endTime?: string;
    videoFileId?: string;
    videoDuration?: number;
    destination?: string;
    phoneNumber?: string; 
    vimeoLink?: string;
    videoPath?: string;
}
interface UserSettings {
    [userId: string]: UserSetting;
}

const userSettings: UserSettings = {};

// Define destinations to send messages to
var destinations:any;

// Initialisation
async function init() {

    // Populate the destinations array
    const resultDestination = await configDb.get("destinations");
    destinations = (resultDestination && resultDestination.value);

    // Populate the userClients array
    const resultUsers = await configDb.get("users");
    userClients = (resultUsers && resultUsers.value) || [{}];
}
init();

// Start the express server to listen to API requests
const app = express();
app.use(busboy({
    highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
}));

const uploadPath = path.join(__dirname, '..', 'uploads'); // Register the upload path

app.route('/upload').post((req, res, _next) => {
 
    req.pipe(req.busboy); // Pipe it trough busboy
 
    req.busboy.on('file', (_fieldname, file, fileInfo) => {
        console.log(`Upload of '${fileInfo.filename}' started`);
 
        const fileExt = fileInfo.filename.split('.').pop();
        const fileName = uuidv4() + fileExt;

        // Create a write stream of the new file
        const fstream = fs.createWriteStream(path.join(uploadPath, fileName));

        // Pipe it trough
        file.pipe(fstream);
 
        // On finish of the upload
        fstream.on('close', () => {
            console.log(`Upload of '${fileInfo.filename}' finished`);


            // Generate the thumbnail
            genThumbnail(uploadPath + "/" + fileName, uploadPath + "/" + fileName + ".png" , '250x?', {
                seek: "00:00:10.00"
            }).then(() => {
                console.log('done!')

                // Prompt the user to edit the file
                bot.telegram.sendPhoto("-4061080652", { source: uploadPath + "/" + fileName + ".png"  }).then(() => {
                    bot.telegram.sendMessage("-4061080652", "A file has been uploaded. Whoever wants to process it please click here", {
                        reply_markup: {
                          inline_keyboard: [
                            [
                              { text: '🙋 Process File', callback_data: 'process_upload_' + fileName },
                            ]
                          ],
                        }
                    });
                    res.sendStatus(200);
                });
    
            })

        });
    });
});

// Middleware to check if the user has settings
bot.use((ctx:any, next:any) => {
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
bot.start((ctx:any) => {

    const userId = getUserId(ctx);
  
    if (!userId) {
      console.error('Unable to determine user ID');
      return;
    }

    if (!checkAuthenticated(ctx, userId)) { return; }

    ctx.reply('Welcome! Please upload a video file to start.');
});

function checkAuthenticated(ctx:any, userId:string) {

    if (userClients !== undefined) {
        const userData = userClients.find((user:any) => {
            return user.id == userId;
        });
    
        if (userData) { return true; }
    }

    ctx.reply("You are not authenticated to use this bot. Please contact an admin to undergo the authentication process");
    ctx.reply("Please give them this code: " + userId);
    return false;
}

// bot.command('authenticate', async (ctx) => {
//     const userId = getUserId(ctx);
  
//     if (!userId) {
//       console.error('Unable to determine user ID');
//       return;
//     }

//     // const sessionString = userClients[userId] = client;
//     // const session = new StringSession(sessionString);
//     // var client = new TelegramClient(session, apiId, apiHash, {})

//     // await client.connect();

//     // await userClients[userId].sendCode("+61499561660").catch((error) => {
//     //     console.error('Error during phone code request:', error);
//     // });
    
  
//     // Prompt the user to enter their phone number
//     ctx.reply('📞 Please enter the phone number of this device (e.g. +61499 xxx xxx):',
//     {
//         reply_markup: {
//             force_reply: true,
//             input_field_placeholder: "Please use international format (e.g. +61499 xxx xxx)",
//         },
//     },);
// });  

// Function to handle new members (including the bot) joining a chat
bot.on('new_chat_members', (ctx:any) => {
    const chatId = ctx.message.chat.id;
    const chatName = (ctx.message.chat as any).title; 

    // Check if the bot is among the new members
    const botJoined = ctx.message.new_chat_members.some((member:any) => member.id === bot.botInfo!.id);

    if (botJoined) {
        // Check if the chat is not already in destinations
        if (!destinations.some((dest:any) => dest[1] === chatId.toString())) {
            
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

  if (!checkAuthenticated(ctx, userId)) { return; }

  // Clear any previous videos
  userSettings[userId] = {};
  
  // Save the video file id
  userSettings[userId].videoFileId = ctx.message.video.file_id;
  userSettings[userId].videoDuration = ctx.message.video.duration;
  
  // Show settings panel
  const chatId = ctx.message.chat.id;
  showSettingsPanel(ctx);
});

// Handle button clicks
bot.on('callback_query', (ctx:any) => {
    const userId = getUserId(ctx);
    if (!userId) {
      console.error('Unable to determine user ID');
      return;
    }

    if (!checkAuthenticated(ctx, userId)) { return; }
  
    // Use type assertion to tell TypeScript that data exists
    const action = (ctx.callbackQuery as any).data;

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
        const userId = getUserId(ctx);

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
        const userId = getUserId(ctx);

        if (!userId) {
            console.error('Unable to determine user ID');
            return;
        }
        
        if (!checkAuthenticated(ctx, userId)) { return; }
        
        const fileName = match[1];

        // Clear any previous videos
        userSettings[userId] = {};
        
        // Save the video file id
        userSettings[userId].videoPath = uploadPath + "/" + fileName;
        userSettings[userId].videoFileId = fileName; // The id is just the filename in this case
        
        // Show settings panel
        showSettingsPanel(ctx);
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
            destinations.map((dest:any) => [Markup.button.callback(`📍 ${dest[0]}`, `select_destination_${dest[1]}`)])
            ));
            break;

        case 'select_different_room':
            ctx.reply('🌍 Please select a destination:', Markup.inlineKeyboard(
                destinations.map((dest:any) => [Markup.button.callback(`📍 ${dest[0]}`, `send_to_destination_${dest[1]}`)])
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

            if (userSettings[userId].title === undefined) {
                ctx.reply('Please at minimum set a title');
                return;
            }

            // Check if both start and end times are set
            if (userSettings[userId].startTime !== undefined && userSettings[userId].endTime !== undefined) {
                // Check if end time is after start time
                if (userSettings[userId].endTime! <= userSettings[userId].startTime!) {
                    ctx.reply('End time must be after start time. Please adjust your settings.');
                    return;
                }

                // Check if end time is within the duration of the video
                const videoDuration = userSettings[userId].videoDuration; // You need to implement a function to get the video duration
                if (userSettings[userId].endTime! > videoDuration!.toString()) {
                    ctx.reply('End time must be within the duration of the video. Please adjust your settings.');
                    return;
                }
            }

            // Perform the upload
            const success = processUpload(ctx, bot, userSettings, promptSendVideo, false);
            if (!success) {

                // Upload failed, ask if they should queue the file to try again later
                ctx.reply('⌚ Do you want to queue the upload for a later date and try again then?', Markup.inlineKeyboard([
                    Markup.button.callback('✅ Try again now', 'complete'),
                    Markup.button.callback('⌚ Queue', 'queue'),
                    Markup.button.callback('❌ Cancel', 'cancel'),
                ]));
            }
            break;

        case 'cancel':
            // Reset user settings
            userSettings[userId] = {};
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
                if (userSettings[userId].endTime! <= userSettings[userId].startTime!) {
                    ctx.reply('End time must be after start time. Please adjust your settings.');
                    return;
                }

                // Check if end time is within the duration of the video
                const videoDuration = userSettings[userId].videoDuration; // You need to implement a function to get the video duration
                if (userSettings[userId].endTime! > videoDuration!.toString()) {
                    ctx.reply('End time must be within the duration of the video. Please adjust your settings.');
                    return;
                }
            }

            // Ask the user for when they want to queue the upload for
            ctx.reply('⏰ Please enter the time or date of when you want to upload the video',
                {
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "End Date or Time",
                    },
                });

            break;

        case 'send_link':
            // Send the link to the specified destination
            sendToDestination(ctx, userSettings[userId].destination!, false);
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
    
    if (!checkAuthenticated(ctx, userId)) { return; }

    if (!(userSettings[userId].videoFileId || userSettings[userId].videoPath)) {
        ctx.reply("Please upload a video file here before I can do anything");
        return;
    }

    // Handle specific setting inputs
    handleSettingInput(ctx, userId);
});

// Function to show the settings panel
function showSettingsPanel(ctx:any) {
    const userId = getUserId(ctx);
    if (!userId) {
        console.error('Unable to determine user ID');
        return;
    }

    const userSetting = userSettings[userId];

    const destinationName = (destinations.find(([_, id]: any) => id === userSetting.destination) ?? [])[0] ?? '';

    
    // Include information about start and end times
    const timeInfo = userSetting.startTime && userSetting.endTime
        ? `\n⏰ Start Time: ${formatTime(userSetting.startTime)}\n⏰ End Time: ${formatTime(userSetting.endTime)}`
        : userSetting.startTime
            ? `\n⏰ Start Time: ${formatTime(userSetting.startTime)}`
            : userSetting.endTime
                ? `\n⏰ End Time: ${formatTime(userSetting.endTime)}`
                : '';

    // The title of the message
    const uploadingVideoMessage = (userSetting.videoFileId || userSetting.videoPath)
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
            Markup.button.callback('⌚ Queue', 'queue'),
            Markup.button.callback('❌ Cancel', 'cancel'),
        ],
    ]));
}

// Function to handle setting inputs
async function handleSettingInput(ctx:any, userId:number) {
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
async function updateSetting(ctx:any, userId:number, input:string, match:string) {
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
                    showSettingsPanel(ctx);
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
                const startTime = parseTime(input);

                if (startTime !== null) {
                    userSetting.startTime = startTime.toString();
                    showSettingsPanel(ctx);
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
                    userSetting.endTime = endTime.toString();
                    showSettingsPanel(ctx);
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

            case 'time':

                try {
                    // Enqueue the file
                    ctx.reply('Uploading the video to storage, please wait...');

                    await enqueueFile(ctx, userId.toString(), userSettings, input, queueDb, bot);

                    ctx.reply('Successfully queued the file for upload');
                } catch (error) {
                    ctx.reply('Error queueing the file, please check the date or time you gave is a valid future date');
                    console.log(error)
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
function promptSendVideo(ctx:any) {
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
                Markup.button.callback('Send to a Room', 'select_different_room'),
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


function sendToDestination(ctx:any, chatId:string, silent:boolean) {

    // Get the settings for the current video
    const userId = getUserId(ctx);
    const userSetting = userSettings[userId];
    
    // Format the name of the video
    const currentDate = new Date();
    const sYear = currentDate.getFullYear() - 1984;

    const formattedDate = userSetting.date || `${sYear}${(currentDate.getMonth() + 1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}`;
    const leaderText = userSetting.leader ? ` (${userSetting.leader})` : '';

    const name = `${formattedDate} ${userSetting.title || 'Title'}${leaderText}`;

    // Generate the telegram message 

    var message = `<${name}>
${userSetting.vimeoLink}
Pass: ${userSetting.password || "<<default password>>"}`;

    bot.telegram.sendMessage(chatId, message)

    if (!silent) ctx.reply(`Link has been sent to the chat`);

}

// Start the bot and express server
app.listen(3000, () => console.log('API listening on port 3000'));
bot.launch();

export { UserSettings, UserSetting, sendToDestination }
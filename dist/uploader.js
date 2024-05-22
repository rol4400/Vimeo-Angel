"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editVideo = exports.sendVideoToChat = exports.getCurrentDate = exports.enqueueFile = exports.processUpload = void 0;
const axios_1 = __importDefault(require("axios"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const helpers_1 = require("./helpers");
const fs_1 = __importDefault(require("fs"));
const fs_2 = require("fs");
const path_1 = __importDefault(require("path"));
const bot_1 = require("./bot");
const scene_analysis_1 = require("./scene-analysis");
const chrono = __importStar(require("chrono-node"));
const cron_1 = require("cron");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const querystring_1 = __importDefault(require("querystring"));
const exec = (0, util_1.promisify)(child_process_1.exec);
// Vimeo client credentials
const vimeo_1 = require("vimeo");
// import Deta from 'deta/dist/types/deta';
const vimeoClient = new vimeo_1.Vimeo(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.ACCESS_TOKEN);
// Store message IDs and chat IDs for progress bars
const progressBars = [{}];
// For getting a file path to a file uploaded to the telegram bot API
async function getFilePath(userSettings, userId) {
    const userSetting = userSettings[userId];
    // Check if we already have a file path set
    if (userSetting.videoPath) {
        return userSetting.videoPath;
    }
    else {
        const maxAttempts = 5;
        let attempts = 0;
        while (attempts < maxAttempts) {
            try {
                const url = `http://${process.env.BOT_URI}/bot${process.env.BOT_TOKEN}/getFile?file_id=${userSetting.videoFileId}`;
                const file = await axios_1.default.get(url, {
                    // Adjust timeout as needed, set to 0 for no timeout
                    timeout: 0,
                });
                console.log("GetFile Telegram Upload Response Received");
                const inputPath = `${file.data.result.file_path}`;
                return inputPath;
            }
            catch (error) {
                // Handle errors here
                console.error('Error fetching file:', error);
                attempts++;
            }
        }
        throw new Error("Failed to download the video file from telegram after multiple attempts");
    }
}
// Enqueue a file for later processing
async function enqueueFile(ctx, userId, userSettings, processingTime, queueDb, bot) {
    try {
        // Setup input variables
        const filePath = await getFilePath(userSettings, userId);
        const fileKey = querystring_1.default.escape(filePath);
        const fileSettings = userSettings[userId];
        // Generate the date of processing using natural language
        const parsedDate = chrono.casual.parseDate(processingTime, new Date(), { forwardDate: true });
        console.log("Queueing job for:");
        console.log(parsedDate);
        // Construct a QueueItem to store the required information in the queue
        const item = {
            userId,
            fileSettings,
            filePath,
            fileKey,
            processingTime: parsedDate.getTime(), // Store processing time as a timestamp
            status: 'queued',
        };
        await queueDb.insert(item);
        // Schedule a processing job at the specified processing time
        const job = new cron_1.CronJob(parsedDate, async () => {
            console.log("Running queued job...");
            try {
                // Retrieve the first file from the database with 'queued' status
                const fileToUpdate = await queueDb.fetch({ userId, status: 'queued' }, { limit: 1 });
                if (fileToUpdate.items.length > 0) {
                    const file = fileToUpdate.items[0];
                    // Check if file is not undefined before updating
                    if (file) {
                        // Update the status to 'processing'
                        file.status = 'processing';
                        await queueDb.update(file, fileToUpdate.last);
                        console.log("Running queued file:");
                        console.log(file);
                        // Process the queued file
                        await processQueuedFile(ctx, bot, queueDb, userSettings);
                        // The cron job will only process one file at a time
                        // Delete the processed item from the database
                        await queueDb.delete(fileToUpdate.last);
                    }
                }
            }
            catch (error) {
                console.error('Error processing queued file:', error);
                // Handle the error as needed
            }
        });
        // Start the cron job
        job.start();
    }
    catch (error) {
        console.error("Error in Enqueuing the File: " + error);
    }
}
exports.enqueueFile = enqueueFile;
// Function to process a queued file
async function processQueuedFile(ctx, bot, queueDb, userSettings) {
    const currentTime = (new Date()).getTime();
    // Retrieve items that need processing
    const itemsToProcess = (await queueDb.fetch({
        "processingTime?lte": currentTime,
        "status": 'queued',
    })).items;
    console.log("Items to process");
    console.log(itemsToProcess);
    // Process each item
    for (const item of itemsToProcess) {
        // Implement your file processing logic here
        processUpload(ctx, bot, userSettings, () => { }, true);
        // Update item status to 'processed' in the Deta Base collection
        // await configDb.update({ status: 'processed' }, (item.userId!) as string);
        await queueDb.delete((item.userId));
    }
}
// Gets the current date in S years
function getCurrentDate() {
    const currentDate = new Date();
    const sYear = currentDate.getFullYear() - 1984 + 1; // +1 because we count from 0 XD
    return `${sYear}${(currentDate.getMonth() + 1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}`;
}
exports.getCurrentDate = getCurrentDate;
// Function to upload video to Vimeo with progress bar
async function uploadToVimeo(localFilePath, userId, chatId, userSettings, progressCallback, retryCount = 5) {
    return new Promise(async (resolve, reject) => {
        // Get the user settings
        const userSetting = userSettings[userId];
        // Format the name of the video
        const formattedDate = userSetting.date || getCurrentDate();
        const leaderText = userSetting.leader ? ` (${userSetting.leader})` : '';
        const name = `${formattedDate} ${userSetting.title || 'Title'}${leaderText}`;
        const uploadFunction = async () => {
            try {
                const videoUpload = await vimeoClient.upload(localFilePath, {
                    name: name,
                    description: `Uploaded on ${new Date().toLocaleDateString()}`,
                }, async function (uri) {
                    // Complete callback
                    // Set privacy settings with the provided password
                    const password = userSetting.password || bot_1.default_pass;
                    const video_id = uri.split('/').pop();
                    console.log('Video uploaded successfully. Vimeo link: https://vimeo.com/' + video_id);
                    await setPrivacySettings(video_id, password);
                    resolve(video_id);
                }, function (bytes_uploaded, bytes_total) {
                    // Progress callback
                    const totalMB = bytes_total / (1024 * 1024);
                    const uploadedMB = !isNaN(parseFloat(bytes_uploaded.toString())) ? bytes_uploaded / (1024 * 1024) : 'N/A';
                    const percentage = ((bytes_uploaded / bytes_total) * 100).toFixed(2);
                    progressCallback(percentage, uploadedMB, totalMB);
                }, function (error) {
                    // Error callback
                    console.error('Vimeo upload error:', error);
                    throw error;
                });
            }
            catch (error) {
                if (retryCount > 0) {
                    console.log(`Retrying upload due to error: ${error.code}. Retries left: ${retryCount}`);
                    await uploadToVimeo(localFilePath, userId, chatId, userSettings, progressCallback, retryCount - 1);
                }
                else {
                    console.error('Error uploading video to Vimeo:', error);
                    reject(error);
                }
            }
        };
        // Initial upload attempt
        await uploadFunction();
    });
}
async function deleteLocalFile(filePath, chatId) {
    console.log("Deleting file: " + filePath);
    try {
        await fs_1.default.unlink(filePath, (err) => {
            if (err)
                throw err;
            console.log('Local file deleted successfully:', filePath);
        });
    }
    catch (deleteError) {
        console.log('Error deleting local file:', deleteError);
    }
    // Reset the progress bars
    progressBars[chatId] = [];
}
// Function to set privacy settings for the video on Vimeo
async function setPrivacySettings(videoId, password) {
    if (password === undefined || password == "") {
        return Promise.resolve("Password is undefined or blank, skipping update.");
    }
    return new Promise((resolve, reject) => {
        function attempt(retriesLeft) {
            try {
                vimeoClient.request({
                    method: 'PATCH',
                    path: `/videos/${videoId}`,
                    query: {
                        password: password,
                        privacy: {
                            view: 'password',
                        },
                    },
                }, function (error, body, _status_code, _headers) {
                    if (error) {
                        console.log('Vimeo set privacy settings error:', error);
                        if (retriesLeft > 0) {
                            console.log(`Retrying... ${retriesLeft} retries left.`);
                            setTimeout(() => attempt(retriesLeft - 1), 15000);
                        }
                        else {
                            reject(error);
                        }
                    }
                    else {
                        resolve(body);
                    }
                });
            }
            catch (error) {
                setTimeout(() => attempt(retriesLeft - 1), 15000);
            }
        }
        attempt(10);
    });
}
// Function to cut and compress the video using fluent-ffmpeg
async function editVideo(inputPath, outputPath, chatId, bot, startTime, endTime) {
    try {
        let command = (0, fluent_ffmpeg_1.default)(inputPath);
        if (startTime) {
            command = command.seekInput(startTime);
        }
        if (endTime) {
            command = command.duration(endTime);
        }
        command = command.output(outputPath);
        // Set video codec to libx265 with CRF for compression
        command = command.videoCodec('libx265').addOption('-crf', '28');
        command = command
            .outputOptions([
            '-preset veryfast', // Use a faster preset for encoding
            '-movflags +faststart' // Enable faststart for better streaming
        ]);
        // Attach progress callback
        command.on('progress', (progress) => {
            const percentage = progress.percent.toFixed(2);
            const progressBar = generateProgressBar(parseFloat(percentage));
            // Update the progress message
            updateProgressMessage(chatId, bot, `Cutting and compressing video... ${percentage}%\n${progressBar}`);
        });
        await new Promise((resolve, reject) => {
            command.on('end', async () => {
                // Once video processing is complete, send the file to the chat
                try {
                    resolve(true);
                }
                catch (error) {
                    reject(error);
                }
            }).on('error', reject).run();
        });
        console.log('Video processed successfully:', outputPath);
        return outputPath;
    }
    catch (error) {
        console.error('Error processing video:', error);
        throw error;
    }
}
exports.editVideo = editVideo;
async function sendVideoToChat(filePath, chatId, bot, message) {
    try {
        await bot.telegram.sendMessage(chatId, "Processing video for telegram...");
        const stream = (0, fs_2.createReadStream)(filePath);
        // Use Telegram Bot API to send the file to the chat
        await bot.telegram.sendVideo(chatId, { source: stream }, { caption: message });
    }
    catch (error) {
        console.error('Error sending video to chat:', error);
        throw error;
    }
}
exports.sendVideoToChat = sendVideoToChat;
async function processUpload(ctx, bot, userSettings, promptSendVideo, silent) {
    const userId = (0, helpers_1.getUserId)(ctx);
    const chatId = ctx.chat.id;
    const userSetting = userSettings[userId];
    let progressMessage;
    console.log("Processing upload");
    try {
        // Check if progress message has been sent
        if (!progressBars[chatId] || !progressBars[chatId].message_id) {
            if (!silent) {
                progressMessage = await ctx.reply('Uploading Video... Please keep telegram open and connected');
                progressBars[chatId] = { message_id: progressMessage.message_id };
            }
        }
        const inputPath = await getFilePath(userSettings, userId);
        // Cut the video based on start and end times
        const outputStoragePath = path_1.default.join(__dirname, '..', 'uploads');
        const outputPath = `${outputStoragePath}/${userSetting.videoFileId}_cut.mp4`;
        const outputAutocutPath = `${outputStoragePath}/${userSetting.videoFileId}_autocut.mp4`;
        if (!silent)
            updateProgressMessage(chatId, bot, "Cutting and compressing video...");
        await editVideo(inputPath, outputPath, chatId, bot, userSetting.startTime, userSetting.endTime).then(async (resultPath) => {
            await sendVideoToChat(resultPath, chatId, bot, "Processed Video File");
            // Upload the video to vimeo
            const vimeoUri = await uploadToVimeo(resultPath, userId, chatId, userSettings, async (percentage, uploadedMB, totalMB) => {
                const progressBar = generateProgressBar(percentage);
                const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
                if (!silent)
                    updateProgressMessage(chatId, bot, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${parseFloat(totalMB).toFixed(2)} MB)\n${progressBar}`);
            });
            // Extract the main sermon part to send separately
            if (userSetting.autocut == true) {
                await (0, scene_analysis_1.extractMainSermon)(resultPath, outputAutocutPath, chatId, bot, async (progress) => {
                    const percentage = progress.toFixed(2);
                    const progressBar = generateProgressBar(parseFloat(percentage));
                    // Update the progress message
                    if (!silent)
                        updateProgressMessage(chatId, bot, `Analysing Sermon... ${percentage}%\n${progressBar}`);
                });
            }
            // Do something with the Vimeo URI (save it, send it in a message, etc.)
            if (!silent) {
                sendWithRetry(ctx, `Video uploaded successfully. Vimeo link: https://vimeo.com/${vimeoUri}`);
            }
            userSetting.vimeoLink = `https://vimeo.com/${vimeoUri}`;
            // Prompt user to send the link to the designated chatroom
            if (!silent) {
                promptSendVideo(ctx);
            }
            else {
                // Since it's in silent mode, we will just automatically send the message
                const destinationExists = userSettings[userId].destination !== undefined;
                if (destinationExists) {
                    (0, bot_1.sendToDestination)(ctx, userSettings[userId].destination, true);
                }
                else {
                    (0, bot_1.sendToDestination)(ctx, "-4061080652", true); // Default destination is the Vimeo Angel Admin Room
                }
            }
            // Delete the local file after the upload is complete
            await deleteLocalFile(outputPath, chatId);
        });
        return true;
    }
    catch (error) {
        console.error('Error processing video:', error);
        if (!silent)
            ctx.reply('Error processing video. Please try again later.');
        // TODO: Proper deletion cleanup here
        return false;
    }
}
exports.processUpload = processUpload;
// Function to generate a simple ASCII progress bar
function generateProgressBar(progress) {
    const numericProgress = parseFloat(progress.toString());
    if (isNaN(numericProgress) || numericProgress < 0 || numericProgress > 100) {
        return 'Invalid progress value';
    }
    const barLength = 15;
    const completed = Math.round(barLength * (numericProgress / 100));
    const remaining = barLength - completed;
    const progressBar = '█'.repeat(Math.max(completed, 0)) + '░'.repeat(Math.max(remaining, 0));
    return `[${progressBar}]`;
}
// Function to update progress message using editMessageText
let lastUpdateTimestamp = 0;
let minIntervalMs = 3500;
async function updateProgressMessage(chatId, bot, text) {
    try {
        const currentTime = Date.now();
        // Check if the minimum interval has passed since the last update
        if (currentTime - lastUpdateTimestamp >= minIntervalMs) {
            lastUpdateTimestamp = currentTime;
            if (!progressBars[chatId]) {
                progressBars[chatId] = {};
            }
            if (progressBars[chatId].message_id) {
                // If message_id is defined, edit the existing message
                await bot.telegram.editMessageText(chatId, progressBars[chatId].message_id, null, text);
            }
            else {
                // If message_id is undefined, send a new message and store the message ID
                const newMessage = await bot.telegram.sendMessage(chatId, text);
                progressBars[chatId].message_id = newMessage.message_id;
            }
        }
    }
    catch (error) {
        console.error('Error updating progress message:', error);
    }
}
async function sendWithRetry(ctx, message, retryInterval = 3000, maxRetries = 50) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            // Attempt to send the message
            await ctx.reply(message);
            console.log('Message sent successfully.');
            return; // Exit the loop if successful
        }
        catch (error) {
            console.error(`Error sending message: ${error}`);
            // Increment attempts and wait for the retry interval
            attempts++;
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
    }
    console.error('Max retries reached. Message not sent.');
}
//# sourceMappingURL=uploader.js.map
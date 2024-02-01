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
exports.enqueueFile = exports.processUpload = void 0;
const axios_1 = __importDefault(require("axios"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const helpers_1 = require("./helpers");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bot_1 = require("./bot");
const chrono = __importStar(require("chrono-node"));
const cron_1 = require("cron");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const exec = (0, util_1.promisify)(child_process_1.exec);
// Vimeo client credentials
const vimeo_1 = require("vimeo");
// import Deta from 'deta/dist/types/deta';
const vimeoClient = new vimeo_1.Vimeo(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.ACCESS_TOKEN);
// Store message IDs and chat IDs for progress bars
const progressBars = [{}];
// Function to download video by file_id with progress bar
// async function downloadVideo(fileId, chatId, bot, progressCallback) {
//     try {
//         const file = await bot.telegram.getFile(fileId);
//         const fileUrl = `https://mtprotoApi.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
//         const response = await axios({
//             url: fileUrl,
//             method: 'GET',
//             responseType: 'stream',
//             onDownloadProgress: (progressEvent) => {
//                 const totalMB = progressEvent.total! / (1024 * 1024);
//                 const downloadedMB = progressEvent.loaded / (1024 * 1024);
//                 const percentage = ((progressEvent.loaded / progressEvent.total!) * 100).toFixed(2);
//                 // Check if downloadedMB is a valid number before using toFixed
//                 const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB.toString())) ? parseFloat(downloadedMB.toString()).toFixed(2) : 'N/A';
//                 progressCallback(percentage, downloadedMBFormatted, totalMB);
//             },
//         });
//         const storagePath = path.join(__dirname, '..', 'video_store');
//         const filePath = `${storagePath}/${file.file_id}.mp4`;
//         const fileStream = fs.createWriteStream(filePath);
//         response.data.pipe(fileStream);
//         return new Promise((resolve, reject) => {
//             fileStream.on('finish', () => resolve(filePath));
//             fileStream.on('error', reject);
//         });
//     } catch (error) {
//         console.error('Error downloading video:', error);
//         throw error;
//     }
// }
// Function to download video by file_id with progress bar
async function downloadVideo(fileId, bot, progressCallback) {
    try {
        const file = await bot.telegram.getFile(fileId);
        const fileUrl = `http://${process.env.BOT_URI}/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        const response = await (0, axios_1.default)({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                const totalMB = progressEvent.total / (1024 * 1024);
                const downloadedMB = progressEvent.loaded / (1024 * 1024);
                const percentage = ((progressEvent.loaded / progressEvent.total) * 100).toFixed(2);
                // Check if downloadedMB is a valid number before using toFixed
                const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB.toString())) ? parseFloat(downloadedMB.toString()).toFixed(2) : 'N/A';
                progressCallback(percentage, downloadedMBFormatted, totalMB);
            },
        });
        const storagePath = path_1.default.join(__dirname, '..', 'video_store');
        const filePath = `${storagePath}/${file.file_id}.mp4`;
        const fileStream = fs_1.default.createWriteStream(filePath);
        response.data.pipe(fileStream);
        return new Promise((resolve, reject) => {
            fileStream.on('finish', () => resolve(filePath));
            fileStream.on('error', reject);
        });
    }
    catch (error) {
        console.error('Error downloading video:', error);
        throw error;
    }
}
// For getting a file path to a file uploaded to the telegram bot API
async function getFilePath(bot, userSettings, userId) {
    const userSetting = userSettings[userId];
    // Check if we already have a file path set
    if (userSetting.videoPath) {
        return userSetting.videoPath;
    }
    else {
        // Get the file from the telegram bot API
        const file = await bot.telegram.getFile(userSetting.videoFileId);
        console.log(file);
        // const inputStoragePath = path.join('/var/lib/telegram-bot-api', 'bin', (process.env.BOT_TOKEN!).replace(":", "~"), "videos");
        const inputPath = `${file.file_path}`;
        return inputPath;
    }
}
// Enqueue a file for later processing
async function enqueueFile(ctx, userId, userSettings, processingTime, queueDb, bot) {
    // Setup input variables
    let fileKey;
    const filePath = await getFilePath(bot, userSettings, userId);
    const fileSettings = userSettings[userId];
    // Generate the date of processing using natural language
    const parsedDate = chrono.parseDate(processingTime);
    console.log("Queueing job for:");
    console.log(parsedDate);
    try {
        // Get the file name from the file path
        const fileName = path_1.default.basename(filePath);
        // Upload the file to Deta Drive
        // TODO: Solve this
        // fileKey = await filesDb.put(fileName, { path: filePath });
    }
    catch (error) {
        console.error('Error uploading file to Deta Drive:', error);
        return;
    }
    const item = {
        userId,
        fileSettings,
        fileKey,
        processingTime: parsedDate.getTime(), // Store processing time as a timestamp
        status: 'queued',
    };
    await queueDb.insert(item);
    // Schedule a processing job at the specified processing time
    const job = new cron_1.CronJob(parsedDate, async () => {
        console.log("Running queued job...");
        try {
            // Retrieve the file from the database
            const file = await queueDb.fetch({ userId, fileKey });
            console.log(file);
            // Check if the file is still in 'queued' status (it might have been processed or canceled by the user)
            if (file.items.length > 0 && file.items[0].status === 'queued') {
                // Process the queued file
                await processQueuedFile(ctx, bot, queueDb, userSettings);
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
// Function to upload video to Vimeo with progress bar
async function uploadToVimeo(localFilePath, userId, chatId, userSettings, progressCallback) {
    return new Promise(async (resolve, reject) => {
        // Get the user settings
        const userSetting = userSettings[userId];
        // Format the name of the video
        const currentDate = new Date();
        const sYear = currentDate.getFullYear() - 1984;
        const formattedDate = userSetting.date || `${sYear}${(currentDate.getMonth() + 1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}`;
        const leaderText = userSetting.leader ? ` (${userSetting.leader})` : '';
        const name = `${formattedDate} ${userSetting.title || 'Title'}${leaderText}`;
        try {
            const videoUpload = await vimeoClient.upload(localFilePath, {
                name: name,
                description: `Uploaded on ${new Date().toLocaleDateString()}`,
            }, async function (uri) {
                // Complete callback
                console.log('Video uploaded successfully. Vimeo link: https://vimeo.com/manage/', uri);
                // Set privacy settings with the provided password
                const password = userSetting.password; // Replace with the actual property from your settings
                await setPrivacySettings(uri.split('/').pop(), password);
                // Delete the local file after the upload is complete
                await deleteLocalFile(localFilePath, chatId);
                resolve(uri);
            }, function (bytes_uploaded, bytes_total) {
                // Progress callback
                const totalMB = bytes_total / (1024 * 1024);
                const uploadedMB = !isNaN(parseFloat(bytes_uploaded.toString())) ? bytes_uploaded / (1024 * 1024) : 'N/A';
                const percentage = ((bytes_uploaded / bytes_total) * 100).toFixed(2);
                progressCallback(percentage, uploadedMB, totalMB);
            }, function (error) {
                // Error callback
                console.error('Vimeo upload error:', error);
                // Delete the local file after the upload fails
                deleteLocalFile(localFilePath, chatId);
                reject(error);
            });
        }
        catch (error) {
            console.error('Error uploading video to Vimeo:', error);
            // Delete the local file after the upload fails
            deleteLocalFile(localFilePath, chatId);
            reject(error);
        }
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
        console.error('Error deleting local file:', deleteError);
    }
    // Reset the progress bars
    progressBars[chatId] = [];
}
// Function to set privacy settings for the video on Vimeo
async function setPrivacySettings(videoId, password) {
    // Skip blank passwords and instead use the vimeo default
    if (password === undefined || password == "")
        return;
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
        }, function (error, body, _status_code, _headers) {
            if (error) {
                console.error('Vimeo set privacy settings error:', error);
                reject(error);
            }
            else {
                resolve(body);
            }
        });
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
        command = command.audioCodec('aac') // Use AAC audio codec
            .audioBitrate('128k') // Adjust audio bitrate as needed
            .outputOptions([
            '-preset veryfast', // Use a faster preset for encoding
            '-movflags +faststart' // Enable faststart for better streaming
        ]);
        // Attach progress callback
        command.on('progress', (progress) => {
            const percentage = progress.percent.toFixed(2);
            const progressBar = generateProgressBar(parseFloat(percentage));
            // Update the progress message
            updateProgressMessage(chatId, bot, `Processing video... ${percentage}%\n${progressBar}`);
        });
        await new Promise((resolve, reject) => {
            command.on('end', resolve).on('error', reject).run();
        });
        console.log('Video cut successfully:', outputPath);
        return outputPath;
    }
    catch (error) {
        console.error('Error processing video:', error);
        throw error;
    }
}
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
                progressMessage = await ctx.reply('Preparing for processing...');
                progressBars[chatId] = { message_id: progressMessage.message_id };
            }
        }
        // Download the video from telegram
        // const localFilePath = await downloadVideo(userSetting.videoFileId, bot, (percentage, downloadedMB, totalMB) => {
        //     const progressBar = generateProgressBar(percentage);
        //     const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB)) ? parseFloat(downloadedMB).toFixed(2) : 'N/A';
        //     updateProgressMessage(chatId, bot, progressBars[chatId].message_id, `Downloading... ${percentage}% (${downloadedMBFormatted} MB / ${totalMB.toFixed(2)} MB)\n${progressBar}`);
        // });
        // console.log('Video downloaded successfully:', localFilePath);
        const inputPath = await getFilePath(bot, userSettings, userId);
        // Cut the video based on start and end times
        const outputStoragePath = path_1.default.join(__dirname, '..', 'uploads');
        const outputPath = `${outputStoragePath}\\${userSetting.videoFileId}_cut.mp4`;
        if (!silent)
            updateProgressMessage(chatId, bot, "Processing video...");
        const resultPath = await editVideo(inputPath, outputPath, chatId, bot, userSetting.startTime, userSetting.endTime);
        // Upload the video to vimeo
        const vimeoUri = await uploadToVimeo(resultPath, userId, chatId, userSettings, async (percentage, uploadedMB, totalMB) => {
            const progressBar = generateProgressBar(percentage);
            const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
            if (!silent)
                updateProgressMessage(chatId, bot, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${parseFloat(totalMB).toFixed(2)} MB)\n${progressBar}`);
        });
        // Do something with the Vimeo URI (save it, send it in a message, etc.)
        if (!silent)
            await ctx.reply(`Video uploaded successfully. Vimeo link: https://vimeo.com/manage${vimeoUri}`);
        userSetting.vimeoLink = `https://vimeo.com/manage${vimeoUri}`;
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
        // Reset user settings
        // userSettings[userId] = {};
    }
    catch (error) {
        console.error('Error processing video:', error);
        if (!silent)
            ctx.reply('Error processing video. Please try again later.');
        //TODO: Deletion here
        return false;
    }
    // Edit the final message indicating completion
    if (!silent)
        await ctx.telegram.editMessageText(chatId, progressBars[chatId].message_id, null, 'Processing complete!\n' + generateProgressBar(100));
    return true;
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
    return `[${progressBar}] ${numericProgress.toFixed(2)}%`;
}
// Function to update progress message using editMessageText
let lastUpdateTimestamp = 0;
let minIntervalMs = 580;
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
//# sourceMappingURL=uploader.js.map
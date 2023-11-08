import axios from 'axios';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { getUserId } from './helpers';
import fs from 'fs';
import path, { resolve } from 'path';
import { UserSettings, UserSetting, sendToDestination } from "./bot"
import { Deta } from 'deta';
import { DetaType } from 'deta/dist/types/types/basic';
import Base from 'deta/dist/types/base';
import Drive from 'deta/dist/types/drive';
import * as chrono from 'chrono-node';
import { CronJob } from 'cron';

const exec = promisify(execCallback);

// Vimeo client credentials
import { Vimeo } from 'vimeo';
// import Deta from 'deta/dist/types/deta';
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const accessToken = process.env.ACCESS_TOKEN;

const vimeoClient = new Vimeo(
    clientId!,
    clientSecret!,
    accessToken!
  );

// Store message IDs and chat IDs for progress bars
const progressBars:any[] = [{}];

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
async function downloadVideo(fileId:string, bot:any, progressCallback:Function) {
    try {
        const file = await bot.telegram.getFile(fileId);
        const fileUrl = `http://${process.env.BOT_URI}/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
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

// For getting a file path to a file uploaded to the telegram bot API
async function getFilePath(bot:any, userSettings:UserSettings, userId: string) {
    const userSetting = userSettings[userId];
    const file = await bot.telegram.getFile(userSetting.videoFileId);
    const inputStoragePath = path.join(__dirname, '..', '..', 'telegram-bot-api', 'bin', (process.env.BOT_TOKEN!).replace(":", "~"), "videos");
    const inputPath = `${file.file_path}`;
    return inputPath;
}

interface QueueItem {
    userId: string;
    fileSettings: UserSetting;
    fileKey: string;
    processingTime: number;
    status: string;
  }

// Enqueue a file for later processing
async function enqueueFile(ctx:any, userId: string, userSettings: UserSettings, processingTime: string, configDb: Base, filesDb: Drive, bot:any) {

    // Setup input variables
    let fileKey:any;
    const filePath = await getFilePath(bot, userSettings, userId);
    const fileSettings = userSettings[userId];

    // Generate the date of processing using natural language
    const parsedDate = chrono.parseDate(processingTime);

    try {
        // Get the file name from the file path
        const fileName = path.basename(filePath);
    
        // Upload the file to Deta Drive
        // TODO: Solve this
        // fileKey = await filesDb.put(fileName, { path: filePath });

    } catch (error) {
        console.error('Error uploading file to Deta Drive:', error);
        return;
    }

    const item:QueueItem = {
      userId,
      fileSettings,
      fileKey,
      processingTime: parsedDate.getTime(), // Store processing time as a timestamp
      status: 'queued',
    };
  
    await configDb.insert(item as unknown as DetaType);

    // Schedule a processing job at the specified processing time
    const job = new CronJob(parsedDate, async () => {
        try {
            // Retrieve the file from the database
            const file = await configDb.fetch({ userId, fileKey });

            // Check if the file is still in 'queued' status (it might have been processed or canceled by the user)
            if (file.items.length > 0 && file.items[0].status === 'queued') {
                // Process the queued file
                await processQueuedFile(ctx, bot, configDb, filesDb, userSettings);
            }
        } catch (error) {
            console.error('Error processing queued file:', error);
            // Handle the error as needed
        }
    });

    // Start the cron job
    job.start();
}

// Function to process a queued file
async function processQueuedFile(ctx:any, bot:any, configDb:Base, filesDb:Drive, userSettings:UserSettings) {
    const currentTime = new Date().getTime();
  
    // Retrieve items that need processing
    const itemsToProcess = (await configDb.fetch({
      processingTime: { $lte: currentTime },
      status: 'queued',
    })).items;

    // Process each item
    for (const item of itemsToProcess) {
        // Implement your file processing logic here
        processUpload(ctx, bot, userSettings, () => {}, true)
        
        // Update item status to 'processed' in the Deta Base collection
        // await configDb.update({ status: 'processed' }, (item.userId!) as string);
        await configDb.delete((item.userId!) as string);
    }
}

// Function to upload video to Vimeo with progress bar
async function uploadToVimeo(localFilePath:string, userId:number, userSettings:UserSettings, progressCallback:Function) {
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
            const videoUpload = await vimeoClient.upload(
                localFilePath,
                {
                    name: name,
                    description: `Uploaded on ${new Date().toLocaleDateString()}`,
                },
                async function (uri) {
                    // Complete callback
                    console.log('Video uploaded successfully. Vimeo link: https://vimeo.com/manage/', uri);

                    // Set privacy settings with the provided password
                    const password = userSetting.password || process.env.DEFAULT_VIMEO_PASSWORD; // Replace with the actual property from your settings
                    await setPrivacySettings(uri.split('/').pop()!, password);

                    // Delete the local file after the upload is complete
                    await deleteLocalFile(localFilePath);

                    resolve(uri);
                },
                function (bytes_uploaded, bytes_total) {
                    // Progress callback
                    const totalMB = bytes_total / (1024 * 1024);
                    const uploadedMB = !isNaN(parseFloat(bytes_uploaded.toString())) ? bytes_uploaded / (1024 * 1024) : 'N/A';
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

async function deleteLocalFile(filePath:string) {
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
async function setPrivacySettings(videoId:string, password?:string) {

    // Skip blank passwords and instead use the vimeo default
    if (password === undefined) return;

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
            } else {
                resolve(body);
            }
        });
    });
}

// Function to cut the video using ffmpeg
async function cutVideo(inputPath:string, outputPath:string, startTime?:string, endTime?:string) {

    if (startTime === undefined && endTime === undefined) return inputPath;

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

async function processUpload(ctx:any, bot:any, userSettings:UserSettings, promptSendVideo:Function, silent:boolean) {
    const userId = getUserId(ctx);
    const chatId:number = ctx.chat.id;
    const userSetting = userSettings[userId];

    let progressMessage;

    try {
        // Check if progress message has been sent
        if (!progressBars[chatId] || !progressBars[chatId].message_id) {
            if (!silent){
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
        const outputStoragePath = path.join(__dirname, '..', 'video_store');
        const outputPath = `${outputStoragePath}\\${userSetting.videoFileId}_cut.mp4`;
        
        if (!silent) updateProgressMessage(chatId, bot, "Processing video...");
        const resultPath = await cutVideo(inputPath, outputPath, userSetting.startTime, userSetting.endTime);
        console.log('Video cut successfully:', outputPath);

        // Upload the video to vimeo
        const vimeoUri = await uploadToVimeo(resultPath, userId, userSettings, async (percentage:number, uploadedMB:string, totalMB:string) => {
            const progressBar = generateProgressBar(percentage);

            const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
            if (!silent) updateProgressMessage(chatId, bot, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${parseFloat(totalMB).toFixed(2)} MB)\n${progressBar}`);
        });

        // Do something with the Vimeo URI (save it, send it in a message, etc.)
        if (!silent) await ctx.reply(`Video uploaded successfully. Vimeo link: https://vimeo.com/manage${vimeoUri}`);
        userSetting.vimeoLink = `https://vimeo.com/manage${vimeoUri}`;

        // Prompt user to send the link to the designated chatroom
        if (!silent) {
            promptSendVideo(ctx);
        } else {
            
            // Since it's in silent mode, we will just automatically send the message
            const destinationExists = userSettings[userId].destination !== undefined;
            if (destinationExists) {
                sendToDestination(ctx, userSettings[userId].destination!);
            } else {
                sendToDestination(ctx, "-4061080652"); // Default destination is the Vimeo Angel Admin Room
            }
            

        }

        // Reset user settings
        // userSettings[userId] = {};

    } catch (error) {
        
        console.error('Error processing video:', error);
        if (!silent) ctx.reply('Error processing video. Please try again later.');

        //TODO: Deletion here
        return false;
    }
    
    // Edit the final message indicating completion
    if (!silent) await ctx.telegram.editMessageText(
        chatId,
        progressBars[chatId].message_id,
        null,
        'Processing complete!\n' + generateProgressBar(100)
    );

    return true
}

// Function to generate a simple ASCII progress bar
function generateProgressBar(progress:number) {
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
let minIntervalMs = 350;
async function updateProgressMessage(chatId:number, bot:any, text:string) {
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
                await bot.telegram.editMessageText(chatId, progressBars[chatId].message_id, null!, text);
            } else {
                // If message_id is undefined, send a new message and store the message ID
                const newMessage = await bot.telegram.sendMessage(chatId, text);
                progressBars[chatId].message_id = newMessage.message_id;
            }
        }
    } catch (error) {
        console.error('Error updating progress message:', error);
    }
}

export { processUpload, enqueueFile }
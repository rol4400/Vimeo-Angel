import axios from 'axios';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { getUserId } from './helpers';
import fs from 'fs';
import path from 'path';
import { UserSettings, UserSetting, sendToDestination } from "./bot"
import { DetaType } from 'deta/dist/types/types/basic';
import Base from 'deta/dist/types/base';
import * as chrono from 'chrono-node';
import { CronJob } from 'cron';
import ffmpeg from 'fluent-ffmpeg';
import querystring from 'querystring';

const exec = promisify(execCallback);

// Vimeo client credentials
import { Vimeo } from 'vimeo';
// import Deta from 'deta/dist/types/deta';

const vimeoClient = new Vimeo(
    process.env.CLIENT_ID!,
    process.env.CLIENT_SECRET!,
    process.env.ACCESS_TOKEN!
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

// async function downloadVideo(fileId:string, bot:any, progressCallback:Function) {
//     try {

//         const url = `${process.env.BOT_URI!}/bot${process.env.BOT_TOKEN!}/getFile?file_id=${fileId}`;

//         try {
//             await axios.get(url, {
//               // Adjust timeout as needed, set to 0 for no timeout
//               timeout: 0,
//             });
        
//             // Handle the response data here
//             const file = await bot.telegram.getFile(fileId);
//             const fileUrl = `http://${process.env.BOT_URI}/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
//             const response = await axios({
//                 url: fileUrl,
//                 method: 'GET',
//                 responseType: 'stream',
//                 onDownloadProgress: (progressEvent) => {
//                     const totalMB = progressEvent.total! / (1024 * 1024);
//                     const downloadedMB = progressEvent.loaded / (1024 * 1024);
//                     const percentage = ((progressEvent.loaded / progressEvent.total!) * 100).toFixed(2);
                
//                     // Check if downloadedMB is a valid number before using toFixed
//                     const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB.toString())) ? parseFloat(downloadedMB.toString()).toFixed(2) : 'N/A';
                
//                     progressCallback(percentage, downloadedMBFormatted, totalMB);
//                 },
                
//             });
    
//             // Store the file on local storage
//             const storagePath = path.join(__dirname, '..', 'video_store');
//             const filePath = `${storagePath}/${file.file_id}.mp4`;
//             const fileStream = fs.createWriteStream(filePath);
//             response.data.pipe(fileStream);
    
//             return new Promise((resolve, reject) => {
//                 fileStream.on('finish', () => resolve(filePath));
//                 fileStream.on('error', reject);
//             });
        
//           } catch (error:any) {
//             // Handle errors here
//             console.error('Error fetching file:', error.message);
//         }

//         throw new Error("Internal error downloading the video file from telegram");

//     } catch (error) {
//         console.error('Error downloading video:', error);
//         throw error;
//     }
// }

// For getting a file path to a file uploaded to the telegram bot API
async function getFilePath(userSettings:UserSettings, userId: string) {
    const userSetting = userSettings[userId];

    // Check if we already have a file path set
    if (userSetting.videoPath) {
        return userSetting.videoPath;
    } else {

        // Get the file from the telegram bot API
        // This is done manually so that we can set the timeout value
        // Otherwise if there is a timeout for large files or slow wifi it will fail
        try {
            const url = `http://${process.env.BOT_URI!}/bot${process.env.BOT_TOKEN!}/getFile?file_id=${userSetting.videoFileId}`;

            const file = (await axios.get(url, {
              // Adjust timeout as needed, set to 0 for no timeout
              timeout: 0,
            }));
        
           
            console.log("getFile Response:");
            console.log(file);
    
            // const inputStoragePath = path.join('/var/lib/telegram-bot-api', 'bin', (process.env.BOT_TOKEN!).replace(":", "~"), "videos");
            const inputPath = `${file.data.result.file_path}`;
    
            return inputPath;
        
          } catch (error:any) {
            // Handle errors here
            console.error('Error fetching file:', error);
        }
        
        throw new Error("Internal error downloading the video file from telegram");
    }
}

interface QueueItem {
    userId: string;
    fileSettings: UserSetting;
    filePath: string,
    fileKey: string;
    processingTime: number;
    status: string;
  }

// Enqueue a file for later processing
async function enqueueFile(ctx: any, userId: string, userSettings: UserSettings, processingTime: string, queueDb: Base, bot: any) {

    // Setup input variables
    const filePath = await getFilePath(userSettings, userId);
    const fileKey = querystring.escape(filePath);
    const fileSettings = userSettings[userId];
  
    // Generate the date of processing using natural language
    const parsedDate = chrono.parseDate(processingTime);
    console.log("Queueing job for:");
    console.log(parsedDate);
  
    // Construct a QueueItem to store the required information in the queue
    const item: QueueItem = {
      userId,
      fileSettings,
      filePath,
      fileKey,
      processingTime: parsedDate.getTime(), // Store processing time as a timestamp
      status: 'queued',
    };
  
    await queueDb.insert(item as unknown as DetaType);
  
    // Schedule a processing job at the specified processing time
    const job = new CronJob(parsedDate, async () => {
  
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
            await queueDb.update(file, fileToUpdate.last!);
  
            console.log("Running queued file:")
            console.log(file);
  
            // Process the queued file
            await processQueuedFile(ctx, bot, queueDb, userSettings);
  
            // The cron job will only process one file at a time
  
            // Delete the processed item from the database
            await queueDb.delete(fileToUpdate.last!);
          }
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
async function processQueuedFile(ctx:any, bot:any, queueDb:Base, userSettings:UserSettings) {
    const currentTime = (new Date()).getTime();
  
    // Retrieve items that need processing
    const itemsToProcess = (await queueDb.fetch({
        "processingTime?lte": currentTime,
        "status": 'queued',
    })).items;

    console.log("Items to process")
    console.log(itemsToProcess);

    // Process each item
    for (const item of itemsToProcess) {
        // Implement your file processing logic here
        processUpload(ctx, bot, userSettings, () => {}, true)
        
        // Update item status to 'processed' in the Deta Base collection
        // await configDb.update({ status: 'processed' }, (item.userId!) as string);
        await queueDb.delete((item.userId!) as string);
    }
}

// Gets the current date in S years
function getCurrentDate() {
    const currentDate = new Date();
    const sYear = currentDate.getFullYear() - 1984 + 1; // +1 because we count from 0 XD

    return `${sYear}${(currentDate.getMonth() + 1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}`;
}

// Function to upload video to Vimeo with progress bar
async function uploadToVimeo(localFilePath:string, userId:number, chatId:number, userSettings:UserSettings, progressCallback:Function) {
    return new Promise(async (resolve, reject) => {
        
        // Get the user settings
        const userSetting = userSettings[userId];

        // Format the name of the video
        const formattedDate = userSetting.date || getCurrentDate;
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
                    const password = userSetting.password; // Replace with the actual property from your settings
                    await setPrivacySettings(uri.split('/').pop()!, password);

                    // Delete the local file after the upload is complete
                    await deleteLocalFile(localFilePath, chatId);

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
                    deleteLocalFile(localFilePath, chatId);
                    reject(error);
                }
            );
        } catch (error) {
            console.error('Error uploading video to Vimeo:', error);

            // Delete the local file after the upload fails
            deleteLocalFile(localFilePath, chatId);
            reject(error);
        }
    });
}

async function deleteLocalFile(filePath:string, chatId:number) {

    console.log("Deleting file: " + filePath);
    try {
        await fs.unlink(filePath, (err) => {
            if (err) throw err;
            console.log('Local file deleted successfully:', filePath);
          });
    } catch (deleteError) {
        console.error('Error deleting local file:', deleteError);
    }

    // Reset the progress bars
    progressBars[chatId] = [];
}

// Function to set privacy settings for the video on Vimeo
async function setPrivacySettings(videoId:string, password?:string) {

    // Skip blank passwords and instead use the vimeo default
    if (password === undefined || password == "") return;

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

// Function to cut and compress the video using fluent-ffmpeg
async function editVideo(inputPath: string, outputPath: string, chatId: number, bot:any, startTime?: string, endTime?: string) {
    try {
        let command = ffmpeg(inputPath);

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
            updateProgressMessage(chatId, bot, `Processing video... ${percentage}%\n${progressBar}`);
        });

        await new Promise((resolve, reject) => {
            command.on('end', resolve).on('error', reject).run();
        });

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

    console.log("Processing upload");

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

        const inputPath = await getFilePath(userSettings, userId);

        // Cut the video based on start and end times
        const outputStoragePath = path.join(__dirname, '..', 'uploads');
        const outputPath = `${outputStoragePath}\\${userSetting.videoFileId}_cut.mp4`;
        
        if (!silent) updateProgressMessage(chatId, bot, "Processing video...");
        const resultPath = await editVideo(inputPath, outputPath, chatId, bot, userSetting.startTime, userSetting.endTime);

        // Upload the video to vimeo
        const vimeoUri = await uploadToVimeo(resultPath, userId, chatId, userSettings, async (percentage:number, uploadedMB:string, totalMB:string) => {
            const progressBar = generateProgressBar(percentage);

            const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
            if (!silent) updateProgressMessage(chatId, bot, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${parseFloat(totalMB).toFixed(2)} MB)\n${progressBar}`);
        });

        // Do something with the Vimeo URI (save it, send it in a message, etc.)
        if (!silent) {
            sendWithRetry(ctx, `Video uploaded successfully. Vimeo link: https://vimeo.com/manage${vimeoUri}`)
        }
        userSetting.vimeoLink = `https://vimeo.com/manage${vimeoUri}`;

        // Prompt user to send the link to the designated chatroom
        if (!silent) {
            promptSendVideo(ctx);
        } else {
            
            // Since it's in silent mode, we will just automatically send the message
            const destinationExists = userSettings[userId].destination !== undefined;
            if (destinationExists) {
                sendToDestination(ctx, userSettings[userId].destination!, true);
            } else {
                sendToDestination(ctx, "-4061080652", true); // Default destination is the Vimeo Angel Admin Room
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
let minIntervalMs = 3500;
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

async function sendWithRetry(ctx:any, message:any, retryInterval = 3000, maxRetries = 50) {
    let attempts = 0;
    
    while (attempts < maxRetries) {
        try {
            // Attempt to send the message
            await ctx.reply(message);
            console.log('Message sent successfully.');
            return; // Exit the loop if successful
        } catch (error) {
            console.error(`Error sending message: ${error}`);

            // Increment attempts and wait for the retry interval
            attempts++;
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
    }

    console.error('Max retries reached. Message not sent.');
}

export { processUpload, enqueueFile, getCurrentDate }
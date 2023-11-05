import axios from 'axios';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { getUserId } from './helpers';
import fs from 'fs';
import path, { resolve } from 'path';
import { TelegramClient } from 'telegram';

const exec = promisify(execCallback);

// Vimeo client credentials
import { Vimeo } from 'vimeo';
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const accessToken = process.env.ACCESS_TOKEN;

const vimeoClient = new Vimeo(
    clientId,
    clientSecret,
    accessToken
  );

// Store message IDs and chat IDs for progress bars
const progressBars = {};

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

async function downloadVideo(fileId, client, progressCallback) {
  try {

    // Download the file
    const downloadedFile = await client.downloadMedia(fileId);

    // File handling logic
    const storagePath = path.join(__dirname, '..', 'video_store');
    const filePath = `${storagePath}/${fileId.id}.mp4`;
    const fileStream = fs.createWriteStream(filePath);

    // Variables for progress tracking
    let totalBytesReceived = 0;
    const totalBytes = downloadedFile.bytes.data.length;

    // Write the file content to the stream
    fileStream.write(downloadedFile.bytes.data);

    // Handle progress
    fileStream.on('data', (chunk) => {
      totalBytesReceived += chunk.length;

      const percentage = ((totalBytesReceived / totalBytes) * 100).toFixed(2);
      progressCallback(percentage, totalBytesReceived, totalBytes);
    });

    // Return a promise that resolves with the file path
    return new Promise((resolve, reject) => {
      // Handle finish and error events
      fileStream.on('finish', () => resolve(filePath));
      fileStream.on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    throw error;
  }
}

// Function to upload video to Vimeo with progress bar
async function uploadToVimeo(localFilePath, userId, userSettings, progressCallback) {
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

async function processUpload(ctx, bot, client, userSettings, promptSendVideo) {
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
        const localFilePath = await downloadVideo(userSetting.videoFileId, client, (percentage, downloadedMB, totalMB) => {
            const progressBar = generateProgressBar(percentage);

            const downloadedMBFormatted = !isNaN(parseFloat(downloadedMB)) ? parseFloat(downloadedMB).toFixed(2) : 'N/A';
            updateProgressMessage(chatId, bot, progressBars[chatId].message_id, `Downloading... ${percentage}% (${downloadedMBFormatted} MB / ${totalMB.toFixed(2)} MB)\n${progressBar}`);
           
        });
        console.log('Video downloaded successfully:', localFilePath);

        // Cut the video based on start and end times
        const storagePath = path.join(__dirname, '..', 'video_store');
        const outputPath = `${storagePath}/${userSetting.videoFileId}_cut.mp4`;

        updateProgressMessage(chatId, bot, progressBars[chatId].message_id, "Processing video...");
        await cutVideo(localFilePath, outputPath, userSetting.startTime, userSetting.endTime);
        console.log('Video cut successfully:', outputPath);

        // Upload the video to vimeo
        const vimeoUri = await uploadToVimeo(outputPath, userId, userSettings, (percentage, uploadedMB, totalMB) => {
            const progressBar = generateProgressBar(percentage);

            const uploadedMBFormatted = !isNaN(parseFloat(uploadedMB)) ? parseFloat(uploadedMB).toFixed(2) : 'N/A';
            updateProgressMessage(chatId, bot, progressBars[chatId].message_id, `Uploading to Vimeo... ${percentage}% (${uploadedMBFormatted} MB / ${totalMB.toFixed(2)} MB)\n${progressBar}`);
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
    
    // Edit the final message indicating completion
    await ctx.telegram.editMessageText(
        chatId,
        progressBars[chatId].message_id,
        null,
        'Processing complete!\n' + generateProgressBar(100)
    );
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
async function updateProgressMessage(chatId, bot, messageId, text) {
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

export { processUpload }
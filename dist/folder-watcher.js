"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processNewlyDetectedFile = exports.startFileWatcher = void 0;
const chokidar = require('chokidar');
const path = require('path');
const genThumbnail = require('simple-thumbnail');
var FlakeId = require('flake-idgen');
var intformat = require('biguint-format');
const querystring = require('querystring');
// const fs = require('fs-extra');
const fs = require('fs').promises;
const tmp = require('tmp');
tmp.setGracefulCleanup(); // Delete files on exit
// Accepted video file extensions
const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.ogg', '.m4v', '.3gp'];
// Start monitoring the set directory for new video files
function startFileWatcher(bot, folderToMonitor) {
    console.log("Started file watcher");
    // Watch the specified folder and its subdirectories for new MP4 files
    const watcher = chokidar.watch(folderToMonitor, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        interval: 500,
        awaitWriteFinish: {
            stabilityThreshold: 20000,
            pollInterval: 300
        },
        polling: true,
        depth: 99
    });
    let timeoutId = null;
    watcher.on('add', (filePath) => {
        if (videoExtensions.includes(path.extname(filePath).toLowerCase())) {
            console.log(`New video file detected for processing: ${filePath}`);
            // Clear the previous timeout, if any
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            // Set a new timeout to call processNewlyDetectedFile after 1 second
            timeoutId = setTimeout(() => {
                processNewlyDetectedFile(bot, filePath, Number(process.env.DEFAULT_CHATROOM));
                timeoutId = null; // Reset timeoutId after execution
            }, 1000);
        }
    });
    watcher.on('error', (error) => {
        console.error(`File watcher error: ${error}`);
    });
}
exports.startFileWatcher = startFileWatcher;
async function processNewlyDetectedFile(bot, filePath, destinationChatId) {
    try {
        // Create a temporary directory
        const tempDirObj = tmp.dirSync({ unsafeCleanup: true });
        const tempDir = tempDirObj.name;
        console.log("Temp Dir: " + tempDir);
        // Extract the original filename without spaces and special characters
        const newFileName = Date.now().toString();
        const newFilePath = path.join(tempDir, newFileName);
        // Copy the video file to the temporary directory
        await fs.copyFile(filePath, newFilePath);
        // Generate the thumbnail in the temporary directory
        const thumbnailFileName = 'newFileName-thumbnail.png'; // or generate a unique name here if needed
        const thumbnailFilePath = path.join(tempDir, thumbnailFileName);
        await genThumbnail(newFilePath, thumbnailFilePath, '720x?', {
            seek: '00:00:10.00'
        });
        // URL encode the filename before using it in callback_data
        const encodedFilePath = querystring.escape(newFilePath);
        console.log("Encoded file name: " + encodedFilePath);
        // Prompt the user to edit the file
        await bot.telegram.sendPhoto(destinationChatId, { source: thumbnailFilePath }).then(async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
            // Use the temporary directory and dynamic filename in the callback_data
            await bot.telegram.sendMessage(destinationChatId, "A file has been uploaded. Whoever wants to process it please click here", {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🙋 Process File', callback_data: 'process_upload_' + encodedFilePath },
                        ]
                    ],
                }
            });
        });
    }
    catch (e) {
        console.error('Error processing newly detected file:', e);
    }
}
exports.processNewlyDetectedFile = processNewlyDetectedFile;
//# sourceMappingURL=folder-watcher.js.map
const chokidar = require('chokidar');
const path = require('path');
const genThumbnail = require('simple-thumbnail')
var FlakeId = require('flake-idgen')
var fs = require('fs');
var intformat = require('biguint-format')

var flakeIdGen:any;

// Accepted video file extensions
const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.ogg', '.m4v', '.3gp'];

// Start monitoring the set directory for new video files
function startFileWatcher(bot: any, folderToMonitor: string) {
    
    // Start a new file ID generator
    flakeIdGen = new FlakeId();

    // Watch the specified folder and its subdirectories for new MP4 files
    const watcher = chokidar.watch(folderToMonitor, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: true,
        depth: 99
    });

    let timeoutId: NodeJS.Timeout | null = null;

    watcher.on('add', (filePath: string) => {
        if (videoExtensions.includes(path.extname(filePath).toLowerCase())) {
            console.log(`New video file detected for processing: ${filePath}`);

            // Clear the previous timeout, if any
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }

            // Set a new timeout to call processNewlyDetectedFile after 1 second
            timeoutId = setTimeout(() => {
                
                processNewlyDetectedFile(bot, filePath, Number(process.env.DEFAULT_CHATROOM!));
                
                timeoutId = null; // Reset timeoutId after execution
            }, 1000);
        }
    });

    watcher.on('error', (error: any) => {
        console.error(`File watcher error: ${error}`);
    });
}

async function processNewlyDetectedFile(bot:any, filePath:string, destinationChatId:number) {

    // Generate a new filename
    var newFileName = intformat(flakeIdGen.next(), 'dec');

    // Original file properties
    var fileExtension = path.extname(filePath);
    var fileDirectory = path.dirname(filePath)
    
    // Rename the video file to make sure it's appropiate
    var newVideoFileName = fileDirectory + "/" + newFileName + fileExtension;
    fs.rename(filePath, newVideoFileName, function(err:any) {
        if ( err ) console.log('ERROR: ' + err);
    });

    // Generate the thumbnail
    try {
        genThumbnail(newVideoFileName, fileDirectory + newFileName + ".png" , '250x?', {
            seek: "00:00:10.00"
        }).then(async () => {

            // Prompt the user to edit the file
            await bot.telegram.sendPhoto(destinationChatId, { source: fileDirectory + newFileName + ".png"   }).then(async () => {

                await new Promise(resolve => setTimeout(resolve, 500));

                await bot.telegram.sendMessage(destinationChatId, "A file has been uploaded. Whoever wants to process it please click here", {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🙋 Process File', callback_data: 'process_upload_' + newVideoFileName },
                            ]
                        ],
                    }
                });
            });
        })
    } catch (e) {} // Ignore errors that occur when too many files are detected at once
}

export { startFileWatcher, processNewlyDetectedFile }

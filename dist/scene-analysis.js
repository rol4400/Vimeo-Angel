"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMainSermon = void 0;
const ffmpeg = require('fluent-ffmpeg');
const uploader_1 = require("./uploader");
function extractSceneChanges(videoPath, callback, progressCallback) {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
            callback(err, null, 0);
            return;
        }
        const durationInSeconds = metadata.format.duration;
        const sceneChanges = [];
        // Analyzing the video stream to find scene changes
        metadata.streams.forEach((stream) => {
            if (stream.codec_type === 'video') {
                const frames = stream.nb_frames;
                const framesPerSecond = frames / durationInSeconds;
                const sceneDetection = ffmpeg(videoPath)
                    .outputOptions([
                    `-vf`,
                    `select=gt(scene\\,0.4),showinfo`,
                    '-vsync',
                    'vfr'
                ])
                    .outputFormat("null")
                    .output("-")
                    .on('stderr', function (stderrLine) {
                    const match = stderrLine.match(/showinfo.*pts_time:([0-9.]+)/);
                    if (match && match[1]) {
                        const timestamp = parseFloat(match[1]);
                        sceneChanges.push(timestamp);
                    }
                })
                    .on('end', () => {
                    callback(null, sceneChanges, durationInSeconds);
                })
                    .on('progress', function (progress) {
                    // Progress callback
                    if (progressCallback) {
                        progressCallback(progress.percent);
                    }
                })
                    .on('error', (err) => {
                    callback(err, null, 0);
                })
                    .run();
            }
        });
    });
}
function findLargestGap(timestamps, duration) {
    if (timestamps.length === 0) {
        return null;
    }
    // Sort timestamps in ascending order
    const sortedTimestamps = timestamps.sort((a, b) => a - b);
    let largestGapStart = 0;
    let largestGapEnd = 0;
    let largestGap = 0;
    console.log("Duration: " + duration);
    // Iterate through the sorted timestamps to find the largest gap
    for (let i = 1; i < sortedTimestamps.length; i++) {
        const gap = sortedTimestamps[i] - sortedTimestamps[i - 1];
        if (gap > largestGap) {
            largestGap = gap;
            largestGapStart = sortedTimestamps[i - 1];
            largestGapEnd = sortedTimestamps[i];
        }
    }
    // Check if the largest gap meets the criteria
    if (largestGap === 0) {
        return null;
    }
    return [largestGapStart, largestGapEnd];
}
// Extract the main sermon part from the video, cut it, and send to the telegram chatroom
async function extractMainSermon(inputVideo, outputAutocutPath, chatId, bot, progressCallback) {
    return new Promise(async (resolve, reject) => {
        try {
            await new Promise((resolve, reject) => {
                extractSceneChanges(inputVideo, async (err, timestamps, duration) => {
                    if (err) {
                        console.error('Error:', err);
                        reject(err);
                        return;
                    }
                    console.log('Scene change timestamps:', timestamps);
                    const largestGap = findLargestGap(timestamps, duration);
                    if (largestGap) {
                        console.log('Largest Gap Start:', largestGap[0]);
                        console.log('Largest Gap End:', largestGap[1]);
                        await (0, uploader_1.editVideo)(inputVideo, outputAutocutPath, chatId, bot, largestGap[0].toString(), largestGap[1].toString()).then(async (outputAutocutPath) => {
                            await (0, uploader_1.sendVideoToChat)(outputAutocutPath, chatId, bot, "Auto-cut Sermon Part");
                        });
                    }
                    else {
                        console.log('No gap found meeting the criteria.');
                    }
                    resolve();
                }, (progress) => {
                    progressCallback(progress);
                });
            });
            resolve();
        }
        catch (error) {
            reject(error);
        }
    });
}
exports.extractMainSermon = extractMainSermon;
//# sourceMappingURL=scene-analysis.js.map
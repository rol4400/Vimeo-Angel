const ffmpeg = require('fluent-ffmpeg');

import { editVideo, sendVideoToChat } from './uploader';

function extractSceneChanges(videoPath: string, callback: (error: Error | null, timestamps: number[] | null, duration: number) => void, progressCallback: (progress: number) => void): void {
    ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
            callback(err, null, 0);
            return;
        }

        const durationInSeconds: number = metadata.format.duration;
        const sceneChanges: number[] = [];

        // Analyzing the video stream to find scene changes
        metadata.streams.forEach((stream: any) => {
            if (stream.codec_type === 'video') {
                const frames: number = stream.nb_frames;
                const framesPerSecond: number = frames / durationInSeconds;
                const sceneDetection = ffmpeg(videoPath)
                    .outputOptions([
                        `-vf`,
                        `select=gt(scene\\,0.4),showinfo`,
                        '-vsync',
                        'vfr'
                    ])
                    .outputFormat("null")
                    .output("-")
                    .on('stderr', function (stderrLine: string) {
                        const match = stderrLine.match(/showinfo.*pts_time:([0-9.]+)/);
                        if (match && match[1]) {
                            const timestamp: number = parseFloat(match[1]);
                            sceneChanges.push(timestamp);
                        }
                    })
                    .on('end', () => {
                        callback(null, sceneChanges, durationInSeconds);
                    })
                    .on('progress', function (progress: any) {
                        // Progress callback
                        if (progressCallback) {
                            progressCallback(progress.percent);
                        }
                    })
                    .on('error', (err: any) => {
                        callback(err, null, 0);
                    })
                    .run();
            }
        });
    });
}

function findLargestGap(timestamps: number[], duration: number): [number, number] | null {
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
async function extractMainSermon(inputVideo:string, outputAutocutPath:string, chatId:number, bot:any, progressCallback:Function) {
    return new Promise <void>(async (resolve, reject) => {
        try {
            await new Promise<void>((resolve, reject) => {
                extractSceneChanges(inputVideo, async (err: Error | null, timestamps: number[] | null, duration: number) => {
                    if (err) {
                        console.error('Error:', err);
                        reject(err);
                        return;
                    }
                    console.log('Scene change timestamps:', timestamps);
                
                    const largestGap = findLargestGap(timestamps!, duration);
                    if (largestGap) {
                        console.log('Largest Gap Start:', largestGap[0]);
                        console.log('Largest Gap End:', largestGap[1]);
                
                        await editVideo(inputVideo, outputAutocutPath, chatId, bot,  largestGap[0].toString(), largestGap[1].toString()).then(async (outputAutocutPath:string) => {
                            await sendVideoToChat(outputAutocutPath, chatId, bot, "Auto-cut Sermon Part");
                        })
                
                    } else {
                        console.log('No gap found meeting the criteria.');
                    }
                    resolve();
                }, (progress: number) => {
                    progressCallback(progress);
                });
            });
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

export {extractMainSermon}

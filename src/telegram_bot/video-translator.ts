// import ffmpeg from 'fluent-ffmpeg';
// import { translate } from '@vitalets/google-translate-api';
// import { createWorker } from 'tesseract.js';

// // Path to the input video file
// const inputVideoPath = './test-short.mp4';

// // Path to the output video file
// const outputVideoPath = './translated.mp4';

// // Function to translate the Korean text using Whisper
// async function translateText(text: string): Promise<string> {
//     const { text: translation } = await translate(text, { to: 'en' });

//     return translation;
// }

// // Function to process each slide in the video
// async function processSlide(slide: any): Promise<any> {
//     const koreanText = slide.text; // Extract Korean text from the slide
//     const translatedText = await translateText(koreanText); // Translate the Korean text to English

//     // Overlay the translated text onto the slide
//     slide.addText(translatedText, {
//         x: slide.boundingBox.x,
//         y: slide.boundingBox.y,
//         fontcolor: slide.color,
//     });

//     return slide;
// }

// // Function to process the video
// async function processVideo() {

//     // Create a Tesseract.js worker
//     const worker = await createWorker('eng');

//     try {
        
//         // Extract the slides from the video using OCR
//         await new Promise((resolve, reject) => {
//             ffmpeg(inputVideoPath)
//             .output(outputVideoPath)
//             .outputOptions('-vf', 'fps=1/1')
//             .on('end', resolve)
//             .on('error', reject)
//             .run();
//         });

//         // Loop through each frame of the video and run the worker on that
//         const processedSlides = [];

//         const { data: frames } = await worker.recognize();
//         for (var frame in frames) { 

//             const slideText = frame;
//             const translatedText = await translateText(slideText); // Translate the slide text to English
//             const slide = { text: translatedText, boundingBox: { x: 0, y: 0 }, color: 'white' };
//             processedSlides.push(slide);
//         }
//     } catch (error) {
//         console.error('An error occurred:', error);
//     } finally {
//         // Terminate the Tesseract.js worker
//         await worker.terminate();
//     }
// }

// // Run the video processing
// processVideo().catch((error) => {
//     console.error('An error occurred:', error);
// });
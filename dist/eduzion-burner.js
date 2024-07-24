"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    // Set the viewport size to match the video dimensions
    await page.setViewport({ width: 1280, height: 720 });
    // Navigate to the URL of the video
    // Restore the saved login session
    await page.goto('https://www.eduzion.org/#/study/courses/10572/1', { waitUntil: 'networkidle0' });
    // Click the button to login
    await page.click('.layout-desktopPanel-registerButton');
    // Wait for the login form elements to appear
    await page.waitForSelector('#loginFormInputEmail');
    // Fill in the login form
    await page.type('#loginFormInputEmail', '00371217-00174');
    await page.type('#loginFormInputPassword', 'yeoybDE2G');
    // Submit the login form
    await page.click('button[type="submit"]');
    // Wait for the class: main-background-container then try the video link again
    await page.waitForSelector('.main-background-container');
    await page.goto('https://www.eduzion.org/#/study/courses/10572/1', { waitUntil: 'networkidle0' });
    // Wait for the iframe to load
    await page.waitForSelector('iframe');
    // Get the iframe element
    const iframeElement = await page.$('iframe');
    // Get the iframe's content frame
    const frame = await iframeElement.contentFrame();
    // Wait for the video to load inside the iframe
    await frame.waitForSelector('video');
    // Start recording the video using MediaRecorder API
    // Execute JavaScript code inside the frame to get the video element
    await frame.evaluate(async () => {
        const videoElement = document.querySelector('video');
        // Capture the media stream from the video element
        const mediaStream = videoElement.captureStream();
        var chunks = [];
        const mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = (event) => {
            chunks.push(event.data);
            const progress = Math.round((chunks.length / 100) * 100);
            console.log(`Video recording progress: ${progress}%`);
        };
        mediaRecorder.onstop = () => {
            // Save the video to the disk
            const blob = new Blob(chunks, { type: 'video/mp4' });
            const buffer = Buffer.from(blob.toString()); // Convert Blob to string before passing it to Buffer.from()
            fs.writeFileSync('video.mp4', buffer);
            console.log('Video recording completed');
        };
        mediaRecorder.start();
        setTimeout(() => {
            mediaRecorder.stop();
        }, 10000);
    });
    await browser.close();
})();
//# sourceMappingURL=eduzion-burner.js.map
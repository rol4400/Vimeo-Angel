const { ipcRenderer, contextBridge }= require('electron');
const settings = require('electron-settings');

// const settings = require('node:electron-settings');

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel, data) => {
            ipcRenderer.send(channel, data);
        },
        on: (channel, callback) => {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        },
    },
    receiveSettings: (callback) => {
        ipcRenderer.on('send-settings', (event, appSettings) => {
            callback(appSettings);
        });
    },
    requestSettings: () => {
        ipcRenderer.send('get-settings');
    },
    settings, // Expose electron-settings to the renderer process
});

// window.addEventListener('DOMContentLoaded', () => {
//     // Request settings from the main process
//     ipcRenderer.send('get-settings');

//     // Listen for the response and populate the chatrooms
//     ipcRenderer.on('send-settings', (event, appSettings) => {
//         // Now you have access to appSettings, and you can use it as needed
//         console.log(appSettings);

//         // Call your function to populate chatrooms here
//         populateChatrooms(appSettings);
//     });
// });
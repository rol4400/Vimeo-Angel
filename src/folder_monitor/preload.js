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
    getSettingsCallback: (callback) => {
        ipcRenderer.on('get-settings-callback', (event, appSettings) => {
            callback(appSettings);
        });
    },
    settings, // Expose electron-settings to the renderer process
});

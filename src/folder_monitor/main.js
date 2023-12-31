const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const axios = require('axios');
const settings = require('electron-settings');
const FormData = require('form-data');

let mainWindow;
let tray;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        useContentSize: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    tray = new Tray(path.join(__dirname, 'icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        { label: 'Quit', click: () => app.exit() },
    ]);

    tray.setContextMenu(contextMenu);
    tray.addListener("click", () => {
        mainWindow.show();
    })

    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    Promise.all([
        settings.get('folderToMonitor'),
        settings.get('chatroom'),
        settings.get('host'),
    ]).then(async ([folderToMonitor, chatroom, host]) => {
        const appSettings = {
            folderToMonitor: folderToMonitor,
            chatroom: chatroom,
            host: host,
        };

        // Start file monitoring
        await startFileMonitoring(appSettings);
    }).catch((error) => {
        console.error('Error resolving promises:', error.message);
    });
});

// Save the current settings
ipcMain.on('save-settings', (event, settingsData) => {

    console.log(settingsData);

    settings.set('folderToMonitor', settingsData.folderToMonitor);
    settings.set('chatroom', settingsData.chatroom);
    settings.set('host', settingsData.host);
});

// Get the current settings
ipcMain.on('get-settings', async (event) => {
    const appSettings = {
        folderToMonitor: await settings.get('folderToMonitor'),
        chatroom: await settings.get('chatroom'),
        host: await settings.get('host'),
    };

    // Send through a second ipc channel as a callback
    event.reply('get-settings-callback', appSettings);
});

// Reload the app
ipcMain.on('reload-app', (event) => {
    app.relaunch()
    app.exit()
})

// Function to start monitoring the specified folder
function startFileMonitoring(settings) {
    const watcher = chokidar.watch(settings.folderToMonitor, { 
        ignored: /^\./, 
        ignoreInitial: true, 
        persistent: true,
        awaitWriteFinish: true
    });

    watcher.on('add', (filePath) => {
        if (path.extname(filePath) === '.mp4') {
            uploadFile(filePath, settings);
        }
    });
}

// Function to upload the file to the API
async function uploadFile(filePath, appSettings) {

    let bodyData = new FormData();
    bodyData.append('file', fs.createReadStream(filePath));

    let queryData = new FormData();
    queryData.append('chatroom', 'Vimeo Angel Admin Room,-4061080652');

    console.log("Uploading file...")

    // Upload request configuration
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `http://${appSettings.host}/upload?${queryData.toString()}`,
        headers: { 
                ...bodyData.getHeaders()
        },
        data : bodyData
    };

    // Try upoload the file
    try {
        const response = await axios.request(config);

        if (response.status === 200) {

            // File uploaded successfully, delete local file
            // fs.unlinkSync(filePath); TODO: What to do about deleting files
            console.log("Upload completed successfully")
        }
    } catch (error) {
        console.error('Error uploading file:', error.message);
    }
}

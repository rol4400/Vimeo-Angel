const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const axios = require('axios');
const settings = require('electron-settings');

let mainWindow;
let tray;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.loadFile('index.html');

    tray = new Tray(path.join(__dirname, 'icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        { label: 'Quit', click: () => app.quit() },
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
        settings.get('host'),
        settings.get('chatroom'),
    ]).then(([folderToMonitor, host, chatroom]) => {
        const appSettings = {
            folderToMonitor: folderToMonitor,
            host: host,
            chatroom: chatroom,
        };

        // Start file monitoring
        startFileMonitoring(appSettings);
    }).catch((error) => {
        console.error('Error resolving promises:', error.message);
    });
});

ipcMain.on('save-settings', (event, settingsData) => {
    settings.set('folderToMonitor', settingsData.folderToMonitor);
    settings.set('host', settingsData.host);
    settings.set('chatroom', settingsData.chatroom);
});

ipcMain.on('get-settings', async (event) => {
  const appSettings = {
      folderToMonitor: await settings.get('folderToMonitor'),
      host: await settings.get('host'),
      chatroom: await settings.get('chatroom'),
  };

  event.reply('send-settings', appSettings);
});

// Function to start monitoring the specified folder
function startFileMonitoring(settings) {
    const watcher = chokidar.watch(settings.folderToMonitor, { ignored: /^\./, persistent: true });

    watcher.on('add', (filePath) => {
        if (path.extname(filePath) === '.mp4') {
            uploadFile(filePath, settings);
        }
    });
}

// Function to upload the file to the API
async function uploadFile(filePath, settings) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    try {
        const response = await axios.post(`http://${settings.host}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        if (response.status === 200) {
            // File uploaded successfully, delete local file
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('Error uploading file:', error.message);
    }
}

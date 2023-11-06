"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { app, BrowserWindow, dialog } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
let mainWindow;
let watcher;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true, // Enable context isolation
        },
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('activate', function () {
    if (mainWindow === null)
        createWindow();
});
// Handle selecting the folder to monitor
app.on('ready', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (!result.canceled) {
        const folderToMonitor = result.filePaths[0];
        startFileWatcher(folderToMonitor);
    }
});
function startFileWatcher(folderToMonitor) {
    // Watch the specified folder and its subdirectories for new MP4 files
    watcher = chokidar.watch(folderToMonitor, { ignored: /(^|[\/\\])\../, persistent: true, depth: 99 });
    watcher.on('add', (filePath) => {
        if (path.extname(filePath) === '.mp4') {
            console.log(`New MP4 file detected: ${filePath}`);
            // Call your dummy function here
            dummyFunction(filePath);
        }
    });
    watcher.on('error', (error) => {
        console.error(`Watcher error: ${error}`);
    });
}
function dummyFunction(filePath) {
    // Replace this with your actual processing logic
    console.log(`Processing file: ${filePath}`);
}
// Handle quitting the app on macOS
app.on('before-quit', () => {
    if (watcher) {
        watcher.close();
    }
});
//# sourceMappingURL=index.js.map
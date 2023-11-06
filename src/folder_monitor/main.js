require('dotenv').config();

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { Deta } = require('deta');

const deta = Deta(process.env.DETA_PROJECT_KEY);
const drive = deta.Drive('FileStorage'); 

// Ensure the directory for user data exists
const userDataPath = app.getPath('userData');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath);
}

// Load saved settings
let folderToMonitor = '';
let selectedChatroom = '';

const settingsFilePath = path.join(userDataPath, 'settings.json');
try {
  const data = fs.readFileSync(settingsFilePath);
  const settings = JSON.parse(data);
  folderToMonitor = settings.folderToMonitor || '';
  selectedChatroom = settings.selectedChatroom || '';
} catch (error) {
  console.error('Error loading settings:', error);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (!result.canceled) {
    folderToMonitor = result.filePaths[0];
    mainWindow.webContents.send('update-folder', folderToMonitor);
  }
});

ipcMain.on('refresh-chatrooms', () => {
  // Placeholder for API request to load chatrooms
  const chatrooms = ['Chatroom 1', 'Chatroom 2', 'Chatroom 3'];
  mainWindow.webContents.send('update-chatrooms', chatrooms);
});

ipcMain.on('start-monitoring', () => {
  if (folderToMonitor) {
    startFileWatcher(folderToMonitor);
    saveSettings();
  } else {
    dialog.showErrorBox('Error', 'Please select a folder to monitor.');
  }
});

function startFileWatcher(folderToMonitor) {
  // Watch the specified folder and its subdirectories for new MP4 files
  const watcher = chokidar.watch(folderToMonitor, { ignored: /(^|[\/\\])\../, persistent: true, depth: 99 });

  watcher.on('add', (filePath) => {
    if (path.extname(filePath) === '.mp4') {
      console.log(`New MP4 file detected: ${filePath}`);
      sendFile(filePath);
    }
  });

  watcher.on('error', (error) => {
    console.error(`Watcher error: ${error}`);
  });
}

async function sendFile(filePath) {
  // Replace this with your actual processing logic
  console.log(`Processing file: ${filePath}`);

  // Upload the file to Deta space
  try {
    const fileData = fs.readFileSync(filePath);
    const response = await drive.put(fileName, fileData);
    console.log('File uploaded successfully:', response);
  } catch (error) {
    console.error('Error uploading file:', error);
  }

  // Trigger it to be sent to telegram
  
}

function saveSettings() {
  const settings = {
    folderToMonitor,
    selectedChatroom,
  };
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings));
}

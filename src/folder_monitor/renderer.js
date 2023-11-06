// renderer.js
const { ipcRenderer } = require('electron');

// Example: Send a message to the main process
ipcRenderer.send('renderer-message', 'Hello from the renderer process!');

// Example: Receive a message from the main process
ipcRenderer.on('main-message', (event, data) => {
  console.log('Received message in renderer process:', data);
});

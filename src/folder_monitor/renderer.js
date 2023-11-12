// Save the settings
function saveSettings() {
    const folderToMonitor = document.getElementById('folderInput').value;
    const chatroom = document.getElementById('chatroomSelect').value;
    const host = document.getElementById('hostInput').value;

    const settings = {
        folderToMonitor,
        chatroom,
        host,
    };

    // Save the settings
    console.log(settings);
    window.electron.ipcRenderer.send('save-settings', settings);

    // Refresh the chatrooms list if needed
    populateChatrooms(settings)
}

// Load the settings
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Request settings from the main process
        window.electron.ipcRenderer.send('get-settings');

        // Receive settings from the main process
        const appSettings = await new Promise((resolve) => {
            window.electron.getSettingsCallback((settings) => {
                resolve(settings);
            });
        })

        // Check if appSettings is valid before accessing properties
        if (appSettings) {

            // Call your function to populate chatrooms here
            populateChatrooms(appSettings);

            // Now you have access to appSettings, set the values in your input fields
            document.getElementById('folderInput').value = appSettings.folderToMonitor || '';
            document.getElementById('chatroomSelect').value = appSettings.chatroom || '';
            document.getElementById('hostInput').value = appSettings.host || '';

        } else {
            console.error('Invalid settings');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
});

// Register folder selection
function selectFolder() {
  const folderSelector = document.getElementById('folderSelector');
  folderSelector.addEventListener('change', (event) => {

        // Use a bit of an exploit to get the full path
        // TODO: Check if this works with no files in the folder
        const folderName = folderSelector.files[0].webkitRelativePath.split("/")[0];
        const folderPath = folderSelector.files[0].path.split(folderName)[0] + folderName
        document.getElementById('folderInput').value = folderPath;
  });

  // Trigger a click on the hidden file input to open the file dialog
  folderSelector.click();
}

// Refresh the chatrooms list
async function populateChatrooms(appSettings) {
  try {
      // Check if appSettings is valid before proceeding
      if (!appSettings || !appSettings.host || appSettings.host == "") {
          console.error('Invalid appSettings or missing host property.');
          return;
      }

      // Request chatrooms from the API using standard AJAX
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `http://${appSettings.host}/getChats`, true);

      xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
              // Successful response, populate chatrooms in the HTML
              const response = JSON.parse(xhr.responseText);
              const chatroomSelect = document.getElementById('chatroomSelect');
              chatroomSelect.innerHTML = '';  // Clear existing options

              response.forEach((chat) => {
                  const option = document.createElement('option');
                  option.value = chat;
                  option.text = chat;
                  chatroomSelect.appendChild(option);
            });

            document.getElementById('chatroomSelect').value = appSettings.chatroom || '';

          } else {
              console.error('Error fetching chatrooms:', xhr.statusText);
          }
      };

      xhr.onerror = function () {
          console.error('Network error while fetching chatrooms.');
      };

      xhr.send();
  } catch (error) {
      console.error('Error during chatrooms population:', error.message);
  }
}
require('dotenv').config();

// Telegram MTPROTO API Configuration
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// Telegram API configuration
const apiId = parseInt(process.env.TELE_API_ID!);
const apiHash = process.env.TELE_API_HASH!;
const session = new StringSession("");

let globalPhoneCodePromise:any
function generatePromise() {
    let resolve
    let reject
    let promise = new Promise((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
    })
    
    return { resolve, reject, promise }
}

let teleClient;

function generateClient(phoneNumber, session) {
    var client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });

    client.connect();

    return client;
}


function checkAuthenticated (userClients, userId) {


    // Skip all this if we're already authenticated
    if (userClients.clients[userId] != null) { return userClients.clients[userId];}

    // Account for null sessions
    if (userClients.sessions == undefined) { return null; }

    // Check we have a hash code
    const userData = userClients.sessions.find((user) => {
        return user.id == userId;
    });

    try {
        if (userData.hash != "") {
            const session = new StringSession(userData.session)
            var client = generateClient(userData.phoneNumber, session)
            console.log(1); console.log(client);
            return client; // Success, we are authenticated. Send back the client

        }
    } catch (error) {
        // Client generation failed, so the authentication given is invalid
        return null;
    }
}

function requestCode(phoneNumber) {

    globalPhoneCodePromise = generatePromise()
    teleClient = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });
    teleClient.start({
        phoneNumber: async () =>phoneNumber,
        phoneCode: async () => {
            let code = await globalPhoneCodePromise.promise

            // In case the user provided a wrong code, gram.js will try to call this function again
            // We generate a new promise here to allow user enter a new code later
            globalPhoneCodePromise = generatePromise()

            return code
        },
        onError: (err:any) => console.log(err),
    })
}

function setCode(configDb, phoneCode) {
    
    globalPhoneCodePromise.resolve(phoneCode);


    // Save the session
    // configDb.put({ phone: teleClient._phone, session: teleClient.session.save() });

    // Close the client after completing the authentication process
    // client.close();
}



export { requestCode, setCode, checkAuthenticated }
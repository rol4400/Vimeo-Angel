require('dotenv').config();

// Telegram MTPROTO API Configuration
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// Telegram API configuration
const apiId = parseInt(process.env.TELE_API_ID!);
const apiHash = process.env.TELE_API_HASH!;
const session = new StringSession("");

// Create a promise for use in prompting the user for 2FA phone codes
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

// Request a 2fa code and create a promise to catch when the code is given
async function getPhoneCode(client, phoneNumber) {
    globalPhoneCodePromise = generatePromise();
    // client = new TelegramClient(session, apiId, apiHash, {
    //     connectionRetries: 5,
    // });

    try {
        await client.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async () => {
                let code = await globalPhoneCodePromise.promise;

                // Generate a new promise for the next code entry
                globalPhoneCodePromise = generatePromise();

                return code;
            },
            onError: (err: any) => {
                console.error('Error during authentication:', err);
                // Handle the error appropriately (logging, messaging the user, etc.)
                // You might want to reject the promise here
                globalPhoneCodePromise.reject(err);
            },
        });
    } catch (error) {
        // Handle start errors (e.g., network issues, invalid API credentials)
        console.error('Error starting the Telegram client:', error);
    }
}

async function savePhoneCode(configDb, client, phoneNumber) {
    try {
        globalPhoneCodePromise.resolve(phoneNumber);
        // await client.start();
        configDb.put({ phone: phoneNumber, session: client.session.save() });
    } catch (error) {
        console.error('Error saving phone code:', error);
        // Handle the error appropriately (logging, messaging the user, etc.)
        // You might want to reject the promise here
        globalPhoneCodePromise.reject(error);
    }
}
export {getPhoneCode, savePhoneCode}
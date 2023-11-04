
require('dotenv').config();

// Telegram MTPROTO API Configuration
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require("input");

// Telegram API configuration
const apiId = parseInt(process.env.TELE_API_ID);
const apiHash = process.env.TELE_API_HASH;
const session = new StringSession("");

const client = new TelegramClient(session, apiId, apiHash, {});

function setPhoneCode() {
    return new Promise((resolve) => {

    });
}

function setPhoneNumber() {
    return new Promise((resolve) => {

    });
}

(async function run() {
    // Authenticate as a user
    await client.start({
        phoneNumber: async () => await (phoneNumberPromise || (phoneNumberPromise = promptPhoneNumber())),
        // password: async () => await (passwordPromise || (passwordPromise = promptPassword())),
        phoneCode: async () => await (phoneCodePromise || (phoneCodePromise = promptPhoneCode())),
        onError: (err) => console.log(err),
    });
  
    await client.connect();
  
    console.log("You should now be connected.");
    console.log(client.session.save());
  
})()
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTime = exports.formatTime = exports.getUserId = void 0;
// Function to parse time in hh:mm or hh:mm:ss format
function parseTime(input) {
    const timeRegex = /^(?:(\d{1,2}):)?([0-5]?\d)(?::([0-5]?\d))?$/;
    const match = input.match(timeRegex);
    if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
    }
    console.log("Couldn't match a time in hh:mm:ss or hh:mm format");
    return null;
}
exports.parseTime = parseTime;
// Function to format time in hh:mm:ss format
function formatTime(seconds) {
    const hours = Math.floor(parseInt(seconds) / 3600);
    const minutes = Math.floor((parseInt(seconds) % 3600) / 60);
    const remainingSeconds = parseInt(seconds) % 60;
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
}
exports.formatTime = formatTime;
// Function to pad zero for single-digit numbers
function padZero(num) {
    return num.toString().padStart(2, '0');
}
// Function to get user ID from context
function getUserId(ctx) {
    return ctx.from?.id || ctx.message?.from?.id;
}
exports.getUserId = getUserId;
//# sourceMappingURL=helpers.js.map
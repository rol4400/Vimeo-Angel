import { UserSettings } from "./bot";
import Base from 'deta/dist/types/base';
declare function enqueueFile(ctx: any, userId: string, userSettings: UserSettings, processingTime: string, queueDb: Base, bot: any): Promise<void>;
declare function getCurrentDate(): string;
declare function editVideo(inputPath: string, outputPath: string, chatId: number, bot: any, startTime?: string, endTime?: string): Promise<string>;
declare function sendVideoToChat(filePath: string, chatId: number, bot: any, message: string): Promise<void>;
declare function processUpload(ctx: any, bot: any, userSettings: UserSettings, promptSendVideo: Function, silent: boolean): Promise<boolean>;
export { processUpload, enqueueFile, getCurrentDate, sendVideoToChat, editVideo };

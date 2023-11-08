import "dotenv/config.js";
interface UserSetting {
    date?: string;
    password?: string;
    title?: string;
    leader?: string;
    startTime?: string;
    endTime?: string;
    videoFileId?: string;
    videoDuration?: number;
    destination?: string;
    phoneNumber?: string;
    vimeoLink?: string;
    videoPath?: string;
}
interface UserSettings {
    [userId: string]: UserSetting;
}
declare function sendToDestination(ctx: any, chatId: string, silent: boolean): void;
export { UserSettings, UserSetting, sendToDestination };

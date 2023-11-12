import { UserSettings } from "./bot";
import Base from 'deta/dist/types/base';
declare function enqueueFile(ctx: any, userId: string, userSettings: UserSettings, processingTime: string, queueDb: Base, bot: any): Promise<void>;
declare function testCutting(inputPath: string, fileName: string): Promise<void>;
declare function processUpload(ctx: any, bot: any, userSettings: UserSettings, promptSendVideo: Function, silent: boolean): Promise<boolean>;
export { processUpload, enqueueFile, testCutting };

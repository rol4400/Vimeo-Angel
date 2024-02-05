declare function startFileWatcher(bot: any, folderToMonitor: string): void;
declare function processNewlyDetectedFile(bot: any, filePath: string, destinationChatId: number): Promise<void>;
export { startFileWatcher, processNewlyDetectedFile };

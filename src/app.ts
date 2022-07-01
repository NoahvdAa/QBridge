import express, { Express } from 'express';
import { initDB } from './model';
import { AuthorController, ChannelController, MessageController, PlatformMessageController, StatsController } from './controller';
import { DiscordPlatform } from './platform/DiscordPlatform';
import { WhatsAppPlatform } from './platform/WhatsAppPlatform';
import fs from 'fs';

export class App {
    private static instance: App;
    private app: Express;
    public discordPlatform: DiscordPlatform;
    public whatsAppPlatform: WhatsAppPlatform;

    constructor() {
        App.instance = this;
        this.app = express();
    }

    /**
     * Returns the active QBridge App instance.
     *
     * @returns the app instance
     */
    public static getInstance(): App {
        return App.instance;
    }

    public async start(): Promise<void> {
        const config: any = JSON.parse(fs.readFileSync(process.env.CONFIG_PATH || './config.json', 'utf-8'));
        const port: number = config.httpPort || 3000;

        await initDB(config.sequelizeConfig);

        [AuthorController, ChannelController, MessageController, PlatformMessageController, StatsController].forEach(controller => controller.apply(this.app));
        this.discordPlatform = new DiscordPlatform(config);
        this.whatsAppPlatform = new WhatsAppPlatform(config);

        this.app.listen(port, () => {
            console.log(`Server listening on port ${port}.`);
        });
    }

};

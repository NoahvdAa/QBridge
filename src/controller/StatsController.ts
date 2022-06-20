import { Express } from 'express';
import { Message, MessagePlatform } from '../model';

export class StatsController {

    private static started: Date = new Date();

    static apply(app: Express): void {
        app.get('/api/v1/stats', async (req, res) => {
            const uptime: number = Date.now() - this.started.getTime();
            const discordCount: number = await Message.count({
                where: {
                    originalPlatform: MessagePlatform.DISCORD
                }
            });
            const whatsAppCount: number = await Message.count({
                where: {
                    originalPlatform: MessagePlatform.WHATSAPP
                }
            });
            const totalAttachmentSize: number = await Message.sum('attachmentSize');

            res.json({
                uptime,
                messageCounts: {
                    discord: discordCount,
                    whatsApp: whatsAppCount
                },
                totalAttachmentSize
            });
        });
    }

}

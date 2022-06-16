import { Express } from 'express';
import { Author, Channel, Message, MessagePlatform, PlatformMessage } from '../model';
import { Op } from 'sequelize';

export class PlatformMessageController {

    static apply(app: Express): void {
        app.get('/api/v1/platformmessages/:id', async (req, res) => {
            const { id } = req.params;
            const platformMessage: PlatformMessage | null = await PlatformMessage.findOne({
                where: {
                    [Op.or]: [{ platformMessageId: id }]
                },
                include: [{ model: Message, include: [Author, Channel, { model: Message, include: [Author, Channel] }] }],
                nest: true
            });

            if (platformMessage === null) {
                res.status(404);
                return res.json({ message: '404 Not Found', error: 'notFound', errorCode: 404 });
            }

            res.json(platformMessage);
        });
    }

}

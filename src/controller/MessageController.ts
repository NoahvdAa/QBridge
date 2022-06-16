import { Express } from 'express';
import { Author, Channel, Message, MessagePlatform, PlatformMessage } from '../model';
import { Op } from 'sequelize';

export class MessageController {

    static apply(app: Express): void {
        app.get('/api/v1/messages/:id', async (req, res) => {
            const { id } = req.params;
            const message: Message | null = await Message.findOne({
                where: {
                    [Op.or]: [{ id }]
                },
                include: [Author, Channel, { model: Message, include: [Author, Channel, PlatformMessage] }, PlatformMessage],
                nest: true
            });

            if (message === null) {
                res.status(404);
                return res.json({ message: '404 Not Found', error: 'notFound', errorCode: 404 });
            }

            res.json(message);
        });
    }

}

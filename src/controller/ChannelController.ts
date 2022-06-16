import { Express } from 'express';
import { Channel } from '../model';
import { Op } from 'sequelize';

export class ChannelController {

    static apply(app: Express): void {
        app.get('/api/v1/channels', async (req, res) => {
            res.json(await Channel.findAll());
        });

        app.get('/api/v1/channels/:id', async (req, res) => {
            const { id } = req.params;
            const channel: Channel | null = await Channel.findOne({
                where: {
                    [Op.or]: [{ id }, { discordId: id }, { whatsAppId: id }]
                }
            });

            if (channel === null) {
                res.status(404);
                return res.json({ message: '404 Not Found', error: 'notFound', errorCode: 404 });
            }

            res.json(channel);
        });
    }

}

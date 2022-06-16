import { Express } from 'express';
import { Author } from '../model';
import { Op } from 'sequelize';

export class AuthorController {

    static apply(app: Express): void {
        app.get('/api/v1/authors', async (req, res) => {
            res.json(await Author.findAll());
        });

        app.get('/api/v1/authors/:id', async (req, res) => {
            const { id } = req.params;
            const author: Author | null = await Author.findOne({
                where: {
                    [Op.or]: [{ id }, { discordId: id }, { whatsAppPhoneNumber: id }]
                }
            });

            if (author === null) {
                res.status(404);
                return res.json({ message: '404 Not Found', error: 'notFound', errorCode: 404 });
            }

            res.json(author);
        });
    }

}

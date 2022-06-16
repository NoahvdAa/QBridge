import { Sequelize } from 'sequelize-typescript';
import { Author, PermissionLevel } from './Author';
import { Channel } from './Channel';
import { Message, MessageAttachmentType, MessagePlatform } from './Message';
import { PlatformMessage, PlatformMessageType } from './PlatformMessage';

export const initDB = async (sequelizeConfig: any) => {
    const sequelize = new Sequelize(sequelizeConfig);

    sequelize.addModels([Author, Channel, Message, PlatformMessage]);

    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
};

export { Author, Channel, Message, MessageAttachmentType, MessagePlatform, PermissionLevel, PlatformMessage, PlatformMessageType };

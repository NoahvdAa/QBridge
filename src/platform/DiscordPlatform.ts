import { Client, Intents, Sticker } from 'discord.js';
import { Client as WhatsAppClient, Chat, Message as WhatsAppMessage, MessageMedia, ContactId } from 'whatsapp-web.js';
import { Util as DiscordUtil, Message as DiscordMessage } from 'discord.js';
import { App } from '../app';
import { Author, Channel, Message, MessageAttachmentType, MessagePlatform, PlatformMessage, PlatformMessageType } from '../model';
import { TaskQueue } from '../queue/TaskQueue';
import { format, replaceAll } from '../util/format';
import { Flags } from '../model/Author';

const DISCORD_TO_WHATSAPP_FORMATTING = [
    {
        wildcard: '~~',
        openTag: '~',
        closeTag: '~'
    },
    {
        wildcard: '*',
        openTag: '_',
        closeTag: '_'
    },
    {
        wildcard: '**',
        openTag: '*',
        closeTag: '*'
    },
    {
        wildcard: '`',
        openTag: '```',
        closeTag: '```'
    }
    // _ = _ on WhatsApp, no need to replace
];

export class DiscordPlatform {

    public client: Client;
    private config: any;
    private taskQueue: TaskQueue;

    constructor(config: any) {
        this.config = config;
        this.client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_TYPING] });
        this.taskQueue = new TaskQueue();

        this.bootstrap();
    }

    private async bootstrap(): Promise<void> {
        this.client.on('messageCreate', (msg: DiscordMessage) => this.taskQueue.addAndProcess(async () => {
            const channel: Channel | null = await Channel.findOne({
                where: {
                    discordId: msg.channel.id
                }
            });

            // This channel isn't bridged
            if (channel === null) return;

            // This is our webhook! Don't echo back what we just sent from WA
            if (msg.webhookId && channel.discordWebhookURL.indexOf(`/api/webhooks/${msg.webhookId}/`) !== -1) return;

            const [author, created]: [Author, boolean] = await Author.findOrCreate({
                where: {
                    discordId: msg.author.id
                },
                defaults: {
                    discordId: msg.author.id,
                    displayName: msg.member?.nickname || msg.author.username,
                    flags: msg.author.bot ? Flags.IS_BOT : 0
                }
            });

            let waMessageOptions: any = { mentions: [] };
            let attachmentType: MessageAttachmentType | null = null;
            let attachmentSize: number | null = null;
            if (msg.stickers.size !== 0) {
                attachmentType = MessageAttachmentType.STICKER;
            } else if (msg.attachments.size !== 0) {
                waMessageOptions.media = await MessageMedia.fromUrl(msg.attachments.first()!.url);
                attachmentSize = msg.attachments.first()!.size;
                const mimeCat: string = waMessageOptions.media.mimetype.toLowerCase().split('/')[0];

                switch (mimeCat) {
                    case 'audio':
                        attachmentType = MessageAttachmentType.AUDIO;
                        break;
                    case 'image':
                        attachmentType = MessageAttachmentType.IMAGE;
                        break;
                    case 'video':
                        attachmentType = MessageAttachmentType.VIDEO;
                        break;
                    default:
                        attachmentType = MessageAttachmentType.DOCUMENT;
                        break;
                }
            }

            const message: Message = await Message.create({
                authorId: author.id,
                channelId: channel.id,
                originalPlatform: MessagePlatform.DISCORD,
                attachmentType,
                attachmentSize,
                content: msg.content
            });

            const whatsAppClient: WhatsAppClient = App.getInstance().whatsAppPlatform.client;
            const targetChat: Chat = await whatsAppClient.getChatById(channel.whatsAppId);

            let escapedContent: string = msg.content || ((msg.embeds.length !== 0 ? msg.embeds[0].description : null) || '[no content]');
            for (const [id, mentioned] of msg.mentions.users) {
                const mentionedAuthor: Author | null = await Author.findOne({
                    where: {
                        discordId: mentioned.id
                    }
                });
                if (mentionedAuthor === null || mentionedAuthor.whatsAppPhoneNumber === null) continue;

                const waId: ContactId | null = await whatsAppClient.getNumberId(mentionedAuthor.whatsAppPhoneNumber);
                if (waId === null) continue;
                escapedContent = replaceAll(escapedContent, `<@${mentioned.id}>`, `@${mentionedAuthor.whatsAppPhoneNumber}`);
                escapedContent = replaceAll(escapedContent, `<@!${mentioned.id}>`, `@${mentionedAuthor.whatsAppPhoneNumber}`);
                waMessageOptions.mentions.push(await whatsAppClient.getContactById(waId._serialized));
            }
            escapedContent = DiscordUtil.cleanContent(escapedContent, msg.channel) || '[no content]';
            const emoji = escapedContent.match(/<a:.+?:\d+>|<:.+?:\d+>/g);
            if (emoji !== null) {
                for (const emote of emoji) {
                    const parts: string[] = emote.replace(/\<|\>/g, '').split(':');
                    const extension: string = parts[0] === 'a' ? 'gif' : 'png';
                    const url: string = `https://cdn.discordapp.com/emojis/${parts[2]}.${extension}`;
                    escapedContent = replaceAll(escapedContent, emote, `:${parts[1]}: (${url})`);
                }
            }

            if (attachmentType === MessageAttachmentType.STICKER) {
                escapedContent = '[sticker]';
            }

            let whatsAppMessageContents: string = `*<${author.displayName}>* ${format(escapedContent, DISCORD_TO_WHATSAPP_FORMATTING)}`;
            let messageType: PlatformMessageType = PlatformMessageType.MESSAGE;
            if (msg.type === 'CHANNEL_PINNED_MESSAGE') {
                whatsAppMessageContents = `📌 *${author.displayName}* pinned a message`;
                messageType = PlatformMessageType.SYSTEM;
            }

            await PlatformMessage.create({
                messageId: message.id,
                platform: MessagePlatform.DISCORD,
                platformMessageId: msg.id,
                platformMessageType: messageType
            });

            if ((msg.type === 'CHANNEL_PINNED_MESSAGE' || msg.type === 'REPLY') && msg.reference) {
                const referencedDiscordMessage: DiscordMessage = await msg.fetchReference();
                const referencePlatformMessage: PlatformMessage | null = await PlatformMessage.findOne({
                    where: {
                        platformMessageId: referencedDiscordMessage.id
                    }
                });
                const referenceWhatsAppPlatformMessage: PlatformMessage | null = !referencePlatformMessage ? null : await PlatformMessage.findOne({
                    where: {
                        platform: MessagePlatform.WHATSAPP,
                        platformMessageType: PlatformMessageType.MESSAGE,
                        messageId: referencePlatformMessage.messageId
                    }
                });
                // Inserting will become a pain if we don't do it where we do it now, so we'll just update. Not a great solution, but it's w/e
                if (referencePlatformMessage !== null) await Message.update({ replyToId: referencePlatformMessage.messageId }, { where: { id: message.id } });

                if (referenceWhatsAppPlatformMessage) {
                    waMessageOptions.quotedMessageId = referenceWhatsAppPlatformMessage.platformMessageId;
                } else {
                    const authorName: string = referencedDiscordMessage.member?.nickname || referencedDiscordMessage.author.username;
                    const escapedReplyContent: string = DiscordUtil.cleanContent(referencedDiscordMessage.content, referencedDiscordMessage.channel) || '[no content]';
                    let truncatedReplyContent: string = format(escapedReplyContent, DISCORD_TO_WHATSAPP_FORMATTING);
                    if (truncatedReplyContent.length > 50) {
                        truncatedReplyContent = truncatedReplyContent.substring(0, 50) + '...';
                    }
                    const whatsAppReplyMessageContents: string = `Reply to '*<${authorName}>* ${truncatedReplyContent}'`;
                    const whatsAppReplyMessage: WhatsAppMessage = await targetChat.sendMessage(whatsAppReplyMessageContents, waMessageOptions);
                    await PlatformMessage.create({
                        messageId: message.id,
                        platform: MessagePlatform.WHATSAPP,
                        platformMessageId: whatsAppReplyMessage.id._serialized,
                        platformMessageType: PlatformMessageType.REPLY_INDICATOR
                    });
                }
            }

            let whatsAppMessage: WhatsAppMessage;
            try {
                whatsAppMessage = await targetChat.sendMessage(whatsAppMessageContents, waMessageOptions);
            } catch (e) {
                console.error('Failed to bridge message, retrying without attachment:');
                console.error(e);
                whatsAppMessageContents += '\n\n❌ Attachment upload failed';
                waMessageOptions.media = undefined;
                whatsAppMessage = await targetChat.sendMessage(whatsAppMessageContents, waMessageOptions);
            }

            await PlatformMessage.create({
                messageId: message.id,
                platform: MessagePlatform.WHATSAPP,
                platformMessageId: whatsAppMessage.id._serialized,
                platformMessageType: PlatformMessageType.MESSAGE
            });

            if (attachmentType === MessageAttachmentType.STICKER) {
                let stickerMessageOptions: any = {};
                const sticker: Sticker = msg.stickers.first()!;
                let stickerMsg: string = '';

                if (!sticker.url.endsWith('.json')) {
                    stickerMessageOptions.media = await MessageMedia.fromUrl(sticker.url);
                    stickerMessageOptions.sendVideoAsGif = true;
                    stickerMessageOptions.sendMediaAsSticker = true;
                    stickerMessageOptions.stickerName = sticker.name;
                    stickerMessageOptions.stickerAuthor = sticker.guild?.name || 'Discord';
                } else {
                    stickerMsg = '❌ Unbridgeable sticker';
                }

                const whatsAppStickerMessage: WhatsAppMessage = await targetChat.sendMessage(stickerMsg, stickerMessageOptions);
                await PlatformMessage.create({
                    messageId: message.id,
                    platform: MessagePlatform.WHATSAPP,
                    platformMessageId: whatsAppStickerMessage.id._serialized,
                    platformMessageType: PlatformMessageType.ATTACHMENT
                });
            }
        }));

        this.client.once('ready', () => console.log(`Logged in as ${this.client.user!.tag}!`));

        this.client.login(this.config.tokens.discord);
    }

};

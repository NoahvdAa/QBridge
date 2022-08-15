import { Chat, Client, Contact, LocalAuth, Message as WhatsAppMessage, MessageMedia, MessageTypes as WhatsAppMessageTypes } from 'whatsapp-web.js';
import { Author, Channel, Message, MessageAttachmentType, MessagePlatform, PlatformMessage, PlatformMessageType } from '../model';
import { TaskQueue } from '../queue/TaskQueue';
import { Util as DiscordUtil, TextChannel as DiscordTextChannel, Client as DiscordClient, WebhookClient } from 'discord.js';
import { App } from '../app';
import { format, replaceAll } from '../util/format';
import { extension } from 'mime-types';
import qrcode from 'qrcode-terminal';

const WHATSAPP_TO_DISCORD_FORMATTING = [
    {
        wildcard: '~',
        openTag: '~~',
        closeTag: '~~'
    },
    {
        wildcard: '*',
        openTag: '**',
        closeTag: '**'
    },
    {
        wildcard: '```',
        openTag: '`',
        closeTag: '`'
    }
    // _ = _ on WhatsApp, no need to replace
];

const USER_ID_INVISIBLE_CHARS: string[] = ['\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u205f'];

export class WhatsAppPlatform {

    public client: Client;
    private config: any;
    private taskQueue: TaskQueue;

    constructor(config: any) {
        this.config = config;
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: this.config.puppeteerConfig
        });
        this.taskQueue = new TaskQueue();

        this.bootstrap();
    }

    private async bootstrap(): Promise<void> {
        this.client.on('message', (msg: WhatsAppMessage) => this.taskQueue.addAndProcess(async () => await this.handleMessage(msg)));

        this.client.on('qr', (qr: string) => {
            qrcode.generate(qr, { small: true });
        });

        this.client.once('ready', async () => {
            console.log(`Logged in as ${this.client.info.wid.user}!`)
            for (const chat of await this.client.getChats()) {
                if (chat.unreadCount === 0) continue;
                console.log(`Catching up on ${chat.unreadCount} unread message(s) from chat ${chat.name}...`);

                const messages: WhatsAppMessage[] = await chat.fetchMessages({ limit: chat.unreadCount });
                messages.sort((a, b) => a.timestamp - b.timestamp);
                for (const message of messages) {
                    this.taskQueue.addAndProcess(async () => await this.handleMessage(message));
                }
            }
        });

        this.client.initialize();
    }

    private async handleMessage(msg: WhatsAppMessage): Promise<void> {
        const chat: Chat = await msg.getChat();
        const channel: Channel | null = await Channel.findOne({
            where: {
                whatsAppId: chat.id._serialized
            }
        });

        // This channel isn't bridged
        if (channel === null) return;

        const contact: Contact = await msg.getContact();
        const [author, created]: [Author, boolean] = await Author.findOrCreate({
            where: {
                whatsAppPhoneNumber: contact.number
            },
            defaults: {
                whatsAppPhoneNumber: contact.number,
                displayName: contact.pushname
            }
        });

        let contentPrefix: string = '';
        let attachmentType: MessageAttachmentType | null = null;
        let media: MessageMedia | null = null;
        let mediaData: Buffer | null = null;
        let attachmentSize: number | null = null;
        if (msg.hasMedia) {
            media = await msg.downloadMedia();
            mediaData = media ? Buffer.from(media.data, 'base64') : null;
            attachmentSize = mediaData!.length;

            const mimeCat: string | null = media ? media.mimetype.toLowerCase().split('/')[0] : null;

            switch (mimeCat) {
                case 'audio':
                    attachmentType = MessageAttachmentType.AUDIO;
                    contentPrefix = this.config.attachmentIcons.AUDIO;
                    break;
                case 'image':
                    const isSticker = msg.type === WhatsAppMessageTypes.STICKER;

                    attachmentType = isSticker ? MessageAttachmentType.STICKER : MessageAttachmentType.IMAGE;
                    contentPrefix = isSticker ? this.config.attachmentIcons.STICKER : this.config.attachmentIcons.IMAGE;
                    break;
                case 'video':
                    attachmentType = MessageAttachmentType.VIDEO;
                    contentPrefix = this.config.attachmentIcons.VIDEO;
                    break;
                case null:
                    break;
                default:
                    attachmentType = MessageAttachmentType.DOCUMENT;
                    contentPrefix = this.config.attachmentIcons.DOCUMENT;
                    break;
            }
        }
        const message: Message = await Message.create({
            authorId: author.id,
            channelId: channel.id,
            originalPlatform: MessagePlatform.WHATSAPP,
            attachmentType,
            attachmentSize,
            content: msg.body
        });

        await PlatformMessage.create({
            messageId: message.id,
            platform: MessagePlatform.WHATSAPP,
            platformMessageId: msg.id._serialized,
            platformMessageType: PlatformMessageType.MESSAGE
        });

        const webhookClient: WebhookClient = new WebhookClient({ url: channel.discordWebhookURL });
        const discordClient: DiscordClient = App.getInstance().discordPlatform.client;
        const discordChannel: DiscordTextChannel = await discordClient.channels.cache.get(channel.discordId) as DiscordTextChannel;
        let profilePicURL: string = await contact.getProfilePicUrl();
        let escapedContent: string = contentPrefix + (DiscordUtil.cleanContent(msg.body, discordChannel) || '[no content]');
        let mentionedIds: string[] = [];
        for (const mentioned of await msg.getMentions()) {
            let name: string = `*@${mentioned.pushname}*`;
            const mentionedAuthor: Author | null = await Author.findOne({
                where: {
                    whatsAppPhoneNumber: mentioned.number
                }
            });
            if (mentionedAuthor !== null) {
                name = `*@${mentionedAuthor.displayName}*`;

                if (mentionedAuthor.discordId !== null) {
                    mentionedIds.push(mentionedAuthor.discordId);
                    name = `<@${mentionedAuthor.discordId}>`;
                }
            }

            escapedContent = replaceAll(escapedContent, `@${mentioned.number}`, name);
        }
        escapedContent = format(escapedContent, WHATSAPP_TO_DISCORD_FORMATTING);

        let username: string = author.displayName;
        if (username.length > 26) username = username.slice(0, 27) + '...';
        if (this.config.preventDiscordWebhookUsernameConflicts) {
            // Prevent collisions with users with the same name by adding a small invisible character to the end
            for (const idNum of String(author.id).split('')) {
                username += USER_ID_INVISIBLE_CHARS[idNum];
            }
            // Discord doesn't allow trailing whitespace, so we have to end with a small character
            username += '\u2B1E';
        }

        if (msg.hasQuotedMsg) {
            const quotedWhatsAppmessage: WhatsAppMessage = await msg.getQuotedMessage();
            const quotedPlatformMessage: PlatformMessage | null = await PlatformMessage.findOne({
                where: {
                    platformMessageId: quotedWhatsAppmessage.id._serialized
                }
            });
            const quotedMessage: Message | null = !quotedPlatformMessage ? null : await Message.findOne({
                where: {
                    id: quotedPlatformMessage.messageId
                }
            });
            const quotedMessageAuthor: Author | null = !quotedMessage ? null : await Author.findOne({
                where: {
                    id: quotedMessage.authorId
                }
            });
            let quotedMessageUrl: string | undefined = undefined;
            if (quotedMessage) {
                const quotedPlatformMessage: PlatformMessage | null = await PlatformMessage.findOne({
                    where: {
                        messageId: quotedMessage.id,
                        platform: MessagePlatform.DISCORD,
                        platformMessageType: PlatformMessageType.MESSAGE
                    }
                });
                if (quotedPlatformMessage !== null) {
                    quotedMessageUrl = `https://discord.com/channels/${discordChannel.guild.id}/${discordChannel.id}/${quotedPlatformMessage.platformMessageId}`;
                }
            }

            // Inserting will become a pain if we don't do it where we do it now, so we'll just update. Not a great solution, but it's w/e
            if (quotedMessage !== null) await Message.update({ replyToId: quotedMessage.id }, { where: { id: message.id } });

            let truncatedQuoteContent: string = DiscordUtil.cleanContent(quotedMessage ? quotedMessage.originalPlatform === MessagePlatform.DISCORD ? quotedMessage.content : format(quotedMessage.content, WHATSAPP_TO_DISCORD_FORMATTING) : quotedWhatsAppmessage.body, discordChannel) || '[no content]';
            if (truncatedQuoteContent.length > 50) {
                truncatedQuoteContent = truncatedQuoteContent.slice(0, 51) + '...';
            }
            const discordMessage = await webhookClient.send({
                embeds: [{
                    description: truncatedQuoteContent,
                    color: quotedMessage && quotedMessage.originalPlatform == MessagePlatform.DISCORD ? 0x5865F2 : 0x1BA691,
                    author: {
                        name: quotedMessageAuthor ? quotedMessageAuthor.displayName : (await quotedWhatsAppmessage.getContact()).pushname,
                        icon_url: quotedMessage && quotedMessageAuthor && quotedMessage.originalPlatform == MessagePlatform.DISCORD && quotedMessageAuthor.discordId ? await (await discordClient.users.fetch(quotedMessageAuthor.discordId)).avatarURL() || undefined : await (await quotedWhatsAppmessage.getContact()).getProfilePicUrl(),
                        url: quotedMessageUrl
                    }
                }],
                username,
                avatarURL: profilePicURL
            });

            await PlatformMessage.create({
                messageId: message.id,
                platform: MessagePlatform.DISCORD,
                platformMessageId: discordMessage.id,
                platformMessageType: PlatformMessageType.REPLY_INDICATOR
            });
        }

        let isFirst: boolean = true;
        while (escapedContent.length !== 0) {
            const discordMessage = await webhookClient.send({
                content: escapedContent.slice(0, 2000),
                username,
                avatarURL: profilePicURL,
                allowedMentions: {
                    roles: [],
                    users: mentionedIds
                }
            });

            await PlatformMessage.create({
                messageId: message.id,
                platform: MessagePlatform.DISCORD,
                platformMessageId: discordMessage.id,
                platformMessageType: isFirst ? PlatformMessageType.MESSAGE : PlatformMessageType.SPLIT_MESSAGE
            });
            escapedContent = escapedContent.slice(2000);
            isFirst = false;
        }

        await chat.sendSeen();

        if (!media) return;
        // We can just try to upload this without any problems!
        if (mediaData!.length <= 8_000_000) {
            const discordMessage = await webhookClient.send({
                username,
                avatarURL: profilePicURL,
                files: [{
                    attachment: mediaData!,
                    name: media!.filename || `file.${extension(media!.mimetype)}`,
                    contentType: media!.mimetype
                }]
            });

            await PlatformMessage.create({
                messageId: message.id,
                platform: MessagePlatform.DISCORD,
                platformMessageId: discordMessage.id,
                platformMessageType: PlatformMessageType.ATTACHMENT
            });

            return;
        }

        // TODO: compress attachments if they are too large

        const discordMessage = await webhookClient.send({
            username,
            avatarURL: profilePicURL,
            content: ':x: Message attachment is too large.'
        });

        await PlatformMessage.create({
            messageId: message.id,
            platform: MessagePlatform.DISCORD,
            platformMessageId: discordMessage.id,
            platformMessageType: PlatformMessageType.ATTACHMENT
        });
    }

};

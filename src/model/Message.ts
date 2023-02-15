import { AllowNull, BelongsTo, Column, DataType, ForeignKey, HasMany, Length, Model, Table } from 'sequelize-typescript';
import { Author, Channel, PlatformMessage } from '.';

export enum MessageAttachmentType {
    DOCUMENT,
    AUDIO,
    IMAGE,
    VIDEO,
    STICKER
};

export enum MessagePlatform {
    DISCORD,
    WHATSAPP
};

@Table
export class Message extends Model {

    @BelongsTo(() => Author)
    public author!: Author;
    @AllowNull(false)
    @ForeignKey(() => Author)
    @Column(DataType.INTEGER)
    public authorId!: number;

    @BelongsTo(() => Channel)
    public channel!: Channel;
    @AllowNull(false)
    @ForeignKey(() => Channel)
    @Column(DataType.INTEGER)
    public channelId!: number;

    @BelongsTo(() => Message)
    public replyTo: Message | null;
    @AllowNull
    @ForeignKey(() => Message)
    @Column(DataType.INTEGER)
    public replyToId!: number;

    @AllowNull(false)
    @Column(DataType.STRING)
    public originalPlatform!: MessagePlatform;

    @AllowNull
    @Column(DataType.STRING)
    public attachmentType: MessageAttachmentType | null;

    @AllowNull
    @Column(DataType.INTEGER)
    public attachmentSize: number | null;

    @AllowNull(false)
    @Column(DataType.TEXT)
    public content!: string;

    @HasMany(() => PlatformMessage)
    public platformMessages!: PlatformMessage[];

    @Column({ type: DataType.BOOLEAN, defaultValue: false })
    public originalPlatformMessageDeleted!: boolean;

};

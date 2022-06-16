import { BelongsTo, Column, DataType, ForeignKey, Length, Model, Table } from 'sequelize-typescript';
import { Message, MessagePlatform } from '.';

export enum PlatformMessageType {
    MESSAGE,
    REPLY_INDICATOR,
    SPLIT_MESSAGE,
    ATTACHMENT,
    SYSTEM
};

@Table
export class PlatformMessage extends Model {

    @BelongsTo(() => Message)
    public message!: Message;
    @ForeignKey(() => Message)
    @Column({ type: DataType.INTEGER })
    public messageId!: number;

    @Column(DataType.STRING)
    public platform!: MessagePlatform;

    @Column(DataType.STRING)
    public platformMessageId!: string;

    @Column(DataType.STRING)
    public platformMessageType!: PlatformMessageType;

};

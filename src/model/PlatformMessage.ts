import { BelongsTo, Column, DataType, ForeignKey, Length, Model, Table } from 'sequelize-typescript';
import { Message, MessagePlatform } from '.';

export enum PlatformMessageType {
    MESSAGE,
    REPLY_INDICATOR,
    SPLIT_MESSAGE,
    ATTACHMENT,
    SYSTEM
};

export function canBeOriginalMessage(messageType: PlatformMessageType): boolean {
    return messageType == PlatformMessageType.MESSAGE || messageType == PlatformMessageType.SYSTEM;
}

@Table
export class PlatformMessage extends Model {

    @BelongsTo(() => Message)
    public message!: Message;
    @ForeignKey(() => Message)
    @Column(DataType.INTEGER)
    public messageId!: number;

    @Column(DataType.STRING)
    public platform!: MessagePlatform;

    @Column(DataType.STRING)
    public platformMessageId!: string;

    @Column(DataType.STRING)
    public platformMessageType!: PlatformMessageType;

    @Column({ type: DataType.BOOLEAN, defaultValue: false })
    public deleted!: boolean;

};

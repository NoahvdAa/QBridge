import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript';

@Table
export class Channel extends Model {

    @AllowNull(false)
    @Column(DataType.STRING)
    public discordId!: string;

    @AllowNull(false)
    @Column(DataType.STRING)
    public whatsAppId!: string;

    @AllowNull(false)
    @Column(DataType.STRING)
    public discordWebhookURL!: string;

};

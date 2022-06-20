import { AllowNull, Column, DataType, Default, Model, Table } from 'sequelize-typescript';

export enum Flags {
    IS_BOT = 1
};

export enum PermissionLevel {
    STANDARD,
    MODERATOR,
    ADMIN
};

@Table
export class Author extends Model {

    @AllowNull
    @Column(DataType.STRING)
    public discordId: string | null;

    @AllowNull
    @Column(DataType.STRING)
    public whatsAppPhoneNumber: string | null;

    @AllowNull(false)
    @Column(DataType.STRING)
    public displayName!: string;

    @AllowNull(false)
    @Default(PermissionLevel.STANDARD)
    @Column(DataType.STRING)
    public permissionLevel!: PermissionLevel;

    @AllowNull(false)
    @Default(0)
    @Column(DataType.INTEGER)
    public flags!: number;

};

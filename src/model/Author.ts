import { AllowNull, Column, DataType, Default, Model, Table } from 'sequelize-typescript';

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

};

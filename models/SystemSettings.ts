import mongoose, { Schema, model, models } from 'mongoose';

export interface ISystemSettings {
    key: string; // usually 'global'
    isAiActive: boolean;
    adminPhoneNumber?: string; // For alerts
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
    {
        key: { type: String, required: true, unique: true, default: 'global' },
        isAiActive: { type: Boolean, default: true },
        adminPhoneNumber: { type: String },
    },
    { timestamps: true }
);

// Prevent overwrite on hot reload
const SystemSettings = models.SystemSettings || model('SystemSettings', SystemSettingsSchema);

export default SystemSettings;

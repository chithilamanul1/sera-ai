import { Schema, model, models } from 'mongoose';

export interface ISystemSettings {
    key: string; // usually 'global'
    isAiActive: boolean;
    adminPhoneNumber?: string; // For alerts
    geminiKeys?: Record<string, string>; // { "index_0": "key", "index_1": "key" }
    backupGeminiKeys?: Record<string, string>; // Store old keys here
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
    {
        key: { type: String, required: true, unique: true, default: 'global' },
        isAiActive: { type: Boolean, default: true },
        adminPhoneNumber: { type: String },
        geminiKeys: { type: Schema.Types.Mixed, default: {} },
        backupGeminiKeys: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Prevent overwrite on hot reload
const SystemSettings = models.SystemSettings || model('SystemSettings', SystemSettingsSchema);

export default SystemSettings;

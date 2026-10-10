import { createHash, randomBytes } from 'node:crypto';

export const newInstallKey = () => 'wai_sk_' + randomBytes(24).toString('hex');
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

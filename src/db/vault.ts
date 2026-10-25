import { teacherOperation } from '../domain/operations';
import { db } from './db';
import { decrypt, deriveKeys, encrypt, ITERATIONS, randomSalt } from './crypto';
import type { VaultKeys, VaultMeta } from '../types';

async function unlockVaultInternal(pin: string): Promise<VaultKeys> {
  const existing = await db.meta.get('vault');
  const salt = existing?.salt ?? randomSalt();
  if (existing && (existing.v !== 1 || existing.iterations !== ITERATIONS))
    throw new Error('Unsupported vault version.');
  const keys = await deriveKeys(pin, salt);
  if (existing) {
    const check = await decrypt<string>(keys.encryption, existing.verifier, 'vault:v1');
    if (check !== 'attendance-desk') throw new Error('Invalid vault.');
  } else {
    const metadata: VaultMeta = {
      id: 'vault',
      v: 1,
      iterations: ITERATIONS,
      salt,
      verifier: await encrypt(keys.encryption, 'attendance-desk', 'vault:v1'),
    };
    // add(), rather than put(), prevents competing first-time tabs from overwriting the vault.
    await db.meta.add(metadata);
  }
  return keys;
}

export const unlockVault = teacherOperation(unlockVaultInternal);

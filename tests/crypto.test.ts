import { describe, expect, it } from 'vitest';
import { decrypt, deriveKeys, encrypt, privateToken, randomSalt } from '../src/db/crypto';

describe('vault encryption', () => {
  it('round-trips Unicode, uses unique nonces and rejects record swapping', async () => {
    const keys = await deriveKeys('104928573612', randomSalt());
    const a = await encrypt(keys.encryption, { name: 'Peña, José Niño' }, 'student:a');
    const b = await encrypt(keys.encryption, { name: 'Peña, José Niño' }, 'student:a');
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toContain('Peña');
    expect(await decrypt(keys.encryption, a, 'student:a')).toEqual({ name: 'Peña, José Niño' });
    await expect(decrypt(keys.encryption, a, 'student:b')).rejects.toThrow('Unable to decrypt');
  });
  it('rejects wrong secrets and tampering', async () => {
    const salt = randomSalt();
    const keys = await deriveKeys('104928573612', salt);
    const wrong = await deriveKeys('104928573613', salt);
    const cipher = await encrypt(keys.encryption, 'secret', 'test');
    await expect(decrypt(wrong.encryption, cipher, 'test')).rejects.toThrow();
    const damaged = {
      ...cipher,
      data: `${cipher.data[0] === 'A' ? 'B' : 'A'}${cipher.data.slice(1)}`,
    };
    await expect(decrypt(keys.encryption, damaged, 'test')).rejects.toThrow();
    expect(keys.encryption.extractable).toBe(false);
  });
  it('uses deterministic keyed indexes without exposing an ID', async () => {
    const a = await deriveKeys('104928573612', randomSalt());
    const b = await deriveKeys('104928573612', randomSalt());
    expect(await privateToken(a, '202410492')).toBe(await privateToken(a, '202410492'));
    expect(await privateToken(a, '202410492')).not.toBe(await privateToken(b, '202410492'));
    await expect(deriveKeys('123', randomSalt())).rejects.toThrow('6–12');
  });
});

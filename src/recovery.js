// Data-only recovery archives. Credentials, source code and arbitrary files are never included.
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { open, mkdir, appendFile, link, unlink, rm, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createPublicKey, createPrivateKey, createHash, randomBytes, randomUUID, publicEncrypt, privateDecrypt, createCipheriv, createDecipheriv, generateKeyPairSync } from 'node:crypto';
import { verifyHistoryEntry, withMonitorLock } from './monitor-store.js';

export const RECOVERY_FILES = Object.freeze({ 'monitor.json': 8 * 1024 * 1024, 'pilot-leads.jsonl': 20 * 1024 * 1024, 'pilot-leads.jsonl.notifications.json': 8 * 1024 * 1024 });
const MAX_ARCHIVE = 55 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fingerprint = key => createHash('sha256').update((key.type === 'public' ? key : createPublicKey(key)).export({ type: 'spki', format: 'der' })).digest('hex');
function validateFile(name, bytes) {
  if (!Object.hasOwn(RECOVERY_FILES, name) || bytes.length > RECOVERY_FILES[name]) throw new Error('Unsupported recovery file or size.');
  try {
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes)) throw new Error();
    if (name === 'pilot-leads.jsonl') {
      if (text && !text.endsWith('\n')) throw new Error();
      for (const line of text.split('\n').filter(Boolean)) {
        const record = JSON.parse(line);
        if (!object(record) || !Number.isFinite(Date.parse(record.receivedAt))) throw new Error();
      }
    } else {
      const value = JSON.parse(text);
      if (!object(value) || value.version !== 1 || !Array.isArray(value.outbox ?? []) || (value.outbox ?? []).some(job => !object(job) || !['pending', 'sending', 'delivered', 'failed', 'cancelled'].includes(job.status))) throw new Error();
      if (name === 'monitor.json' && (!Array.isArray(value.targets) || !object(value.state) || !Array.isArray(value.history) || !value.history.every(verifyHistoryEntry) || (value.references !== undefined && !object(value.references)) || ['incidents', 'audit'].some(field => value[field] !== undefined && !Array.isArray(value[field])))) throw new Error();
      if (name.endsWith('notifications.json') && !Array.isArray(value.outbox)) throw new Error();
    }
  } catch { throw new Error('Recovery data is invalid; no archive or restored baseline was accepted.'); }
}
async function safeRead(path, maximum) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maximum) throw new Error('Recovery input is not a bounded regular file.');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) throw new Error('Recovery input changed during capture; retry later.');
      offset += result.bytesRead;
    }
    const after = await handle.stat();
    if (bytes.length > maximum || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Recovery input changed during capture; retry later.');
    return bytes;
  } finally { await handle.close(); }
}
async function exclusiveWrite(path, content, mode = 0o600) {
  const handle = await open(path, 'wx', mode);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
}
export async function generateRecoveryKeys(privatePath, publicPath) {
  if (resolve(privatePath) === resolve(publicPath)) throw new Error('Use separate recovery key files.');
  // Refuse existing keys before doing expensive key generation; exclusive writes also protect races.
  for (const path of [privatePath, publicPath]) {
    try { await stat(path); throw new Error('Recovery key destination already exists.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const keys = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  await exclusiveWrite(privatePath, keys.privateKey);
  try { await exclusiveWrite(publicPath, keys.publicKey, 0o644); }
  catch (error) { await unlink(privatePath); throw error; }
  return { fingerprint: fingerprint(keys.publicKey) };
}
function rsaKey(key, privateKey = false) {
  const parsed = privateKey ? createPrivateKey(key) : createPublicKey(key);
  if (parsed.asymmetricKeyType !== 'rsa' || parsed.asymmetricKeyDetails.modulusLength < 2048) throw new Error('Recovery requires an RSA key of at least 2048 bits.');
  return parsed;
}
export async function createRecoveryArchive({ dataDir, publicKey, output, now = Date.now() }) {
  const key = rsaKey(publicKey), secret = randomBytes(32), iv = randomBytes(12);
  const header = Buffer.from(`${JSON.stringify({ format: 'settlens-recovery-v1', createdAt: new Date(now).toISOString(), keyId: fingerprint(publicKey), wrappedKey: publicEncrypt({ key, oaepHash: 'sha256' }, secret).toString('base64'), iv: iv.toString('base64') })}\n`);
  const cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(header);
  const temporary = `${output}.${randomUUID()}.tmp`;
  const files = [];
  async function* records() {
    yield `${JSON.stringify({ format: 'settlens-data-v1', createdAt: new Date(now).toISOString() })}\n`;
    for (const [name, limit] of Object.entries(RECOVERY_FILES)) {
      const path = join(dataDir, name);
      let bytes;
      const capture = () => safeRead(path, limit);
      try { bytes = name === 'pilot-leads.jsonl' ? await capture() : await withMonitorLock(path, capture); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      validateFile(name, bytes); files.push(name);
      yield `${JSON.stringify({ name, data: bytes.toString('base64') })}\n`;
    }
    if (!files.length) throw new Error('No Settlens data files to back up.');
  }
  try {
    await exclusiveWrite(temporary, header);
    await pipeline(Readable.from(records()), createGzip(), cipher, createWriteStream(temporary, { flags: 'a', mode: 0o600 }));
    await appendFile(temporary, cipher.getAuthTag());
    const handle = await open(temporary, 'r'); try { await handle.sync(); } finally { await handle.close(); }
    await link(temporary, output); // Never replace an existing backup.
    const directory = await open(dirname(output), 'r'); try { await directory.sync(); } finally { await directory.close(); }
    return { files, createdAt: new Date(now).toISOString(), keyId: fingerprint(publicKey) };
  } finally { secret.fill(0); await rm(temporary, { force: true }); }
}
export async function restoreRecoveryArchive({ archive, privateKey, destination }) {
  const input = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
  const temporary = `${resolve(destination)}.${randomUUID()}.restore`;
  let stagingCreated = false;
  try {
    const details = await input.stat();
    if (!details.isFile() || details.size > MAX_ARCHIVE || details.size < 32) throw new Error('Recovery archive is not a bounded regular file.');
    const prefix = Buffer.alloc(4096); const { bytesRead } = await input.read(prefix, 0, prefix.length, 0);
    const end = prefix.subarray(0, bytesRead).indexOf(10);
    if (end < 0 || end + 17 >= details.size) throw new Error('Invalid recovery header.');
    const header = prefix.subarray(0, end + 1); const value = JSON.parse(header.toString('utf8'));
    if (value.format !== 'settlens-recovery-v1' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Unsupported recovery archive.');
    const key = rsaKey(privateKey, true);
    if (value.keyId !== fingerprint(key)) throw new Error('Recovery key does not match this archive.');
    const secret = privateDecrypt({ key, oaepHash: 'sha256' }, Buffer.from(value.wrappedKey, 'base64'));
    const iv = Buffer.from(value.iv, 'base64'); if (secret.length !== 32 || iv.length !== 12) throw new Error('Invalid recovery encryption metadata.');
    const tag = Buffer.alloc(16); await input.read(tag, 0, 16, details.size - 16);
    const decipher = createDecipheriv('aes-256-gcm', secret, iv); decipher.setAAD(header); decipher.setAuthTag(tag);
    await mkdir(temporary, { mode: 0o700 }); stagingCreated = true;
    const payload = join(temporary, 'authenticated-data.gz');
    try { await pipeline(input.createReadStream({ start: end + 1, end: details.size - 17, autoClose: false }), decipher, createWriteStream(payload, { flags: 'wx', mode: 0o600 })); }
    finally { secret.fill(0); }
    let total = 0;
    const bound = new Transform({ transform(chunk, _encoding, callback) { total += chunk.length; callback(total > MAX_ARCHIVE ? new Error('Recovery payload exceeds its size bound.') : null, chunk); } });
    const processing = pipeline(createReadStream(payload), createGunzip(), bound);
    processing.catch(() => {}); // The rejection is awaited below after consuming the bounded stream.
    const lines = createInterface({ input: bound, crlfDelay: Infinity });
    const files = []; let manifest;
    try {
      for await (const line of lines) {
        const record = JSON.parse(line);
        if (!manifest) { if (record.format !== 'settlens-data-v1' || record.createdAt !== value.createdAt) throw new Error('Invalid recovery manifest.'); manifest = record; continue; }
        if (!object(record) || !Object.hasOwn(RECOVERY_FILES, record.name) || files.includes(record.name) || typeof record.data !== 'string' || record.data.length > Math.ceil(RECOVERY_FILES[record.name] / 3) * 4) throw new Error('Invalid recovery file entry.');
        const bytes = Buffer.from(record.data, 'base64'); if (bytes.toString('base64') !== record.data) throw new Error('Invalid recovery encoding.');
        validateFile(record.name, bytes);
        await exclusiveWrite(join(temporary, record.name), bytes); files.push(record.name);
      }
      await processing;
      if (!manifest || !files.length) throw new Error('Empty recovery archive.');
    } finally { lines.close(); bound.destroy(); await processing.catch(() => {}); }
    await unlink(payload);
    // Destination must be new: restoration never overwrites live data or an existing directory.
    await mkdir(destination, { mode: 0o700 });
    try {
      for (const name of files) await link(join(temporary, name), join(destination, name));
      for (const path of [destination, dirname(resolve(destination))]) {
        const directory = await open(path, 'r'); try { await directory.sync(); } finally { await directory.close(); }
      }
    }
    catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
    return { files, createdAt: value.createdAt, keyId: value.keyId };
  } catch { throw new Error('Recovery failed; existing data was not changed. Check the archive, key and destination.'); }
  finally { await input.close(); if (stagingCreated) await rm(temporary, { recursive: true, force: true }); }
}

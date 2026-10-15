import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync, createPublicKey, createHash, publicEncrypt, randomBytes, createCipheriv } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRecoveryArchive, restoreRecoveryArchive, generateRecoveryKeys } from '../src/recovery.js';
import { MonitorStore, withMonitorLock } from '../src/monitor-store.js';
import { enqueueNotification, NotificationStore } from '../src/notification-queue.js';
import { approveReference } from '../src/monitor-lifecycle.js';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'settlens-recovery-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const dataDir = join(dir, 'data'); await mkdir(dataDir);
  const store = new MonitorStore(join(dataDir, 'monitor.json'));
  await store.update(journal => { journal.targets.push({ id: 'fixture', name: 'Illustrative endpoint', url: 'https://merchant.example/paid' }); enqueueNotification(journal, { key: 'fixture', kind: 'monitor.email', payload: { synthetic: 'fixture-private-payload' } }); });
  const required = amount => ({ x402Version: 2, resource: { url: 'https://merchant.example/paid' }, accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x1111111111111111111111111111111111111111', amount, maxTimeoutSeconds: 60 }] });
  const fetchImpl = amount => async () => new Response('', { status: 402, headers: { 'payment-required': Buffer.from(JSON.stringify(required(amount))).toString('base64') } });
  await store.run(undefined, { fetchImpl: fetchImpl('10000') });
  await store.update(journal => approveReference(journal, journal.targets[0], journal.state['GET https://merchant.example/paid'].terms.digest));
  await store.run(undefined, { fetchImpl: fetchImpl('20000') });
  await writeFile(join(dataDir, 'pilot-leads.jsonl'), `${JSON.stringify({ receivedAt: new Date().toISOString(), email: 'fixture@example.test', message: 'fixture-private-payload' })}\n`);
  await new NotificationStore(join(dataDir, 'pilot-leads.jsonl.notifications.json')).enqueue({ key: 'fixture', kind: 'pilot.email', payload: { synthetic: true } });
  await writeFile(join(dataDir, '.env'), 'fixture-secret-that-must-never-be-backed-up');
  return { dir, dataDir, store, output: join(dir, 'backup.settlens') };
}
test('encrypted data recovery preserves journals and pending deliveries without archiving credentials', async t => {
  const f = await fixture(t); const saved = await createRecoveryArchive({ ...f, publicKey: keys.publicKey });
  const encrypted = await readFile(f.output);
  assert.equal(encrypted.includes(Buffer.from('fixture-private-payload')), false);
  assert.equal(encrypted.includes(Buffer.from('fixture-secret-that-must-never-be-backed-up')), false);
  assert.equal((await stat(f.output)).mode & 0o777, 0o600);
  const destination = join(f.dir, 'restore'); const restored = await restoreRecoveryArchive({ archive: f.output, privateKey: keys.privateKey, destination });
  assert.deepEqual(restored.files, saved.files); assert.equal((await stat(destination)).mode & 0o777, 0o700);
  for (const name of restored.files) { assert.deepEqual(await readFile(join(destination, name)), await readFile(join(f.dataDir, name))); assert.equal((await stat(join(destination, name))).mode & 0o777, 0o600); }
  assert.deepEqual((await new MonitorStore(join(destination, 'monitor.json')).read()).outbox, (await f.store.read()).outbox);
  const recovered = await new MonitorStore(join(destination, 'monitor.json')).read();
  assert.equal(recovered.history.length, 2); assert.ok(recovered.references['GET https://merchant.example/paid']);
  assert.ok(recovered.incidents.some(incident => incident.checkId === 'terms.amount' && incident.status === 'open'));
  await assert.rejects(readFile(join(destination, '.env')), { code: 'ENOENT' });
  assert.equal((await readdir(f.dir)).some(name => name.endsWith('.restore') || name.endsWith('.tmp')), false);
});
test('tampered ciphertext, authenticated headers and wrong keys fail without replacing existing data', async t => {
  const f = await fixture(t); await createRecoveryArchive({ ...f, publicKey: keys.publicKey });
  const bytes = await readFile(f.output); const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  for (const mutate of [copy => { copy[copy.length - 20] ^= 1; }, copy => { const index = copy.indexOf(Buffer.from('createdAt')); copy[index + 20] ^= 1; }]) {
    const altered = Buffer.from(bytes); mutate(altered); const path = join(f.dir, 'altered'); await writeFile(path, altered);
    await assert.rejects(restoreRecoveryArchive({ archive: path, privateKey: keys.privateKey, destination: join(f.dir, 'rejected') }), /Recovery failed/);
    await assert.rejects(stat(join(f.dir, 'rejected')), { code: 'ENOENT' });
  }
  await assert.rejects(restoreRecoveryArchive({ archive: f.output, privateKey: other, destination: join(f.dir, 'wrong-key') }), /Recovery failed/);
  await assert.rejects(restoreRecoveryArchive({ archive: f.output, privateKey: keys.privateKey, destination: f.dataDir }), /Recovery failed/);
  assert.equal((await f.store.read()).targets[0].name, 'Illustrative endpoint');
});
test('backups refuse invalid history, partial lead records, symlinks, locks and existing archives', async t => {
  const f = await fixture(t); const file = join(f.dataDir, 'pilot-leads.jsonl'); const valid = await readFile(file);
  await writeFile(file, '{"receivedAt":');
  await assert.rejects(createRecoveryArchive({ ...f, publicKey: keys.publicKey }), /invalid/);
  await writeFile(file, valid);
  await withMonitorLock(f.store.path, () => assert.rejects(createRecoveryArchive({ ...f, publicKey: keys.publicKey }), /writer/));
  await rm(file); await symlink(join(f.dataDir, '.env'), file);
  await assert.rejects(createRecoveryArchive({ ...f, publicKey: keys.publicKey })); await rm(file); await writeFile(file, valid);
  await f.store.update(journal => { journal.history.push({ digest: 'invalid', observedAt: new Date().toISOString(), runs: [] }); });
  await assert.rejects(createRecoveryArchive({ ...f, publicKey: keys.publicKey }), /invalid/);
  await writeFile(f.store.path, JSON.stringify({ version: 1, targets: [], state: {}, history: [], outbox: [] }));
  await createRecoveryArchive({ ...f, publicKey: keys.publicKey }); const before = await readFile(f.output);
  await assert.rejects(createRecoveryArchive({ ...f, publicKey: keys.publicKey })); assert.deepEqual(await readFile(f.output), before);
});
test('key generation protects existing keys and writes a private owner-only file', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'settlens-recovery-keys-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const privatePath = join(dir, 'private.pem'), publicPath = join(dir, 'public.pem');
  await generateRecoveryKeys(privatePath, publicPath); assert.equal((await stat(privatePath)).mode & 0o777, 0o600);
  const before = await readFile(privatePath); await assert.rejects(generateRecoveryKeys(privatePath, publicPath)); assert.deepEqual(await readFile(privatePath), before);
  await assert.rejects(generateRecoveryKeys(privatePath, privatePath), /separate/);
});
test('authenticated malformed entries and decompression bombs cannot escape the new recovery directory', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'settlens-recovery-malformed-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const createdAt = new Date().toISOString();
  const envelope = payload => {
    const secret = randomBytes(32), iv = randomBytes(12);
    const keyId = createHash('sha256').update(createPublicKey(keys.publicKey).export({ type: 'spki', format: 'der' })).digest('hex');
    const header = Buffer.from(JSON.stringify({ format: 'settlens-recovery-v1', createdAt, keyId, iv: iv.toString('base64'), wrappedKey: publicEncrypt({ key: keys.publicKey, oaepHash: 'sha256' }, secret).toString('base64') }) + '\n');
    const cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(header);
    return Buffer.concat([header, cipher.update(gzipSync(payload)), cipher.final(), cipher.getAuthTag()]);
  };
  const manifest = JSON.stringify({ format: 'settlens-data-v1', createdAt }) + '\n';
  const entry = name => JSON.stringify({ name, data: Buffer.from('{}').toString('base64') }) + '\n';
  const payloads = [Buffer.from(manifest + entry('../escaped')), Buffer.from(manifest + entry('.env')), Buffer.from(manifest + entry('monitor.json')), Buffer.alloc(56 * 1024 * 1024, 'x')];
  for (const [index, payload] of payloads.entries()) {
    const path = join(dir, `archive-${index}`); await writeFile(path, envelope(payload));
    await assert.rejects(restoreRecoveryArchive({ archive: path, privateKey: keys.privateKey, destination: join(dir, `rejected-${index}`) }), /Recovery failed/);
    await assert.rejects(stat(join(dir, `rejected-${index}`)), { code: 'ENOENT' });
  }
  assert.equal((await readdir(dir)).some(name => name.endsWith('.restore')), false);
  await assert.rejects(stat(join(dir, 'escaped')), { code: 'ENOENT' });
});

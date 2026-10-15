#!/usr/bin/env node
// Copy only encrypted archives off-host and verify restoration in a disposable owner-only directory.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, stat, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { restoreRecoveryArchive } from '../src/recovery.js';
import { writeJsonAtomic } from '../src/monitor-store.js';
const execute = promisify(execFile);
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const directory = option('directory');
const privatePath = option('private');
const validName = /^data-(\d{8})T(\d{6})Z\.settlens$/;
process.umask(0o077);
try {
  if (!directory || !privatePath) throw new Error();
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  if ((await stat(privatePath)).mode & 0o077) throw new Error();
  const { stdout } = await execute('ssh', ['-oBatchMode=yes', '-oConnectTimeout=8', 'settlens-host', 'find /opt/settlens-site/backups -maxdepth 1 -type f -name "data-*.settlens" -printf "%f\\n"'], { timeout: 15000, maxBuffer: 65536 });
  const name = stdout.split('\n').filter(value => validName.test(value)).sort().at(-1); if (!name) throw new Error();
  const file = join(directory, name);
  await execute('rsync', ['-rt', '-e', 'ssh -oBatchMode=yes -oConnectTimeout=8', `settlens-host:/opt/settlens-site/backups/${name}`, `${directory}/`], { timeout: 60000, maxBuffer: 65536 });
  await chmod(file, 0o600);
  const encrypted = await readFile(file); const digest = createHash('sha256').update(encrypted).digest('hex');
  const receiptPath = join(directory, 'last-verified-backup.json');
  const previous = await readFile(receiptPath, 'utf8').then(JSON.parse).catch(() => ({}));
  let verified = previous.name === name && previous.digest === digest;
  let recoveredFiles = previous.recoveredFiles;
  if (!verified) {
    const temporary = await mkdtemp(join(directory, '.restore-drill-')); await chmod(temporary, 0o700);
    try {
      const result = await restoreRecoveryArchive({ archive: file, privateKey: await readFile(privatePath, 'utf8'), destination: join(temporary, 'restored') });
      recoveredFiles = result.files.length; verified = true;
      await writeJsonAtomic(receiptPath, { version: 1, name, digest, verifiedAt: new Date().toISOString(), recoveredFiles });
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  let bytes = 0, retained = 0;
  for (const entry of (await readdir(directory)).filter(value => validName.test(value)).sort().reverse()) {
    const path = join(directory, entry), size = (await stat(path)).size;
    const match = validName.exec(entry), date = `${match[1].slice(0,4)}-${match[1].slice(4,6)}-${match[1].slice(6,8)}T${match[2].slice(0,2)}:${match[2].slice(2,4)}:${match[2].slice(4,6)}Z`;
    if (entry !== name && (Date.now() - Date.parse(date) > 30 * 86400000 || retained >= 7 || bytes + size > 200 * 1024 * 1024)) await rm(path);
    else { bytes += size; retained++; }
  }
  console.log(JSON.stringify({ ok: true, archive: name, restorationVerified: verified, recoveredFiles, encryptedCopies: retained }));
} catch {
  console.error('Settlens encrypted off-host copy or restoration check failed; no key or plaintext was printed.'); process.exitCode = 1;
}

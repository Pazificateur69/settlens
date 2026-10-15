#!/usr/bin/env node
// Operator-only data recovery. Never print plaintext data or key material.
import { readFile, stat } from 'node:fs/promises';
import { createRecoveryArchive, restoreRecoveryArchive, generateRecoveryKeys } from '../src/recovery.js';
const [command, ...args] = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const required = name => { const value = option(name); if (!value) throw new Error(`Missing --${name}.`); return value; };
try {
  let result;
  if (command === 'keygen') result = await generateRecoveryKeys(required('private'), required('public'));
  else if (command === 'backup') result = await createRecoveryArchive({ dataDir: required('data-dir'), publicKey: await readFile(required('public'), 'utf8'), output: required('out') });
  else if (command === 'restore') {
    const keyPath = required('private');
    if ((await stat(keyPath)).mode & 0o077) throw new Error('Recovery private key must be accessible only to its owner (mode 600).');
    result = await restoreRecoveryArchive({ archive: required('archive'), privateKey: await readFile(keyPath, 'utf8'), destination: required('destination') });
  } else throw new Error('Use keygen --private=FILE --public=FILE; backup --data-dir=DIR --public=FILE --out=FILE; or restore --archive=FILE --private=FILE --destination=NEW_DIR.');
  console.log(JSON.stringify({ ok: true, ...result }));
} catch {
  console.error('Settlens recovery operation failed. Check the command, file permissions, archive integrity and destination; live data was not replaced.');
  process.exitCode = 1;
}

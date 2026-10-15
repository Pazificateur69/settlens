import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('private operator health probe returns bounded codes without endpoint data or credentials', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'settlens-ops-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const monitor = join(dir, 'monitor.json');
  const probe = () => spawnSync(process.execPath, ['scripts/ops-health.mjs', '--startup-at=' + new Date().toISOString()], { encoding: 'utf8', env: { ...process.env, MONITOR_STORE: monitor, MONITOR_INTERVAL_MS: '60000', PILOT_STORE: join(dir, 'pilot.jsonl') } });
  let result = probe(); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).state, 'idle');
  await writeFile(monitor, JSON.stringify({ version: 1, targets: [{ name: 'fixture-sensitive-name', url: 'https://fixture.example' }], state: {}, history: [], outbox: [], heartbeat: { status: 'failed', error: 'fixture-sensitive-diagnostic' } }));
  result = probe(); assert.equal(result.status, 0); const report = JSON.parse(result.stdout);
  assert.equal(report.healthy, false); assert.ok(report.issues.includes('monitor.run_failed')); assert.doesNotMatch(result.stdout, /fixture-sensitive|fixture\.example/);
  await writeFile(monitor, 'invalid'); result = probe(); assert.equal(result.status, 1); assert.deepEqual(JSON.parse(result.stdout).issues, ['operations.journal_unreadable']);
});
test('host watchdog deduplicates alerts and SMTP remains restricted to the owner', () => {
  const source = `
import importlib.util, tempfile, pathlib
spec=importlib.util.spec_from_file_location('ops','scripts/ops-watchdog.py'); ops=importlib.util.module_from_spec(spec); spec.loader.exec_module(ops)
assert not ops.delivery_due({}, [], 100)
assert ops.delivery_due({}, ['monitor.schedule_stale'], 100)
assert not ops.delivery_due({'issues':['x'],'mailAccepted':True,'lastNotificationAttempt':100}, ['x'], 200)
assert ops.delivery_due({'issues':['x'],'mailAccepted':True,'lastNotificationAttempt':100}, ['x'], 86501)
assert ops.delivery_due({'issues':['x'],'mailAccepted':False,'lastNotificationAttempt':100}, ['x'], 1001)
assert ops.delivery_due({'issues':['x'],'mailAccepted':True,'lastNotificationAttempt':100}, ['y'], 101)
captured=[]
class FakeSMTP:
 def __init__(self,*args,**kwargs): pass
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def login(self,user,password): assert user=='contact@settlens.com' and password=='fixture-password'
 def send_message(self,message,**kwargs): captured.append((message,kwargs)); return {}
ops.smtplib.SMTP_SSL=FakeSMTP
with tempfile.TemporaryDirectory() as directory:
 config=pathlib.Path(directory)/'fixture.env'; config.write_text('SETTLENS_EMAIL_ENABLED=1\\nSMTP_HOST=smtp.fixture.example\\nSMTP_USER=contact@settlens.com\\nSMTP_PASSWORD_B64=Zml4dHVyZS1wYXNzd29yZA==\\nSETTLENS_API_TOKEN=fixture-ignore-this-value\\n')
 assert ops.send_owner_mail(config, ['operations.http_unavailable'])
 message,options=captured[0]; assert message['To']=='contact@settlens.com' and options['to_addrs']==['contact@settlens.com']
 assert message['Subject'].startswith('[Settlens][OPS]') and 'fixture-ignore' not in str(message)
 config.write_text('SETTLENS_EMAIL_ENABLED=1\\nSMTP_PASSWORD_B64=invalid@@@\\n'); assert not ops.send_owner_mail(config,['x'])
print('Owner-only SMTP and deduplication verified.')
`;
  const result = spawnSync('python3', ['-B', '-c', source], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /verified/);
  const shell = spawnSync('sh', ['-n', 'scripts/ops-backup.sh'], { encoding: 'utf8' }); assert.equal(shell.status, 0, shell.stderr);
});
test('root backup capture refuses symlinks, plaintext and existing output files', () => {
  const source = `
import importlib.util, tempfile, pathlib, os, json
spec=importlib.util.spec_from_file_location('copy','scripts/ops-store-backup.py'); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory); capture=root/'capture'; output=root/'backup'; secret=root/'fixture-secret'; secret.write_text('fixture-private-value')
 capture.symlink_to(secret)
 try: module.copy_encrypted(capture,output,os.getuid()); raise AssertionError('symlink accepted')
 except OSError: pass
 capture.unlink(); capture.write_bytes(b'fixture-plaintext-that-is-not-an-encrypted-archive')
 try: module.copy_encrypted(capture,output,os.getuid()); raise AssertionError('plaintext accepted')
 except (ValueError,json.JSONDecodeError): pass
 encrypted=json.dumps({'format':'settlens-recovery-v1','keyId':'a'*64}).encode()+b'\\n'+os.urandom(64); capture.write_bytes(encrypted)
 module.copy_encrypted(capture,output,os.getuid()); assert output.read_bytes()==encrypted and output.stat().st_mode&0o777==0o600
 try: module.copy_encrypted(capture,output,os.getuid()); raise AssertionError('existing output replaced')
 except FileExistsError: pass
 assert output.read_bytes()==encrypted and secret.read_text()=='fixture-private-value'
 assert not list(root.glob('*.tmp'))
print('Capture boundary verified.')
`;
  const result = spawnSync('python3', ['-B', '-c', source], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /verified/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';
import { base58Encode, verifySolanaTransaction } from '../src/signature.js';
import { decodeSolanaAddress, deriveAssociatedTokenAddress, SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, COMPUTE_PROGRAM, MEMO_PROGRAM } from '../src/solana-payment.js';
import { createMcpServer } from '../src/mcp.js';

const OWNER = '11111111111111111111111111111111';
const MINT = 'So11111111111111111111111111111111111111112';
// Independently computed from SHA-256 seeds and Edwards quadratic-residue arithmetic.
const DESTINATION = 'aqxoAhCwpy3oB1BpNw9hL1HdLYLgPpbPjzxDrrQj3Fs';
function key() { const k = generateKeyPairSync('ed25519'); return { privateKey: k.privateKey, raw: k.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32) }; }
const sponsor = key(), client = key();
const requirement = { scheme: 'exact', network: 'solana:test', amount: '1000', asset: MINT, payTo: OWNER, extra: { feePayer: base58Encode(sponsor.raw), decimals: 9, memo: 'invoice-123' } };
function tx(options = {}) {
  const transfer = Buffer.alloc(10); transfer[0] = options.discriminator ?? 12; transfer.writeBigUInt64LE(BigInt(options.amount ?? '1000'), 1); transfer[9] = options.decimals ?? 9;
  const units = Buffer.alloc(5); units[0] = 2; units.writeUInt32LE(options.units ?? 400000, 1);
  const price = Buffer.alloc(9); price[0] = 3; price.writeBigUInt64LE(BigInt(options.price ?? '50000'), 1);
  const keys = [sponsor.raw, client.raw, Buffer.alloc(32, 9), decodeSolanaAddress(options.destination ?? DESTINATION), decodeSolanaAddress(options.mint ?? MINT), decodeSolanaAddress(options.program ?? SPL_TOKEN_PROGRAM), decodeSolanaAddress(COMPUTE_PROGRAM), decodeSolanaAddress(MEMO_PROGRAM)];
  const instructions = [ { program: 6, accounts: [], data: units }, { program: 6, accounts: [], data: price }, { program: 5, accounts: options.accounts ?? [2, 4, 3, 1], data: transfer }, { program: 7, accounts: [], data: Buffer.from(options.memo ?? 'invoice-123') } ];
  if (options.duplicateTransfer) instructions.push(instructions[2]);
  if (options.duplicateMemo) instructions.push(instructions[3]);
  if (options.unknownProgram) instructions.push({ program: 4, accounts: [2], data: Buffer.from([1]) });
  if (options.invalidCompute) instructions[0].data = Buffer.from([1]);
  if (options.extraSigner) keys.splice(2, 0, key().raw); // intentionally invalidates indices and required client-only profile
  if (options.changeOrder) [instructions[0], instructions[2]] = [instructions[2], instructions[0]];
  const message = Buffer.concat([
    options.legacy ? Buffer.alloc(0) : Buffer.from([0x80 | (options.version ?? 0)]),
    Buffer.from([options.extraSigner ? 3 : 2, 0, 4]), Buffer.from([keys.length]), ...keys,
    Buffer.alloc(32, 7), Buffer.from([instructions.length]),
    ...instructions.map((ix) => Buffer.concat([Buffer.from([ix.program, ix.accounts.length, ...ix.accounts, ix.data.length]), ix.data])),
    options.legacy ? Buffer.alloc(0) : options.lookup ? Buffer.concat([Buffer.from([1]), Buffer.alloc(32, 8), Buffer.from([1, 0, 0])]) : Buffer.from([0]),
    options.trailing ? Buffer.from([1]) : Buffer.alloc(0),
  ]);
  const signatures = [options.sponsorSigned ? sign(null, message, sponsor.privateKey) : Buffer.alloc(64), options.clientPending ? Buffer.alloc(64) : sign(null, message, client.privateKey)];
  if (options.extraSigner) signatures.push(Buffer.alloc(64));
  return Buffer.concat([Buffer.from([signatures.length]), ...signatures, message]).toString('base64');
}
const check = (options, req = requirement, policy) => verifySolanaTransaction(tx(options), req, policy);

test('independent merchant ATA vector and base58 address validation', () => {
  assert.equal(base58Encode(deriveAssociatedTokenAddress(OWNER, MINT)), DESTINATION);
  assert.equal(base58Encode(decodeSolanaAddress(OWNER)), OWNER);
  assert.throws(() => decodeSolanaAddress('O'.repeat(32)), /base58/);
  assert.throws(() => decodeSolanaAddress('1'.repeat(33)), /32-byte/);
  assert.throws(() => decodeSolanaAddress(null), /32-byte/);
});

test('signed v0 and legacy standard-wallet payment instructions bind reviewed terms offline', () => {
  for (const options of [{}, { legacy: true }, { sponsorSigned: true }]) {
    const result = check(options);
    assert.equal(result.verified, true);
    assert.equal(result.payment.verified, true);
    assert.equal(result.payment.status, 'verified');
    assert.equal(result.payment.transfers[0].amount, '1000');
    assert.equal(result.payment.transfers[0].expectedDestination, DESTINATION);
    assert.match(result.payment.limitations.join(' '), /settlement/);
  }
  assert.equal(verifySolanaTransaction(tx()).payment, undefined);
});

test('valid signatures cannot disguise wrong mint, recipient, amount, authority or fee exposure', () => {
  for (const [options, id] of [
    [{ amount: '999' }, 'amount'], [{ amount: '1001' }, 'amount'],
    [{ mint: OWNER }, 'mint'], [{ destination: OWNER }, 'recipient'],
    [{ accounts: [2, 4, 3, 0] }, 'fee_payer_isolation'],
    [{ accounts: [2, 4, 3, 2] }, 'authority'],
    [{ accounts: [4, 4, 3, 1] }, 'authority'],
    [{ units: 400001 }, 'compute_limit'], [{ price: '50001' }, 'compute_price'],
    [{ changeOrder: true }, 'compute_limit'], [{ invalidCompute: true }, 'compute_instruction'],
    [{ memo: 'wrong' }, 'memo'], [{ decimals: 6 }, 'decimals'],
    [{ duplicateTransfer: true }, 'transfer_count'], [{ duplicateMemo: true }, 'memo_count'],
    [{ discriminator: 3 }, 'transfer'], [{ accounts: [2, 4, 255, 1] }, 'message'],
  ]) {
    const result = check(options);
    assert.equal(result.verified, true, JSON.stringify(options));
    assert.equal(result.payment.verified, false, JSON.stringify(options));
    assert.ok(result.payment.checks.some((c) => c.id.startsWith(id) && c.status === 'fail'), JSON.stringify(options));
  }
});

test('lookup tables, unknown execution programs and Token-2022 effects fail closed', () => {
  const lookup = check({ lookup: true });
  assert.equal(lookup.payment.status, 'unverified');
  assert.equal(lookup.payment.verified, false);
  assert.ok(lookup.payment.checks.some((c) => c.id === 'lookup_tables'));
  const unknown = check({ unknownProgram: true });
  assert.equal(unknown.payment.status, 'unverified');
  const token2022 = check({ program: TOKEN_2022_PROGRAM, destination: base58Encode(deriveAssociatedTokenAddress(OWNER, MINT, TOKEN_2022_PROGRAM)) });
  assert.equal(token2022.payment.status, 'unverified');
  assert.match(token2022.payment.checks.find((c) => c.id.startsWith('token_extensions')).detail, /net payment/);
});

test('unsupported versions, malformed messages and missing client signatures never verify payment', () => {
  for (const options of [{ version: 1 }, { trailing: true }, { clientPending: true }, { extraSigner: true }]) assert.equal(check(options).payment.verified, false);
  const bytes = Buffer.from(tx(), 'base64'); bytes[70] ^= 1;
  assert.equal(verifySolanaTransaction(bytes.toString('base64'), requirement).payment.verified, false);
  const changedSponsor = { ...requirement, extra: { ...requirement.extra, feePayer: OWNER } };
  assert.ok(check({}, changedSponsor).payment.checks.some((c) => c.id === 'fee_payer' && c.status === 'fail'));
});

test('explicit memo nonce and configurable compute caps remain bounded', () => {
  const withoutMemo = { ...requirement, extra: { feePayer: requirement.extra.feePayer } };
  assert.equal(check({ memo: 'a'.repeat(32) }, withoutMemo).payment.verified, true);
  assert.equal(check({ memo: 'short' }, withoutMemo).payment.verified, false);
  assert.equal(check({ units: 500000, price: '60000' }, requirement, { maxComputeUnits: 500000, maxPriorityFeeMicroLamports: '60000' }).payment.verified, true);
  for (const bad of ['0', '-1', '01', '18446744073709551616']) assert.throws(() => check({}, { ...requirement, amount: bad }), /amount/);
  assert.throws(() => check({}, requirement, { maxComputeUnits: 1400001 }), /maxComputeUnits/);
  assert.throws(() => check({}, requirement, { maxPriorityFeeMicroLamports: '-1' }), /maxPriority/);
  assert.throws(() => check({}, { ...requirement, scheme: 'upto' }), /exact/);
  assert.throws(() => check({}, { ...requirement, network: 'eip155:1' }), /network/);
  assert.throws(() => check({}, { ...requirement, extra: { ...requirement.extra, memo: 'ü'.repeat(129) } }), /memo/);
  assert.throws(() => check({}, { ...requirement, extra: { ...requirement.extra, decimals: 256 } }), /decimals/);
});

test('MCP exposes separate signature and instruction results with valid output schemas', async () => {
  const server = createMcpServer({ mode: 'local' });
  const listed = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const tool = listed.result.tools.find((t) => t.name === 'verify_solana_transaction');
  const ajv = new Ajv2020({ strict: true, strictTypes: false });
  const args = { transaction: tx(), requirement };
  assert.equal(ajv.compile(tool.inputSchema)(args), true);
  const called = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool.name, arguments: args } });
  assert.equal(called.result.isError, false);
  assert.equal(called.result.structuredContent.payment.verified, true);
  const validate = ajv.compile(tool.outputSchema);
  assert.equal(validate(called.result.structuredContent), true, JSON.stringify(validate.errors));
});


test('CLI distinguishes signature-only legacy input, rejected payment instructions and incomplete terms', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'settlens-cli-solana-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const invoke = async (req, options = {}) => {
    const file = join(dir, 'payment.json'); await writeFile(file, JSON.stringify({ requirement: req, payload: { transaction: tx(options) } }));
    return spawnSync(process.execPath, ['src/cli.js', 'verify-payment', file], { encoding: 'utf8' });
  };
  const legacy = await invoke({ scheme: 'exact', network: 'solana:test' });
  assert.equal(legacy.status, 0, legacy.stderr); assert.match(legacy.stdout, /^VERIFIED Solana signatures only/); assert.match(legacy.stdout, /Payment terms were not provided/);
  const good = await invoke(requirement); assert.equal(good.status, 0, good.stderr); assert.match(good.stdout, /^VERIFIED offline Solana payment instructions/);
  for (const options of [{ amount: '999' }, { destination: OWNER }]) {
    const bad = await invoke(requirement, options); assert.equal(bad.status, 1, bad.stderr); assert.match(bad.stdout, /^REJECTED offline Solana payment instructions/); assert.match(bad.stdout, /Offline payment profile: rejected/);
  }
  const unknown = await invoke(requirement, { program: TOKEN_2022_PROGRAM, destination: base58Encode(deriveAssociatedTokenAddress(OWNER, MINT, TOKEN_2022_PROGRAM)) });
  assert.equal(unknown.status, 1); assert.match(unknown.stdout, /^UNVERIFIED offline Solana payment instructions/);
  for (const fields of [{ asset: MINT }, { asset: MINT, amount: '1000', payTo: OWNER }, { amount: '1000', payTo: OWNER }, { asset: MINT, amount: '', payTo: OWNER }, { extra: { feePayer: requirement.extra.feePayer } }]) {
    const incomplete = await invoke({ network: 'solana:test', ...fields }); assert.equal(incomplete.status, 2); assert.match(incomplete.stderr, /partial terms cannot fall back/); assert.ok(!incomplete.stdout.includes('VERIFIED'));
  }
});

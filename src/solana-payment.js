// Bounded, offline inspection of the standard-wallet exact SVM profile.
// This is evidence about signed instructions, never proof of execution.
import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const COMPUTE_PROGRAM = 'ComputeBudget111111111111111111111111111111';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

export function decodeSolanaAddress(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) throw new Error('Expected a 32-byte base58 Solana address.');
  let number = 0n;
  for (const c of value) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) throw new Error('Expected a 32-byte base58 Solana address.');
    number = number * 58n + BigInt(digit);
  }
  const hex = number.toString(16).padStart(2, '0');
  const tail = number === 0n ? Buffer.alloc(0) : Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex');
  const zeros = value.match(/^1*/)[0].length;
  const bytes = Buffer.concat([Buffer.alloc(zeros), tail]);
  if (bytes.length !== 32) throw new Error('Expected a 32-byte base58 Solana address.');
  return bytes;
}

export function deriveAssociatedTokenAddress(owner, mint, program = SPL_TOKEN_PROGRAM) {
  const seeds = [decodeSolanaAddress(owner), decodeSolanaAddress(program), decodeSolanaAddress(mint)];
  const ata = decodeSolanaAddress(ATA_PROGRAM);
  for (let bump = 255; bump >= 0; bump--) {
    const digest = createHash('sha256').update(Buffer.concat([...seeds, Buffer.from([bump]), ata, Buffer.from('ProgramDerivedAddress')])).digest();
    let onCurve = true;
    try { ed25519.Point.fromBytes(digest, true); } catch { onCurve = false; }
    if (!onCurve) return digest;
  }
  throw new Error('Could not derive an associated token address.');
}

function uint64(value, label, allowZero = false) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) throw new Error(`${label} must be an unsigned decimal uint64 string.`);
  const n = BigInt(value);
  if (n > 18446744073709551615n || (!allowZero && n === 0n)) throw new Error(`${label} is outside the permitted uint64 range.`);
  return n;
}

function parseMessage(message, encode) {
  let cursor = 0;
  const take = (length) => {
    if (cursor + length > message.length) throw new Error('Truncated transaction message.');
    const result = message.subarray(cursor, cursor + length); cursor += length; return result;
  };
  const byte = () => take(1)[0];
  const length = () => {
    let value = 0;
    for (let i = 0; i < 3; i++) {
      const b = byte();
      if (i === 2 && b > 3) throw new Error('Invalid compact-u16 length.');
      value |= (b & 127) << (7 * i);
      if (!(b & 128)) {
        if (i > 0 && b === 0) throw new Error('Noncanonical compact-u16 length.');
        return value;
      }
    }
    throw new Error('Invalid compact-u16 length.');
  };
  let version = 'legacy';
  if (message[0] & 128) { version = `v${byte() & 127}`; if (version !== 'v0') throw new Error('Unsupported transaction version.'); }
  const required = byte(), readonlySigned = byte(), readonlyUnsigned = byte();
  const count = length();
  if (count > 256 || required < 1 || required > count || readonlySigned >= required || readonlyUnsigned > count - required) throw new Error('Invalid transaction account header.');
  const keys = Array.from({ length: count }, () => encode(take(32)));
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate static account keys.');
  take(32); // Blockhash expiry is deliberately not inferred offline.
  const instructions = Array.from({ length: length() }, () => {
    const program = byte();
    const accounts = [...take(length())];
    const data = Buffer.from(take(length()));
    return { program, accounts, data };
  });
  let loadedCount = 0;
  if (version === 'v0') {
    for (let tables = length(); tables > 0; tables--) { take(32); loadedCount += take(length()).length; loadedCount += take(length()).length; }
  }
  if (cursor !== message.length) throw new Error('Trailing transaction message bytes.');
  for (const ix of instructions) if (ix.program >= count + loadedCount || ix.accounts.some((i) => i >= count + loadedCount)) throw new Error('Instruction account index is out of range.');
  return { keys, required, instructions, loadedCount, writable: (i) => i < required ? i < required - readonlySigned : i < count - readonlyUnsigned };
}

export function inspectSolanaPayment(message, signatureResult, requirement, policy = {}, encode) {
  if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) throw new Error('requirement must be a payment requirement object.');
  const mint = requirement.asset, owner = requirement.payTo, feePayer = requirement.extra?.feePayer;
  decodeSolanaAddress(mint); decodeSolanaAddress(owner); decodeSolanaAddress(feePayer);
  const amount = uint64(requirement.amount, 'amount');
  if (requirement.scheme !== undefined && requirement.scheme !== 'exact') throw new Error('Only the exact Solana scheme is inspected.');
  if (requirement.network !== undefined && !/^solana:[A-Za-z0-9]{1,64}$/.test(requirement.network)) throw new Error('Expected a Solana network identifier.');
  const maxUnits = policy.maxComputeUnits ?? 400000;
  if (!Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 1400000) throw new Error('maxComputeUnits must be between 1 and 1400000.');
  const maxPrice = uint64(policy.maxPriorityFeeMicroLamports ?? '50000', 'maxPriorityFeeMicroLamports', true);
  const memo = requirement.extra?.memo;
  if (memo !== undefined && (typeof memo !== 'string' || Buffer.byteLength(memo) > 256 || memo.length === 0)) throw new Error('memo must contain 1 to 256 UTF-8 bytes.');
  const decimals = requirement.extra?.decimals;
  if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)) throw new Error('decimals must be an integer between 0 and 255.');
  const checks = [], transfers = [], limitations = ['No account state, balances, blockhash freshness, replay protection, simulation or settlement is checked. Network identity is not encoded in a Solana transaction.'];
  const check = (id, pass, detail, unknown = false) => checks.push({ id, status: pass ? 'pass' : unknown ? 'unverified' : 'fail', detail });
  const finish = () => ({ status: checks.some((c) => c.status === 'fail') ? 'rejected' : checks.some((c) => c.status === 'unverified') ? 'unverified' : 'verified', verified: checks.length > 0 && checks.every((c) => c.status === 'pass'), checks, transfers, limitations });
  check('signatures', signatureResult.verified, 'Present signatures and required signer slots must be valid.');
  let tx;
  try { tx = parseMessage(message, encode); } catch (error) { check('message', false, error.message); return finish(); }
  check('fee_payer', tx.keys[0] === feePayer, 'Fee payer must match the reviewed requirement.');
  if (tx.loadedCount) { check('lookup_tables', false, 'Address lookup tables cannot be resolved or authenticated offline.', true); return finish(); }
  check('signer_set', tx.required === 2 && signatureResult.signers?.[1]?.status === 'valid', 'This static profile requires a signed client and a sponsor; only the sponsor signature may be pending.');
  check('fee_payer_isolation', tx.instructions.every((ix) => ix.program !== 0 && !ix.accounts.includes(0)), 'Sponsor must not be referenced by any instruction as an account or program.');
  let units = 0, prices = 0, memos = 0, paymentCount = 0;
  for (const [index, ix] of tx.instructions.entries()) {
    const program = tx.keys[ix.program];
    if (program === COMPUTE_PROGRAM) {
      const validAccounts = ix.accounts.length === 0;
      if (ix.data[0] === 2 && ix.data.length === 5) {
        units++;
        check(`compute_limit.${index}`, validAccounts && paymentCount === 0 && ix.data.readUInt32LE(1) > 0 && ix.data.readUInt32LE(1) <= maxUnits, `Compute unit limit must precede payment and be at most ${maxUnits}.`);
      } else if (ix.data[0] === 3 && ix.data.length === 9) {
        prices++;
        check(`compute_price.${index}`, validAccounts && paymentCount === 0 && ix.data.readBigUInt64LE(1) <= maxPrice, `Compute price must precede payment and be at most ${maxPrice} micro-lamports.`);
      } else check(`compute_instruction.${index}`, false, 'Unsupported compute budget instruction.');
    } else if (program === MEMO_PROGRAM) {
      memos++;
      const text = ix.data.toString('utf8');
      check(`memo.${index}`, ix.accounts.length === 0 && ix.data.length <= 256 && (memo !== undefined ? ix.data.equals(Buffer.from(memo)) : /^[0-9a-f]{32,256}$/i.test(text)), 'Memo must match the required UTF-8 value, or contain a nonce of at least 16 bytes encoded as hex.');
    } else if (program === SPL_TOKEN_PROGRAM || program === TOKEN_2022_PROGRAM) {
      paymentCount++;
      if (ix.data.length !== 10 || ix.data[0] !== 12 || ix.accounts.length !== 4) { check(`transfer.${index}`, false, 'Only a single-authority TransferChecked instruction is supported.'); continue; }
      const [source, mintIndex, destination, authority] = ix.accounts;
      const value = ix.data.readBigUInt64LE(1).toString();
      const expectedDestination = encode(deriveAssociatedTokenAddress(owner, mint, program));
      transfers.push({ program, source: tx.keys[source], mint: tx.keys[mintIndex], destination: tx.keys[destination], authority: tx.keys[authority], amount: value, decimals: ix.data[9], expectedDestination });
      check(`mint.${index}`, tx.keys[mintIndex] === mint, 'Transfer mint must match the reviewed asset.');
      check(`recipient.${index}`, tx.keys[destination] === expectedDestination, 'Transfer destination must be the merchant ATA derived under this token program.');
      check(`amount.${index}`, BigInt(value) === amount, 'This conservative offline profile requires the exact advertised amount; overpayments are rejected.');
      check(`authority.${index}`, authority === 1 && source !== destination && tx.writable(source) && tx.writable(destination), 'Transfer authority must be the signed client; source and destination must be writable and distinct.');
      if (decimals !== undefined) check(`decimals.${index}`, ix.data[9] === decimals, 'Instruction decimals must match the reviewed decimals hint; on-chain mint decimals remain unchecked.');
      if (program === TOKEN_2022_PROGRAM) check(`token_extensions.${index}`, false, 'Token-2022 transfer fees and hooks depend on unavailable mint/account state; the net payment outcome is unverified.', true);
    } else check(`program.${index}`, false, 'Unknown, CPI, account-creation or wallet-protection instructions require execution/state analysis and are unsupported by this offline profile.', true);
  }
  check('compute_budget', units === 1 && prices === 1, 'Exactly one explicit compute limit and price are required.');
  check('memo_count', memos === 1, 'Exactly one memo is required by this conservative static profile.');
  check('transfer_count', paymentCount === 1, 'Exactly one top-level token transfer is required; multiple transfers are rejected.');
  return finish();
}

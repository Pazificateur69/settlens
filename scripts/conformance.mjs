import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { OFFICIAL_X402_CORE_VERSION, VERSION } from "../src/constants.js";
import { evaluatePaymentRequired } from "../src/preflight.js";
import { decodeBase64Json, validateWithOfficialSdk } from "../src/protocol.js";
import { scanTarget } from "../src/scanner.js";
import { sha256, stableStringify } from "../src/utils.js";

const CORPUS = new URL("../test/fixtures/conformance/x402-v2.json", import.meta.url);
const FLAGGED = new Set(["warn", "fail"]);

function applyChanges(value, patches = [], removals = []) {
  const result = structuredClone(value);
  for (const { path, value: replacement } of patches) {
    const parent = path.slice(0, -1).reduce((object, key) => object[key], result);
    parent[path.at(-1)] = structuredClone(replacement);
  }
  for (const path of removals) {
    const parent = path.slice(0, -1).reduce((object, key) => object[key], result);
    delete parent[path.at(-1)];
  }
  return result;
}

// xorshift32; the seed and generated case digest are recorded in the report.
function mutations(corpus, seed, count) {
  let state = seed || 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  return Array.from({ length: count }, (_, index) => {
    const field = ["payTo", "asset", "amount", "network"][index % 4];
    const random = next();
    const value = field === "amount" ? String(10001 + random)
      : field === "network" ? `eip155:${900000 + random}`
        : `0x${random.toString(16).padStart(8, "0").repeat(5)}`;
    const id = { payTo: "policy.recipient", asset: "policy.asset", amount: "policy.maximum_amount", network: "policy.network" }[field];
    return {
      id: `seeded-${field}-${index + 1}`, category: "seeded-policy",
      patches: [{ path: ["accepts", "0", field], value }],
      expect: { decision: "do_not_pay", scanFlagged: true, sdkAccepted: true,
        checks: [{ plane: "scan", id, status: "fail" }] },
    };
  });
}

function metrics(results, plane) {
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  for (const result of results) {
    const expected = plane === "scan" ? result.expected.scanFlagged : result.expected.decision !== "pay";
    const observed = plane === "scan" ? result.scan.flagged : result.preflight.decision !== "pay";
    counts[expected ? observed ? "truePositive" : "falseNegative" : observed ? "falsePositive" : "trueNegative"] += 1;
  }
  const positive = counts.truePositive + counts.falseNegative;
  const negative = counts.trueNegative + counts.falsePositive;
  return { ...counts, labelledPositive: positive, labelledNegative: negative,
    detectionRate: positive ? counts.truePositive / positive : null,
    falsePositiveRate: negative ? counts.falsePositive / negative : null };
}

export async function runConformance({ seed = 402, mutationCount = 32 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be an unsigned 32-bit integer.");
  if (!Number.isInteger(mutationCount) || mutationCount < 0 || mutationCount > 1000) throw new Error("mutations must be an integer between 0 and 1000.");
  const text = await readFile(CORPUS, "utf8");
  const corpus = JSON.parse(text);
  const installedSdk = JSON.parse(await readFile(new URL("../node_modules/@x402/core/package.json", import.meta.url), "utf8")).version;
  if (installedSdk !== OFFICIAL_X402_CORE_VERSION) throw new Error("Installed SDK does not match the declared pinned version; run npm ci --ignore-scripts.");
  const generated = mutations(corpus, seed, mutationCount);
  const results = [];
  let requests = 0;
  let unsafeAttempts = 0;
  for (const fixture of [...corpus.cases, ...generated]) {
    let value = Object.hasOwn(fixture, "replace") ? fixture.replace : applyChanges(corpus.base, fixture.patches, fixture.remove);
    if (fixture.reverseKeys) value = Object.fromEntries(Object.entries(value).reverse());
    const encode = (input) => Buffer.from(JSON.stringify(input)).toString(fixture.encoding ?? "base64");
    const header = Object.hasOwn(fixture, "header") ? fixture.header : encode(value);
    const second = Object.hasOwn(fixture, "header") ? header : encode(applyChanges(value, fixture.repeatPatches));
    const url = fixture.url ?? corpus.resourceUrl;
    const policy = fixture.policy ?? corpus.policy;
    let calls = 0;
    const fetchImpl = async (requestedUrl, options) => {
      if (String(requestedUrl) !== url || options.method !== "GET" || options.redirect !== "manual" || options.headers.has("payment-signature") || calls >= 2) {
        unsafeAttempts += 1;
        throw new Error("Conformance harness forbids network destinations, redirects and payments.");
      }
      calls += 1;
      requests += 1;
      const selectedHeader = calls === 1 ? header : second;
      return new Response("{}", { status: fixture.status ?? 402,
        headers: { ...fixture.headers, ...(selectedHeader === null ? {} : { "payment-required": selectedHeader }) } });
    };
    const scan = await scanTarget({ name: fixture.id, url, expected: policy }, { repeat: 2, fetchImpl });
    const preflight = evaluatePaymentRequired({ paymentRequired: header ?? "", resourceUrl: url, policy });
    let sdkAccepted = null;
    try { sdkAccepted = validateWithOfficialSdk(decodeBase64Json(header)).length === 0; } catch { /* Encoding failures have no decoded object to parse. */ }
    const failures = [];
    if (unsafeAttempts) failures.push("The harness rejected a forbidden request.");
    const flagged = scan.checks.some(({ status }) => FLAGGED.has(status));
    if (preflight.decision !== fixture.expect.decision) failures.push(`preflight: expected ${fixture.expect.decision}, observed ${preflight.decision}`);
    if (flagged !== fixture.expect.scanFlagged) failures.push(`scan: expected flagged=${fixture.expect.scanFlagged}, observed ${flagged}`);
    if (sdkAccepted !== fixture.expect.sdkAccepted) failures.push(`SDK parser: expected ${fixture.expect.sdkAccepted}, observed ${sdkAccepted}`);
    for (const expectation of fixture.expect.checks) {
      const observed = (expectation.plane === "scan" ? scan : preflight).checks.find(({ id }) => id === expectation.id)?.status;
      if (observed !== expectation.status) failures.push(`${expectation.plane}.${expectation.id}: expected ${expectation.status}, observed ${observed ?? "absent"}`);
    }
    if (preflight.decision === "do_not_pay" && preflight.acceptable.length !== 0) failures.push("Blocked preflight offered a payment option.");
    results.push({ id: fixture.id, category: fixture.category, expected: fixture.expect,
      passed: failures.length === 0, failures, sdkAccepted,
      preflight: { decision: preflight.decision, acceptableCount: preflight.acceptable.length },
      scan: { flagged, requests: calls, findings: scan.checks.filter(({ status }) => FLAGGED.has(status)).map(({ id, status, severity }) => ({ id, status, severity })) } });
  }
  return {
    schemaVersion: 1, productVersion: VERSION,
    corpus: { version: corpus.version, sha256: sha256(text), namedCases: corpus.cases.length, seed,
      generatedCases: generated.length, generatedSha256: sha256(stableStringify(generated)) },
    environment: { node: process.version, sdk: { package: "@x402/core", version: installedSdk, surface: "parsePaymentRequired" } },
    scope: "Synthetic in-memory HTTP responses and offline preflight only. No external requests, TLS handshake, signatures, RPC or settlement are tested. Rates apply only to this labelled corpus.",
    transport: { mode: "in-memory", externalRequests: 0, unsafeAttempts, simulatedRequests: requests },
    summary: { cases: results.length, passed: results.filter(({ passed }) => passed).length,
      failed: results.filter(({ passed }) => !passed).length, scan: metrics(results, "scan"), preflight: metrics(results, "preflight") },
    results,
  };
}

export async function conformanceMain(args = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = {};
    let out;
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index];
      const value = args[index + 1];
      if (!["--seed", "--mutations", "--out"].includes(name) || value === undefined) throw new Error("Usage: npm run conformance -- [--seed 402] [--mutations 32] [--out report.json]");
      if (name === "--out") out = value;
      else options[name === "--seed" ? "seed" : "mutationCount"] = /^\d+$/.test(value) ? Number(value) : NaN;
    }
    const report = await runConformance(options);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (out) await writeFile(out, json, { encoding: "utf8", mode: 0o600, flag: "wx" });
    else stdout.write(json);
    stderr.write(`${report.summary.passed}/${report.summary.cases} conformance cases pass; ${report.summary.failed} mismatch(es). SDK @x402/core ${report.environment.sdk.version}. Corpus-only metrics.\n`);
    return report.summary.failed ? 1 : 0;
  } catch (error) {
    stderr.write(`Conformance error: ${error.code === "EEXIST" ? "output already exists; choose another path." : error.message}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await conformanceMain();

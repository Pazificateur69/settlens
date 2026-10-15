import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase64Json,
  encodeBase64Json,
  isCaip2,
  isPositiveAtomicAmount,
  validatePaymentRequiredShape,
  validateRequirement,
  validateWithOfficialSdk,
} from "../src/protocol.js";
import { normalizeTarget } from "../src/config.js";

test("Base64 JSON round-trips", () => {
  const value = { x402Version: 2, accepts: [] };
  assert.deepEqual(decodeBase64Json(encodeBase64Json(value)), value);
});

test("invalid encoded headers are rejected", () => {
  assert.throws(() => decodeBase64Json("***"), /outside Base64/);
  assert.throws(
    () => decodeBase64Json(Buffer.from("not-json").toString("base64")),
    /not valid JSON/,
  );
});

test("CAIP-2 and atomic amount validators follow core constraints", () => {
  assert.equal(isCaip2("eip155:84532"), true);
  assert.equal(
    isCaip2("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"),
    true,
  );
  assert.equal(isCaip2("base"), false);
  assert.equal(isPositiveAtomicAmount("10000"), true);
  assert.equal(isPositiveAtomicAmount("0"), false);
  assert.equal(isPositiveAtomicAmount("1.5"), false);
});

test("PaymentRequired core shape is validated", () => {
  const valid = {
    x402Version: 2,
    resource: { url: "https://example.com/data" },
    accepts: [{}],
  };
  assert.deepEqual(validatePaymentRequiredShape(valid), []);
  assert.ok(validatePaymentRequiredShape({}).length >= 3);
});

test("EVM requirement validates recipient and required fields", () => {
  const valid = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
  };
  assert.deepEqual(validateRequirement(valid, 0), []);
  assert.ok(
    validateRequirement({ ...valid, payTo: "not-an-address" }, 0).some(
      (problem) => problem.includes("20-byte EVM"),
    ),
  );
});

test("targets cannot provide a real PAYMENT-SIGNATURE", () => {
  assert.throws(
    () =>
      normalizeTarget({
        url: "https://example.com/paid",
        headers: { "PAYMENT-SIGNATURE": "real-payment-data" },
      }),
    /never sends real payment authorizations/,
  );
});

test("official x402 SDK accepts the canonical V2 fixture", () => {
  const fixture = {
    x402Version: 2,
    resource: {
      url: "https://example.com/paid",
      description: "Paid data",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        amount: "10000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" },
      },
    ],
    extensions: {},
  };
  assert.deepEqual(validateWithOfficialSdk(fixture), []);
});

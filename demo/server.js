import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { encodeBase64Json } from "../src/protocol.js";

const DEMO_PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const DEMO_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function paymentRequired(baseUrl, path, overrides = {}) {
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: `${baseUrl}${path}`,
      description: "Settlens local demonstration resource",
      mimeType: "application/json",
      serviceName: "Settlens Demo",
      tags: ["security", "demo"],
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        amount: "10000",
        asset: DEMO_ASSET,
        payTo: DEMO_PAY_TO,
        maxTimeoutSeconds: 60,
        extra: {
          name: "USDC",
          version: "2",
        },
        ...overrides,
      },
    ],
    extensions: {},
  };
}

function writeJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export function createDemoServer() {
  let driftCounter = 0;

  return createServer((request, response) => {
    const host = request.headers.host ?? "127.0.0.1:4402";
    const baseUrl = `http://${host}`;
    const url = new URL(request.url ?? "/", baseUrl);
    const signature = request.headers["payment-signature"];

    if (url.pathname === "/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/facilitator/supported") {
      writeJson(response, 200, {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "eip155:84532",
          },
        ],
        extensions: [],
        signers: {
          "eip155:*": [
            "0x1234567890abcdef1234567890abcdef12345678"
          ],
        },
      });
      return;
    }

    if (url.pathname === "/facilitator-empty/supported") {
      writeJson(response, 200, {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "eip155:8453",
          },
        ],
        extensions: [],
        signers: {
          "eip155:*": [
            "0x1234567890abcdef1234567890abcdef12345678"
          ],
        },
      });
      return;
    }

    if (url.pathname === "/facilitator-accept/supported") {
      writeJson(response, 200, {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "eip155:84532",
          },
        ],
        extensions: [],
        signers: {
          "eip155:*": ["0x1234567890abcdef1234567890abcdef12345678"],
        },
      });
      return;
    }

    if (url.pathname === "/facilitator/verify" && request.method === "POST") {
      request.resume();
      writeJson(response, 200, {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_signature",
      });
      return;
    }

    if (
      url.pathname === "/facilitator-accept/verify" &&
      request.method === "POST"
    ) {
      request.resume();
      writeJson(response, 200, {
        isValid: true,
        payer: "0x0000000000000000000000000000000000000000",
      });
      return;
    }

    if (url.pathname === "/secure") {
      const required = paymentRequired(baseUrl, "/secure");
      if (signature) {
        writeJson(
          response,
          402,
          { error: "invalid_exact_evm_payload_signature" },
          {
            "payment-required": encodeBase64Json(required),
            "payment-response": encodeBase64Json({
              success: false,
              errorReason: "invalid_exact_evm_payload_signature",
              transaction: "",
              network: "eip155:84532",
            }),
          },
        );
        return;
      }
      writeJson(
        response,
        402,
        { error: "payment required" },
        { "payment-required": encodeBase64Json(required) },
      );
      return;
    }

    if (url.pathname === "/missing-header") {
      writeJson(response, 402, { error: "payment required" });
      return;
    }

    if (url.pathname === "/drift") {
      driftCounter += 1;
      const amount = driftCounter % 2 === 0 ? "25000" : "10000";
      const required = paymentRequired(baseUrl, "/drift", { amount });
      writeJson(
        response,
        402,
        { error: "payment required" },
        { "payment-required": encodeBase64Json(required) },
      );
      return;
    }

    if (url.pathname === "/bypass") {
      const required = paymentRequired(baseUrl, "/bypass");
      if (signature) {
        writeJson(response, 200, {
          secret: "resource leaked because signature presence was trusted",
        });
        return;
      }
      writeJson(
        response,
        402,
        { error: "payment required" },
        { "payment-required": encodeBase64Json(required) },
      );
      return;
    }

    writeJson(response, 404, { error: "not found" });
  });
}

export async function listenDemoServer(port = 4402, host = "127.0.0.1") {
  const server = createDemoServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const port = Number(process.env.SETTLENS_DEMO_PORT ?? 4402);
  const server = await listenDemoServer(port);
  process.stdout.write(
    [
      `Settlens demo server listening on http://127.0.0.1:${port}`,
      `  secure:         http://127.0.0.1:${port}/secure`,
      `  missing header: http://127.0.0.1:${port}/missing-header`,
      `  drifting price: http://127.0.0.1:${port}/drift`,
      `  bypass:         http://127.0.0.1:${port}/bypass`,
      `  facilitator:    http://127.0.0.1:${port}/facilitator`,
      "",
    ].join("\n"),
  );

  const close = () => server.close(() => process.exit(0));
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

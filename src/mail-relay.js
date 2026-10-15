import { request, Agent } from "node:https";
import { connect } from "node:tls";
import { readFileSync } from "node:fs";
const RECIPIENT = "contact@settlens.com";
export function createMailRelayTransport(env, { requestImpl = request } = {}) {
  const endpoint = new URL(env.SETTLENS_MAIL_RELAY_URL);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/email" || !env.SETTLENS_MAIL_RELAY_TOKEN || env.SETTLENS_MAIL_RELAY_TOKEN.length < 32 || !env.SETTLENS_MAIL_RELAY_CA) throw new Error("Configure an HTTPS /email relay, a dedicated token and its CA certificate.");
  const ca = readFileSync(env.SETTLENS_MAIL_RELAY_CA);
  let agent;
  if (env.SETTLENS_MAIL_RELAY_SOCKET) {
    if (!env.SETTLENS_MAIL_RELAY_SOCKET.startsWith("/")) throw new Error("Relay socket must be an absolute path.");
    agent = new Agent({ keepAlive: false });
    agent.createConnection = () => connect({ path: env.SETTLENS_MAIL_RELAY_SOCKET, ca, host: endpoint.hostname, rejectUnauthorized: true });
  }
  return {
    sendMail(message) {
      const payload = JSON.stringify({ subject: message.subject, text: message.text, replyTo: message.replyTo?.address });
      if (Buffer.byteLength(payload) > 65536) return Promise.reject(new Error("Relay message exceeds the size limit."));
      return new Promise((resolve, reject) => {
        const req = requestImpl(endpoint, {
          method: "POST", ca, rejectUnauthorized: true, ...(agent ? { agent } : {}),
          headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), authorization: `Bearer ${env.SETTLENS_MAIL_RELAY_TOKEN}` },
          signal: AbortSignal.timeout(15000),
        }, (res) => {
          let size = 0;
          res.on("data", (chunk) => { size += chunk.length; if (size > 4096) res.destroy(new Error("Relay response exceeds the size limit.")); });
          res.on("error", reject);
          res.on("end", () => res.statusCode === 202 ? resolve({ accepted: [RECIPIENT], rejected: [] }) : reject(new Error("Relay rejected the message.")));
        });
        req.on("error", reject); req.end(payload);
      });
    },
    close() { agent?.destroy(); },
  };
}

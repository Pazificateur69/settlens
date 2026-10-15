// Owner-only SMTP or dedicated HTTPS-relay notifications. No visitor-controlled recipient or sender.
import nodemailer from "nodemailer";
import { createMailRelayTransport } from "./mail-relay.js";
import { blockingAlerts } from "./monitor-webhook.js";
const RECIPIENT = "contact@settlens.com";
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function truncateMail(text) {
  const source = String(text);
  if (Buffer.byteLength(source) <= 40000) return source;
  let shortened = source.slice(0, 13000);
  while (Buffer.byteLength(shortened) > 39000) shortened = shortened.slice(0, -1000);
  return `${shortened}\n\n[Message abrégé. Consulter le tableau de bord privé pour le détail complet.]\n`;
}
function smtpPassword(env) {
  if (env.SMTP_PASSWORD_B64 === undefined) return env.SMTP_PASSWORD;
  const encoded = env.SMTP_PASSWORD_B64;
  const bytes = Buffer.from(String(encoded), "base64");
  const value = bytes.toString("utf8");
  if (typeof encoded !== "string" || !encoded || encoded.length > 16384 || bytes.toString("base64") !== encoded || Buffer.from(value, "utf8").compare(bytes) !== 0 || /[\r\n\0]/.test(value)) throw new Error("Invalid protected SMTP password encoding.");
  return value;
}
export function createEmailNotifications(env = process.env, { transportFactory = nodemailer.createTransport, relayTransportFactory = createMailRelayTransport } = {}) {
  if (env.SETTLENS_EMAIL_ENABLED !== "1") return null;
  const password = env.SETTLENS_MAIL_RELAY_URL ? undefined : smtpPassword(env);
  const port = Number(env.SMTP_PORT ?? 465);
  const from = env.SMTP_FROM ?? env.SMTP_USER ?? (env.SETTLENS_MAIL_RELAY_URL ? RECIPIENT : undefined);
  if (!env.SETTLENS_MAIL_RELAY_URL && (!env.SMTP_HOST || !env.SMTP_USER || !password || !EMAIL.test(from ?? "") || ![465, 587].includes(port))) throw new Error("Email notifications require SMTP_HOST, SMTP_USER, SMTP_PASSWORD, a valid SMTP_FROM, and port 465 or 587. Credentials must remain in the protected server environment.");
  const transport = env.SETTLENS_MAIL_RELAY_URL ? relayTransportFactory(env) : transportFactory({
    host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: password },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    logger: false, debug: false, transactionLog: false,
    disableFileAccess: true, disableUrlAccess: true,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 5000, dnsTimeout: 5000,
  });
  async function send(subject, text, replyTo) {
    try {
      const info = await transport.sendMail({
        from: { name: "Settlens", address: from }, to: { address: RECIPIENT },
        envelope: { from, to: [RECIPIENT] }, subject, text: truncateMail(text),
        ...(replyTo && EMAIL.test(replyTo) ? { replyTo: { address: replyTo } } : {}),
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!info.accepted?.some((address) => String(address).toLowerCase() === RECIPIENT) || info.rejected?.length) throw new Error();
      return { delivered: true, skipped: false };
    } catch { return { delivered: false, skipped: false, error: "Settlens email notification failed; the SMTP server did not confirm acceptance." }; }
  }
  return {
    async pilot(submission) {
      return send("[Settlens][PILOTE] Nouvelle demande", `Nouvelle demande de pilote Settlens\n\nDate : ${submission.receivedAt}\nNom : ${submission.name}\nEmail : ${submission.email}\nSociété : ${submission.company}\nPage : ${submission.page ?? submission.source}\n\nMessage :\n${submission.message}\n`, submission.email);
    },
    async monitor(runs, failOn = "high") {
      const alerts = blockingAlerts(runs, failOn);
      if (!alerts.length) return { delivered: false, skipped: true };
      const details = runs.filter((run) => blockingAlerts([run], failOn).length).map((run) => `${run.method} ${run.url}\n${blockingAlerts([run], failOn).map((alert) => `[${alert.severity}] ${alert.id}: ${alert.title}\n${alert.recommendation ?? "Review the endpoint configuration."}`).join("\n\n")}`).join("\n\n");
      return send(`[Settlens][ALERTE] ${alerts.length} alerte(s) à vérifier`, `Settlens Monitor — seuil ${failOn}\n\n${details}\n\nObservations passives uniquement ; aucune vérification on-chain ni de settlement.\n`);
    },
    async access(code) {
      return send("[Settlens][ACCES] Votre code de connexion", `Votre code de connexion Settlens : ${code}\n\nIl expire dans 10 minutes et ne fonctionne qu’une fois. Si vous n’avez pas demandé ce code, ignorez ce message.\n`);
    },
    async test() { return send("[Settlens][TEST] Vérification des notifications", "Test de livraison des notifications Settlens vers contact@settlens.com.\n"); },
    close() { transport.close(); },
  };
}

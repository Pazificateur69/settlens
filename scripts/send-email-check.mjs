import { createEmailNotifications } from "../src/notifications.js";
const notifications = createEmailNotifications();
if (!notifications) throw new Error("Configure SMTP and SETTLENS_EMAIL_ENABLED=1 in the protected server environment first.");
try {
  const result = await notifications.test();
  if (!result.delivered) { console.error(result.error); process.exitCode = 1; }
  else console.log("SMTP accepted the test email to contact@settlens.com. Check the inbox to confirm delivery.");
} finally { notifications.close(); }

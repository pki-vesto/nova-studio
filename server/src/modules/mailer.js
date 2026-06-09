// Optional, pluggable email delivery. Stays a no-op unless the operator both
// sets NOVA_SMTP_URL and has `nodemailer` installed — so the app ships with no
// hard mail dependency, and notifications are always recorded in-app regardless.
//
// To enable real email: `npm install nodemailer` and set
//   NOVA_SMTP_URL=smtp://user:pass@host:587
//   NOVA_SMTP_FROM="Nova Studio <studio@example.nl>"   (optional)
//   NOVA_NOTIFY_TO=designer@example.nl                  (default recipient)

let cachedTransport;
function getTransport() {
  if (cachedTransport !== undefined) return cachedTransport;
  cachedTransport = null;
  if (process.env.NOVA_SMTP_URL) {
    try {
      // Lazy, optional require — absent in the default install.
      const nodemailer = require("nodemailer");
      cachedTransport = nodemailer.createTransport(process.env.NOVA_SMTP_URL);
    } catch {
      cachedTransport = null;
    }
  }
  return cachedTransport;
}

function isConfigured() {
  return !!getTransport();
}

// Never throws — returns { sent, reason? } so callers can record delivery state
// without risking the primary write.
async function send({ to, subject, body } = {}) {
  const transport = getTransport();
  if (!transport) return { sent: false, reason: "not-configured" };
  try {
    await transport.sendMail({
      from: process.env.NOVA_SMTP_FROM || "nova-studio@localhost",
      to: to || process.env.NOVA_NOTIFY_TO || "",
      subject: subject || "Nova Studio",
      text: body || ""
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { send, isConfigured };

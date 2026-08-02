const nodemailer = require("nodemailer");

let transporter = null;
let warnedNoSmtp = false;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
  return transporter;
}

// No SMTP_* env vars configured (e.g. local dev, or before you've picked a
// provider) — the reset link is logged instead of emailed, so the flow is
// still fully testable. Set SMTP_HOST/PORT/USER/PASS/FROM before going live;
// nothing else about this flow needs to change once you do.
async function sendPasswordResetEmail(toEmail, resetUrl) {
  const t = getTransporter();

  if (!t) {
    if (!warnedNoSmtp) {
      console.warn("[mailer] SMTP not configured — password reset links will be logged, not emailed.");
      warnedNoSmtp = true;
    }
    console.log(`[password reset] link for ${toEmail}: ${resetUrl}`);
    return;
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "Reset your QuickCartPOS password",
    text: `We received a request to reset your QuickCartPOS password.\n\n` +
          `Reset it here (valid for 1 hour):\n${resetUrl}\n\n` +
          `If you didn't request this, you can safely ignore this email.`
  });
}

module.exports = { sendPasswordResetEmail };

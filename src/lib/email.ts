import nodemailer from "nodemailer";
export async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "SMTP_HOST must be configured for production email delivery.",
      );
    console.info(
      `[IssuePulse development email] To: ${to}\n${subject}\n${text}`,
    );
    return;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
}

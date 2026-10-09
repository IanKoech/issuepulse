import type { BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins";
import { db } from "./db";
import { sendEmail } from "./email";
export const authOptions = {
  appName: "IssuePulse",
  database: db,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendEmail(
        user.email,
        "Reset your IssuePulse password",
        `Reset your password: ${url}`,
      ),
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) =>
      sendEmail(
        user.email,
        "Verify your IssuePulse email",
        `Verify your email: ${url}`,
      ),
  },
  user: {
    deleteUser: {
      enabled: true,
      deleteTokenExpiresIn: 3600,
      sendDeleteAccountVerification: async ({ user, url }) =>
        sendEmail(
          user.email,
          "Confirm account deletion",
          `Deleting your account also deletes teams where you are the only owner, including their monitors and incidents. Confirm within one hour: ${url}`,
        ),
      beforeDelete: async (user) => {
        await db.query(
          `DELETE FROM organization WHERE id IN (
        SELECT m."organizationId" FROM member m WHERE m."userId"=$1 AND m.role='owner'
        AND NOT EXISTS(SELECT 1 FROM member other WHERE other."organizationId"=m."organizationId" AND other."userId"<>$1 AND other.role='owner')
      )`,
          [user.id],
        );
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
  plugins: [
    organization({
      invitationExpiresIn: 60 * 60 * 24 * 2,
      requireEmailVerificationOnInvitation: true,
      sendInvitationEmail: async (data) => {
        await sendEmail(
          data.email,
          `Join ${data.organization.name} on IssuePulse`,
          `${data.inviter.user.name} invited you. Accept within 48 hours: ${process.env.BETTER_AUTH_URL}/invite/${data.id}`,
        );
      },
    }),
  ],
} satisfies BetterAuthOptions;

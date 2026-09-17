import { Resend } from "resend";

const globalForEmail = globalThis as unknown as { fogResendClient?: Resend };

/**
 * Lazily initialised Resend client - same "throw with setup instructions"
 * pattern as lib/firebase-admin.ts. Needs a real Resend account and a
 * verified sending domain before this can send for real; see SRS.md
 * Section 11's note on this.
 */
function getResendClient(): Resend {
  if (!globalForEmail.fogResendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is not set - add it to .env.local for local dev, or the deployment's environment variables.",
      );
    }
    globalForEmail.fogResendClient = new Resend(apiKey);
  }
  return globalForEmail.fogResendClient;
}

function fromAddress(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      "EMAIL_FROM is not set - add it to .env.local for local dev, or the deployment's environment variables.",
    );
  }
  return from;
}

export async function sendPolicyDocumentEmail(options: {
  to: string;
  policyDisplayName: string;
  attachmentFileName: string;
  pdf: Buffer;
}): Promise<void> {
  const client = getResendClient();
  const { error } = await client.emails.send({
    from: fromAddress(),
    to: options.to,
    subject: `Your ${options.policyDisplayName} document`,
    // Customer-facing copy - DRAFT, needs Compliance sign-off before use
    // per FOGIL's FCA authorisation.
    text: [
      `Attached is your ${options.policyDisplayName} document.`,
      "",
      "If anything looks wrong, sign in and check My policies, or get in touch with us.",
    ].join("\n"),
    attachments: [{ filename: options.attachmentFileName, content: options.pdf }],
  });
  if (error) {
    throw new Error(`Resend failed to send the policy document email: ${error.message}`);
  }
}

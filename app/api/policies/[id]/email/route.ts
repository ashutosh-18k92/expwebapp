import { NextResponse } from "next/server";
import { getDb, type PolicyDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadPolicyDocument } from "@/lib/policy-document";
import { sendPolicyDocumentEmail } from "@/lib/email";

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot);
}

// Emails a copy of the policy document to the signed-in customer's own
// registered address, rather than serving a plain browser download (SRS
// Section 11 - browser downloads were judged unsafe for this kind of
// document).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();
  const policy = await db.collection<PolicyDoc>("policies").findOne({ _id: id, userId: user._id });
  if (!policy) {
    return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  }

  try {
    const pdf = await loadPolicyDocument(policy.userId, policy.fileName);
    await sendPolicyDocumentEmail({
      to: user.email,
      policyDisplayName: policy.displayName,
      attachmentFileName: `${policy.displayName}${fileExtension(policy.fileName)}`,
      pdf,
    });
  } catch (error) {
    console.error("Failed to email policy document", error);
    return NextResponse.json({ error: "Couldn't send that document. Try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const dateOfBirth = body?.dateOfBirth;

  if (!firstName) {
    return NextResponse.json({ error: "Enter a first name." }, { status: 400 });
  }
  if (typeof dateOfBirth !== "string" || !DATE_RE.test(dateOfBirth)) {
    return NextResponse.json({ error: "Date of birth must be in YYYY-MM-DD format." }, { status: 400 });
  }
  const parsedDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "Date of birth could not be parsed." }, { status: 400 });
  }

  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: user._id }, { $set: { firstName, dateOfBirth: parsedDate } });

  return NextResponse.json({ ok: true });
}

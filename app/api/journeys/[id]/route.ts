import { NextResponse } from "next/server";
import { getDb, type JourneyDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();
  const result = await db.collection<JourneyDoc>("journeys").deleteOne({ _id: id, userId: user._id });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

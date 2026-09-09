import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, type JourneyDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const db = await getDb();
  const journeys = await db
    .collection<JourneyDoc>("journeys")
    .find({ userId: user._id })
    .sort({ journeyDate: 1 })
    .toArray();

  return NextResponse.json({ journeys });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const date = body?.date;
  const time = body?.time;

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be in YYYY-MM-DD format." }, { status: 400 });
  }
  if (typeof time !== "string" || !TIME_RE.test(time)) {
    return NextResponse.json({ error: "time must be in HH:MM format." }, { status: 400 });
  }

  const journeyDate = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(journeyDate.getTime())) {
    return NextResponse.json({ error: "date/time could not be parsed." }, { status: 400 });
  }

  const doc: JourneyDoc = {
    _id: randomUUID(),
    userId: user._id,
    journeyDate,
    createdAt: new Date(),
    reminderSentAt: null,
  };

  const db = await getDb();
  await db.collection<JourneyDoc>("journeys").insertOne(doc);

  return NextResponse.json({ journey: doc });
}

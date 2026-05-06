"use server";

import { eq } from "drizzle-orm";
import { db } from "../db";
import { practitioners } from "../db/schema";

export async function getByUserId(userId: string) {
  const [profile] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, userId));

  return profile ?? null;
}

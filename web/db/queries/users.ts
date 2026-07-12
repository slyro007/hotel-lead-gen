import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema";

export async function getUserByClerkId(clerkUserId: string) {
  const rows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertUserFromClerk(input: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ clerkUserId: input.id, email: input.email })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { email: input.email, updatedAt: new Date() },
    });
}

export async function deleteUserByClerkId(clerkUserId: string) {
  await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}

import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserByClerkId, upsertUserFromClerk } from "../db/queries/users";

/**
 * Signed-in Clerk identity joined with the app's own `users` row. If the row
 * doesn't exist yet (first sign-in — no webhook dependency), it's created
 * on the spot with approved=false. The Clerk webhook, when configured, keeps
 * rows in sync on updates/deletes; this lazy upsert covers creation.
 */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const existing = await getUserByClerkId(userId);
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return null;
  await upsertUserFromClerk({ id: userId, email });
  return getUserByClerkId(userId);
}

/**
 * Access gate for every data-bearing page and API route. Sign-up is open at
 * the Clerk level, but data requires the manual `approved` flag — this is an
 * operator tool, not a self-serve product. Flip it in the DB:
 *   update users set approved = true, is_admin = true where email = '...';
 */
export async function requireApproved() {
  const user = await getCurrentUser();
  if (!user || !user.approved) return null;
  return user;
}

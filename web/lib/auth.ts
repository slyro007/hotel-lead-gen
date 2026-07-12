import { auth } from "@clerk/nextjs/server";
import { getUserByClerkId } from "../db/queries/users";

/**
 * Signed-in Clerk identity joined with the app's own `users` row. Returns null
 * if signed out OR if the Clerk webhook hasn't synced this user yet (a
 * brand-new sign-up in the seconds before the webhook lands).
 */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return getUserByClerkId(userId);
}

/**
 * Access gate for every data-bearing page and API route. Sign-up is open at
 * the Clerk level, but data requires the manual `approved` flag — this is an
 * operator tool, not a self-serve product.
 */
export async function requireApproved() {
  const user = await getCurrentUser();
  if (!user || !user.approved) return null;
  return user;
}

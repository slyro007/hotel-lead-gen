import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { deleteUserByClerkId, upsertUserFromClerk } from "../../../../db/queries/users";

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return new Response("Verification failed", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, email_addresses } = evt.data;
    const email = email_addresses[0]?.email_address;
    if (email) {
      await upsertUserFromClerk({ id, email });
    }
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) await deleteUserByClerkId(id);
  }

  return new Response("OK", { status: 200 });
}

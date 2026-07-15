import type { UserIdentity } from "convex/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { env } from "./_generated/server";

type AuthOnlyCtx = Pick<QueryCtx | MutationCtx | ActionCtx, "auth">;

function normalizeEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export async function requireAllowedIdentity(
  ctx: AuthOnlyCtx,
): Promise<UserIdentity & { tokenIdentifier: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Not authenticated");
  if (normalizeEmail(identity.email) !== normalizeEmail(env.ALLOWED_USER_EMAIL)) {
    throw new Error("Unauthorized");
  }
  return identity;
}

export async function requireOwnerId(ctx: AuthOnlyCtx): Promise<string> {
  return (await requireAllowedIdentity(ctx)).tokenIdentifier;
}

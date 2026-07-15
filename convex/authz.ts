import { getAuthUserId } from "@convex-dev/auth/server";
import type { UserIdentity } from "convex/server";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { env } from "./_generated/server";

type AuthOnlyCtx = Pick<QueryCtx | MutationCtx | ActionCtx, "auth">;
type DataCtx = Pick<QueryCtx | MutationCtx, "auth" | "db">;

function normalizeEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

async function requireIdentity(
  ctx: AuthOnlyCtx,
): Promise<UserIdentity & { tokenIdentifier: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Not authenticated");
  return identity;
}

export async function requireOwnerId(ctx: DataCtx): Promise<string> {
  const identity = await requireIdentity(ctx);
  const allowedEmail = normalizeEmail(env.ALLOWED_USER_EMAIL);
  const identityEmail = normalizeEmail(identity.email);
  if (identityEmail) {
    if (identityEmail !== allowedEmail || !allowedEmail) throw new Error("Unauthorized");
    return identity.tokenIdentifier;
  }

  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get("users", userId) : null;
  if (!user || normalizeEmail(user.email) !== allowedEmail || !allowedEmail) {
    throw new Error("Unauthorized");
  }
  return identity.tokenIdentifier;
}

export async function requireActionOwnerId(ctx: ActionCtx): Promise<string> {
  const identity = await requireIdentity(ctx);
  const allowedEmail = normalizeEmail(env.ALLOWED_USER_EMAIL);
  const identityEmail = normalizeEmail(identity.email);
  if (identityEmail) {
    if (identityEmail !== allowedEmail || !allowedEmail) throw new Error("Unauthorized");
    return identity.tokenIdentifier;
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  await ctx.runQuery(internal.access.authorizeAllowedUser, { userId });
  return identity.tokenIdentifier;
}

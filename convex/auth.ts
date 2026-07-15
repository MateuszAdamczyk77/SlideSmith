import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { env } from "./_generated/server";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = normalizeEmail(params.email);
        if (!email || email !== normalizeEmail(env.ALLOWED_USER_EMAIL)) {
          throw new Error("This account is not allowed to access SlideSmith.");
        }
        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < 12) {
          throw new Error("Password must contain at least 12 characters.");
        }
      },
    }),
  ],
});

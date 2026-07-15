import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    ALLOWED_USER_EMAIL: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
    POST_BRIDGE_API_KEY: v.optional(v.string()),
    OPENROUTER_MODEL: v.optional(v.string()),
  },
});

export default app;

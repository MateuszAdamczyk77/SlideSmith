import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnerId } from "./authz";
import { getConfigData, getSettings } from "./dataHelpers";

export const get = query({
  args: {},
  handler: async (ctx) => getConfigData(ctx, await requireOwnerId(ctx)),
});

export const saveModel = mutation({
  args: { model: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    const model = args.model.trim();
    if (!model) throw new Error("Model is required");
    const settings = await getSettings(ctx, ownerId);
    if (settings) await ctx.db.patch("settings", settings._id, { model });
    else await ctx.db.insert("settings", { ownerId, model });
    return await getConfigData(ctx, ownerId);
  },
});

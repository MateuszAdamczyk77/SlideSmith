import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { getSettings, requireOwnedImagePack, requireOwnedProject, requireOwnedSlideshow } from "./dataHelpers";

export const authorizeProject = internalQuery({
  args: { ownerId: v.string(), projectId: v.id("projects") },
  handler: (ctx, args) => requireOwnedProject(ctx, args.ownerId, args.projectId),
});

export const authorizeSlideshow = internalQuery({
  args: { ownerId: v.string(), slideshowId: v.id("slideshows") },
  handler: (ctx, args) => requireOwnedSlideshow(ctx, args.ownerId, args.slideshowId),
});

export const authorizeStorageIds = internalQuery({
  args: {
    ownerId: v.string(),
    projectId: v.id("projects"),
    slideshowId: v.id("slideshows"),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.storageIds.length > 100) throw new Error("Too many files");
    for (const storageId of args.storageIds) {
      const image = await ctx.db
        .query("images")
        .withIndex("by_ownerId_and_storageId", (q) => q.eq("ownerId", args.ownerId).eq("storageId", storageId))
        .unique();
      if (!image || image.kind !== "rendered" || image.projectId !== args.projectId || image.slideshowId !== args.slideshowId) {
        throw new Error("Unauthorized slide image");
      }
    }
    return true;
  },
});

export const generationContext = internalQuery({
  args: {
    ownerId: v.string(),
    projectId: v.id("projects"),
    imagePackIds: v.optional(v.array(v.id("imagePacks"))),
  },
  handler: async (ctx, args) => {
    const project = await requireOwnedProject(ctx, args.ownerId, args.projectId);
    const settings = await getSettings(ctx, args.ownerId);
    const packIds = args.imagePackIds ?? (
      await ctx.db
        .query("projectImagePacks")
        .withIndex("by_ownerId_and_projectId", (q) => q.eq("ownerId", args.ownerId).eq("projectId", args.projectId))
        .take(100)
    ).map((link) => link.imagePackId);
    for (const packId of packIds) await requireOwnedImagePack(ctx, args.ownerId, packId);
    const images = [];
    for (const packId of [...new Set(packIds)].slice(0, 100)) {
      const rows = await ctx.db
        .query("images")
        .withIndex("by_ownerId_and_imagePackId", (q) => q.eq("ownerId", args.ownerId).eq("imagePackId", packId))
        .take(100);
      images.push(...rows.map((row) => ({ _id: row._id, storageId: row.storageId })));
    }
    return { project, model: settings?.model ?? "openai/gpt-4o-mini", images: images.slice(0, 500) };
  },
});

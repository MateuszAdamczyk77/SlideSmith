import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireOwnerId } from "./authz";
import { imageKindValidator } from "./schema";
import { requireOwnedImagePack, requireOwnedProject, requireOwnedSlideshow } from "./dataHelpers";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => { await requireOwnerId(ctx); return await ctx.storage.generateUploadUrl(); },
});

export const register = mutation({
  args: { storageId: v.id("_storage"), imagePackId: v.optional(v.id("imagePacks")), projectId: v.optional(v.id("projects")), slideshowId: v.optional(v.id("slideshows")), kind: imageKindValidator, mimeType: v.string(), originalName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    if (args.imagePackId) await requireOwnedImagePack(ctx, ownerId, args.imagePackId);
    if (args.projectId) await requireOwnedProject(ctx, ownerId, args.projectId);
    if (args.slideshowId) {
      const slideshow = await requireOwnedSlideshow(ctx, ownerId, args.slideshowId);
      if (args.projectId && slideshow.projectId !== args.projectId) throw new Error("Image project does not match slideshow");
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) throw new Error("Uploaded file not found");
    if (!args.mimeType.startsWith("image/") || (metadata.contentType && !metadata.contentType.startsWith("image/"))) throw new Error("Only image uploads are allowed");
    const existing = await ctx.db.query("images").withIndex("by_ownerId_and_storageId", (q) => q.eq("ownerId", ownerId).eq("storageId", args.storageId)).unique();
    if (existing) return existing._id;
    if (args.imagePackId && args.originalName) {
      const packImages = await ctx.db.query("images").withIndex("by_ownerId_and_imagePackId", (q) => q.eq("ownerId", ownerId).eq("imagePackId", args.imagePackId)).take(500);
      const duplicate = packImages.find((image) => image.originalName === args.originalName);
      if (duplicate) {
        await ctx.storage.delete(args.storageId);
        return duplicate._id;
      }
    }
    return await ctx.db.insert("images", { ...args, ownerId, createdAt: new Date().toISOString() });
  },
});

export const getAuthorizedUrl = query({
  args: { imageId: v.id("images") },
  handler: async (ctx, args) => { const ownerId = await requireOwnerId(ctx); const image = await ctx.db.get("images", args.imageId); if (!image || image.ownerId !== ownerId) throw new Error("Image not found"); return await ctx.storage.getUrl(image.storageId); },
});

export const list = query({
  args: { imagePackId: v.optional(v.id("imagePacks")) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    if (args.imagePackId) await requireOwnedImagePack(ctx, ownerId, args.imagePackId);
    const rows = args.imagePackId
      ? await ctx.db.query("images").withIndex("by_ownerId_and_imagePackId", (q) => q.eq("ownerId", ownerId).eq("imagePackId", args.imagePackId)).take(500)
      : await ctx.db.query("images").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(500);
    return await Promise.all(rows.map(async (image) => { const pack = image.imagePackId ? await ctx.db.get("imagePacks", image.imagePackId) : null; return { id: image._id, storageId: image.storageId, url: await ctx.storage.getUrl(image.storageId), pack: pack?.name ?? "", packId: image.imagePackId ?? null, source: pack?.source ?? "uploaded" as const }; }));
  },
});

export const remove = mutation({
  args: { imageId: v.id("images") },
  handler: async (ctx, args) => { const ownerId = await requireOwnerId(ctx); const image = await ctx.db.get("images", args.imageId); if (!image || image.ownerId !== ownerId) throw new Error("Image not found"); await ctx.storage.delete(image.storageId); await ctx.db.delete("images", image._id); return null; },
});

export const cleanupTemporary = internalMutation({
  args: { ownerId: v.string(), storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    if (args.storageIds.length > 100) throw new Error("Too many files");
    for (const storageId of args.storageIds) {
      const image = await ctx.db.query("images").withIndex("by_ownerId_and_storageId", (q) => q.eq("ownerId", args.ownerId).eq("storageId", storageId)).unique();
      if (!image || image.kind !== "rendered") continue;
      await ctx.storage.delete(storageId);
      await ctx.db.delete("images", image._id);
    }
    return null;
  },
});

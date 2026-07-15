import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnerId } from "./authz";
import { requireOwnedImagePack } from "./dataHelpers";

const slugify = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwnerId(ctx);
    const packs = await ctx.db.query("imagePacks").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(100);
    return await Promise.all(packs.map(async (pack) => {
      const images = await ctx.db.query("images").withIndex("by_ownerId_and_imagePackId", (q) => q.eq("ownerId", ownerId).eq("imagePackId", pack._id)).take(101);
      const covers = await Promise.all(images.slice(0, 4).map((image) => ctx.storage.getUrl(image.storageId)));
      return { id: pack._id, name: pack.name, slug: pack.slug, description: pack.description ?? "", source: pack.source, count: Math.min(images.length, 100), covers: covers.filter((url): url is string => url !== null) };
    }));
  },
});

export const create = mutation({
  args: { name: v.string(), slug: v.optional(v.string()), description: v.optional(v.string()), source: v.optional(v.union(v.literal("uploaded"), v.literal("bundled"))) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    const name = args.name.trim();
    const slug = slugify(args.slug || name);
    if (!name || !slug) throw new Error("Pack name is required");
    const duplicate = await ctx.db.query("imagePacks").withIndex("by_ownerId_and_slug", (q) => q.eq("ownerId", ownerId).eq("slug", slug)).unique();
    if (duplicate) return duplicate._id;
    const imagePackId = await ctx.db.insert("imagePacks", { ownerId, name, slug, description: args.description, source: args.source ?? "uploaded" });
    const projects = await ctx.db.query("projects").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(100);
    for (const project of projects) {
      await ctx.db.insert("projectImagePacks", { ownerId, projectId: project._id, imagePackId });
    }
    return imagePackId;
  },
});

export const update = mutation({
  args: { imagePackId: v.id("imagePacks"), name: v.optional(v.string()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    const pack = await requireOwnedImagePack(ctx, ownerId, args.imagePackId);
    await ctx.db.patch("imagePacks", pack._id, { ...(args.name !== undefined ? { name: args.name.trim() || pack.name } : {}), ...(args.description !== undefined ? { description: args.description } : {}) });
    return null;
  },
});

export const remove = mutation({
  args: { imagePackId: v.id("imagePacks") },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    await requireOwnedImagePack(ctx, ownerId, args.imagePackId);
    const [images, links] = await Promise.all([
      ctx.db.query("images").withIndex("by_ownerId_and_imagePackId", (q) => q.eq("ownerId", ownerId).eq("imagePackId", args.imagePackId)).take(201),
      ctx.db.query("projectImagePacks").withIndex("by_ownerId_and_imagePackId", (q) => q.eq("ownerId", ownerId).eq("imagePackId", args.imagePackId)).take(201),
    ]);
    if (images.length > 200 || links.length > 200) throw new Error("Pack is too large to delete in one operation");
    for (const image of images) { await ctx.storage.delete(image.storageId); await ctx.db.delete("images", image._id); }
    for (const link of links) await ctx.db.delete("projectImagePacks", link._id);
    await ctx.db.delete("imagePacks", args.imagePackId);
    return null;
  },
});

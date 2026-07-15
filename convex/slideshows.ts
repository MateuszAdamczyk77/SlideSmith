import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwnerId } from "./authz";
import { getActiveOwnedProject, requireOwnedProject, requireOwnedSlideshow } from "./dataHelpers";

export const slideInputValidator = v.object({
  externalId: v.string(),
  position: v.number(),
  text: v.string(),
  imageId: v.optional(v.id("images")),
  bgFrom: v.optional(v.string()),
  bgTo: v.optional(v.string()),
});

const generatedSlideshowValidator = v.object({
  hook: v.string(),
  caption: v.string(),
  hashtags: v.array(v.string()),
  rationale: v.string(),
  createdAt: v.string(),
  slides: v.array(slideInputValidator),
});

async function queueForOwner(ctx: QueryCtx | MutationCtx, ownerId: string) {
  const project = await getActiveOwnedProject(ctx, ownerId);
  const shows = await ctx.db
    .query("slideshows")
    .withIndex("by_ownerId_and_projectId_and_status", (q) => q.eq("ownerId", ownerId).eq("projectId", project._id).eq("status", "queue"))
    .order("desc")
    .take(200);
  return await Promise.all(shows.map(async (show) => {
    const slides = await ctx.db.query("slides").withIndex("by_ownerId_and_slideshowId", (q) => q.eq("ownerId", ownerId).eq("slideshowId", show._id)).take(100);
    const mapped = await Promise.all(slides.sort((a, b) => a.position - b.position).map(async (slide) => {
      const image = slide.imageId ? await ctx.db.get("images", slide.imageId) : null;
      return { id: slide.externalId, text: slide.text, ...(image && image.ownerId === ownerId ? { imageId: image._id, imageUrl: (await ctx.storage.getUrl(image.storageId)) ?? undefined } : {}), ...(slide.bgFrom ? { bgFrom: slide.bgFrom } : {}), ...(slide.bgTo ? { bgTo: slide.bgTo } : {}) };
    }));
    return { id: show._id, hook: show.hook, caption: show.caption, hashtags: show.hashtags, slides: mapped, createdAt: show.createdAt, rationale: show.rationale };
  }));
}

export const listQueue = query({
  args: {},
  handler: async (ctx) => queueForOwner(ctx, await requireOwnerId(ctx)),
});

export const update = mutation({
  args: { slideshowId: v.id("slideshows"), hook: v.optional(v.string()), caption: v.optional(v.string()), hashtags: v.optional(v.array(v.string())), slides: v.optional(v.array(slideInputValidator)) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    const show = await requireOwnedSlideshow(ctx, ownerId, args.slideshowId);
    await ctx.db.patch("slideshows", show._id, { ...(args.hook !== undefined ? { hook: args.hook } : {}), ...(args.caption !== undefined ? { caption: args.caption } : {}), ...(args.hashtags !== undefined ? { hashtags: args.hashtags } : {}) });
    if (args.slides !== undefined) {
      if (args.slides.length > 100) throw new Error("A slideshow may contain at most 100 slides");
      const old = await ctx.db.query("slides").withIndex("by_ownerId_and_slideshowId", (q) => q.eq("ownerId", ownerId).eq("slideshowId", show._id)).take(101);
      if (old.length > 100) throw new Error("Slideshow is too large to edit");
      for (const slide of old) await ctx.db.delete("slides", slide._id);
      for (const slide of args.slides) {
        if (slide.imageId) { const image = await ctx.db.get("images", slide.imageId); if (!image || image.ownerId !== ownerId) throw new Error("Image not found"); }
        await ctx.db.insert("slides", { ...slide, ownerId, projectId: show.projectId, slideshowId: show._id });
      }
    }
    return await queueForOwner(ctx, ownerId);
  },
});

async function deleteShow(ctx: MutationCtx, ownerId: string, slideshowId: Id<"slideshows">) {
  const show = await requireOwnedSlideshow(ctx, ownerId, slideshowId);
  const slides = await ctx.db.query("slides").withIndex("by_ownerId_and_slideshowId", (q) => q.eq("ownerId", ownerId).eq("slideshowId", show._id)).take(101);
  if (slides.length > 100) throw new Error("Slideshow is too large to delete");
  for (const slide of slides) await ctx.db.delete("slides", slide._id);
  await ctx.db.delete("slideshows", show._id);
}

export const remove = mutation({
  args: { slideshowId: v.id("slideshows") },
  handler: async (ctx, args) => { const ownerId = await requireOwnerId(ctx); await deleteShow(ctx, ownerId, args.slideshowId); return await queueForOwner(ctx, ownerId); },
});

export const createGeneratedBatch = internalMutation({
  args: { ownerId: v.string(), projectId: v.id("projects"), slideshows: v.array(generatedSlideshowValidator) },
  handler: async (ctx, args) => {
    await requireOwnedProject(ctx, args.ownerId, args.projectId);
    if (args.slideshows.length > 100) throw new Error("At most 100 slideshows can be generated at once");
    const ids: Id<"slideshows">[] = [];
    for (const show of args.slideshows) {
      if (show.slides.length > 100) throw new Error("A slideshow may contain at most 100 slides");
      const slideshowId = await ctx.db.insert("slideshows", { ownerId: args.ownerId, projectId: args.projectId, hook: show.hook, caption: show.caption, hashtags: show.hashtags, rationale: show.rationale, createdAt: show.createdAt, status: "queue" });
      ids.push(slideshowId);
      for (const slide of show.slides) {
        if (slide.imageId) { const image = await ctx.db.get("images", slide.imageId); if (!image || image.ownerId !== args.ownerId) throw new Error("Image not found"); }
        await ctx.db.insert("slides", { ...slide, ownerId: args.ownerId, projectId: args.projectId, slideshowId });
      }
    }
    return ids;
  },
});

export const removeAfterSchedule = internalMutation({
  args: { ownerId: v.string(), projectId: v.id("projects"), slideshowId: v.id("slideshows") },
  handler: async (ctx, args) => { const show = await requireOwnedSlideshow(ctx, args.ownerId, args.slideshowId); if (show.projectId !== args.projectId) throw new Error("Slideshow project mismatch"); await deleteShow(ctx, args.ownerId, args.slideshowId); return null; },
});

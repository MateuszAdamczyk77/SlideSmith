import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOwnerId } from "./authz";
import {
  DEFAULT_BRAIN,
  DEFAULT_DEFAULTS,
  getConfigData,
  getSettings,
  requireOwnedProject,
} from "./dataHelpers";
import { brainValidator, defaultsValidator } from "./schema";

const projectPatch = {
  projectId: v.id("projects"),
  name: v.optional(v.string()),
  brain: v.optional(brainValidator),
  defaults: v.optional(defaultsValidator),
  imagePacks: v.optional(v.array(v.string())),
};

async function createProject(ctx: MutationCtx, ownerId: string, name: string) {
  const now = new Date().toISOString();
  const projectId = await ctx.db.insert("projects", {
    ownerId,
    name,
    brain: DEFAULT_BRAIN,
    defaults: DEFAULT_DEFAULTS,
    createdAt: now,
    updatedAt: now,
  });
  const packs = await ctx.db
    .query("imagePacks")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .take(100);
  for (const pack of packs) {
    await ctx.db.insert("projectImagePacks", { ownerId, projectId, imagePackId: pack._id });
  }
  return projectId;
}

export const ensureDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwnerId(ctx);
    let project = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .first();
    if (project === null) {
      const projectId = await createProject(ctx, ownerId, "Project 1");
      project = await ctx.db.get("projects", projectId);
    }
    const settings = await getSettings(ctx, ownerId);
    if (settings === null) {
      await ctx.db.insert("settings", {
        ownerId,
        model: "openai/gpt-4o-mini",
        activeProjectId: project!._id,
      });
    } else if (!settings.activeProjectId) {
      await ctx.db.patch("settings", settings._id, { activeProjectId: project!._id });
    }
    return await getConfigData(ctx, ownerId);
  },
});

export const create = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(100);
    const projectId = await createProject(
      ctx,
      ownerId,
      args.name?.trim() || `Project ${existing.length + 1}`,
    );
    const settings = await getSettings(ctx, ownerId);
    if (settings) await ctx.db.patch("settings", settings._id, { activeProjectId: projectId });
    else await ctx.db.insert("settings", { ownerId, model: "openai/gpt-4o-mini", activeProjectId: projectId });
    return await getConfigData(ctx, ownerId);
  },
});

export const update = mutation({
  args: projectPatch,
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    const project = await requireOwnedProject(ctx, ownerId, args.projectId);
    await ctx.db.patch("projects", project._id, {
      ...(args.name !== undefined ? { name: args.name.trim() || project.name } : {}),
      ...(args.brain !== undefined ? { brain: args.brain } : {}),
      ...(args.defaults !== undefined ? { defaults: args.defaults } : {}),
      updatedAt: new Date().toISOString(),
    });
    if (args.imagePacks !== undefined) {
      const links = await ctx.db
        .query("projectImagePacks")
        .withIndex("by_ownerId_and_projectId", (q) =>
          q.eq("ownerId", ownerId).eq("projectId", args.projectId),
        )
        .take(100);
      for (const link of links) await ctx.db.delete("projectImagePacks", link._id);
      const uniqueNames = [...new Set(args.imagePacks)].slice(0, 100);
      for (const name of uniqueNames) {
        const candidates = await ctx.db
          .query("imagePacks")
          .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
          .take(100);
        const pack = candidates.find((candidate) => candidate.name === name);
        if (pack) {
          await ctx.db.insert("projectImagePacks", {
            ownerId,
            projectId: args.projectId,
            imagePackId: pack._id,
          });
        }
      }
    }
    return await getConfigData(ctx, ownerId);
  },
});

export const activate = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    const settings = await getSettings(ctx, ownerId);
    if (settings) await ctx.db.patch("settings", settings._id, { activeProjectId: args.projectId });
    else await ctx.db.insert("settings", { ownerId, model: "openai/gpt-4o-mini", activeProjectId: args.projectId });
    return await getConfigData(ctx, ownerId);
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    await requireOwnedProject(ctx, ownerId, args.projectId);
    const [links, slideshows, slides, images] = await Promise.all([
      ctx.db.query("projectImagePacks").withIndex("by_ownerId_and_projectId", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId)).take(200),
      ctx.db.query("slideshows").withIndex("by_ownerId_and_projectId", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId)).take(200),
      ctx.db.query("slides").withIndex("by_ownerId_and_projectId", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId)).take(500),
      ctx.db.query("images").withIndex("by_ownerId_and_projectId", (q) => q.eq("ownerId", ownerId).eq("projectId", args.projectId)).take(200),
    ]);
    if (links.length === 200 || slideshows.length === 200 || slides.length === 500 || images.length === 200) {
      throw new Error("Project is too large to delete in one operation; remove its media first.");
    }
    for (const slide of slides) await ctx.db.delete("slides", slide._id);
    for (const show of slideshows) await ctx.db.delete("slideshows", show._id);
    for (const image of images) {
      await ctx.storage.delete(image.storageId);
      await ctx.db.delete("images", image._id);
    }
    for (const link of links) await ctx.db.delete("projectImagePacks", link._id);
    await ctx.db.delete("projects", args.projectId);
    let remaining = await ctx.db.query("projects").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).first();
    if (remaining === null) {
      const projectId = await createProject(ctx, ownerId, "Project 1");
      remaining = await ctx.db.get("projects", projectId);
    }
    const settings = await getSettings(ctx, ownerId);
    if (settings) await ctx.db.patch("settings", settings._id, { activeProjectId: remaining!._id });
    return await getConfigData(ctx, ownerId);
  },
});

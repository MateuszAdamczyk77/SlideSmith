import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwnerId } from "./authz";
import { brainValidator, defaultsValidator } from "./schema";
import { slideInputValidator } from "./slideshows";
import { getSettings } from "./dataHelpers";

const legacyProjectValidator = v.object({ legacyId: v.string(), name: v.string(), brain: brainValidator, defaults: defaultsValidator, imagePacks: v.array(v.string()) });
const legacyShowValidator = v.object({ legacyId: v.string(), projectLegacyId: v.string(), hook: v.string(), caption: v.string(), hashtags: v.array(v.string()), createdAt: v.string(), rationale: v.string(), slides: v.array(slideInputValidator) });

export const importLegacyData = mutation({
  args: { model: v.optional(v.string()), activeProjectLegacyId: v.optional(v.string()), projects: v.array(legacyProjectValidator), slideshows: v.array(legacyShowValidator) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwnerId(ctx);
    if (args.projects.length > 100 || args.slideshows.length > 200) throw new Error("Legacy import batch is too large");
    const projectIds = new Map<string, Id<"projects">>();
    let projectsImported = 0;
    let slideshowsImported = 0;
    for (const input of args.projects) {
      let project = await ctx.db.query("projects").withIndex("by_ownerId_and_legacyId", (q) => q.eq("ownerId", ownerId).eq("legacyId", input.legacyId)).unique();
      if (!project) {
        const now = new Date().toISOString();
        const id = await ctx.db.insert("projects", { ownerId, legacyId: input.legacyId, name: input.name, brain: input.brain, defaults: input.defaults, createdAt: now, updatedAt: now });
        project = await ctx.db.get("projects", id);
        projectsImported++;
      }
      projectIds.set(input.legacyId, project!._id);
    }
    for (const input of args.slideshows) {
      const projectId = projectIds.get(input.projectLegacyId);
      if (!projectId) throw new Error(`Unknown legacy project: ${input.projectLegacyId}`);
      const existing = await ctx.db.query("slideshows").withIndex("by_ownerId_and_projectId_and_legacyId", (q) => q.eq("ownerId", ownerId).eq("projectId", projectId).eq("legacyId", input.legacyId)).unique();
      if (existing) continue;
      if (input.slides.length > 100) throw new Error("A slideshow may contain at most 100 slides");
      const slideshowId = await ctx.db.insert("slideshows", { ownerId, projectId, legacyId: input.legacyId, hook: input.hook, caption: input.caption, hashtags: input.hashtags, createdAt: input.createdAt, rationale: input.rationale, status: "queue" });
      for (const slide of input.slides) await ctx.db.insert("slides", { ...slide, ownerId, projectId, slideshowId });
      slideshowsImported++;
    }
    const activeProjectId = args.activeProjectLegacyId ? projectIds.get(args.activeProjectLegacyId) : projectIds.values().next().value;
    const settings = await getSettings(ctx, ownerId);
    const model = args.model?.trim() || settings?.model || "openai/gpt-4o-mini";
    if (settings) await ctx.db.patch("settings", settings._id, { model, ...(activeProjectId ? { activeProjectId } : {}) });
    else await ctx.db.insert("settings", { ownerId, model, ...(activeProjectId ? { activeProjectId } : {}) });
    return { projectsImported, slideshowsImported };
  },
});

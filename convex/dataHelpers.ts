import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { env } from "./_generated/server";

export const DEFAULT_BRAIN = {
  niche: "",
  appName: "",
  appDescription: "",
  audience: "",
  styleMemory: "",
};

export const DEFAULT_DEFAULTS = {
  socialAccountIds: [] as number[],
  mode: "draft" as const,
};

type ReadCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function requireOwnedProject(
  ctx: ReadCtx,
  ownerId: string,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (project === null || project.ownerId !== ownerId) throw new Error("Project not found");
  return project;
}

export async function requireOwnedSlideshow(
  ctx: ReadCtx,
  ownerId: string,
  slideshowId: Id<"slideshows">,
): Promise<Doc<"slideshows">> {
  const slideshow = await ctx.db.get("slideshows", slideshowId);
  if (slideshow === null || slideshow.ownerId !== ownerId) throw new Error("Slideshow not found");
  return slideshow;
}

export async function requireOwnedImagePack(
  ctx: ReadCtx,
  ownerId: string,
  imagePackId: Id<"imagePacks">,
): Promise<Doc<"imagePacks">> {
  const pack = await ctx.db.get("imagePacks", imagePackId);
  if (pack === null || pack.ownerId !== ownerId) throw new Error("Image pack not found");
  return pack;
}

export async function getSettings(ctx: ReadCtx, ownerId: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .unique();
}

export async function getConfigData(ctx: ReadCtx, ownerId: string) {
  const [settings, projects] = await Promise.all([
    getSettings(ctx, ownerId),
    ctx.db.query("projects").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(100),
  ]);
  const mappedProjects = await Promise.all(
    projects.map(async (project) => {
      const links = await ctx.db
        .query("projectImagePacks")
        .withIndex("by_ownerId_and_projectId", (q) =>
          q.eq("ownerId", ownerId).eq("projectId", project._id),
        )
        .take(100);
      const packs = await Promise.all(links.map((link) => ctx.db.get("imagePacks", link.imagePackId)));
      return {
        id: project._id,
        name: project.name,
        brain: project.brain,
        defaults: project.defaults,
        imagePacks: packs
          .filter((pack): pack is Doc<"imagePacks"> => pack !== null && pack.ownerId === ownerId)
          .map((pack) => pack.name),
      };
    }),
  );
  const activeProjectId =
    settings?.activeProjectId && projects.some((project) => project._id === settings.activeProjectId)
      ? settings.activeProjectId
      : projects[0]?._id ?? null;
  return {
    keys: {
      postbridge: env.POST_BRIDGE_ENABLED === "true" && Boolean(env.POST_BRIDGE_API_KEY),
      openrouter: Boolean(env.OPENROUTER_API_KEY),
    },
    model: settings?.model ?? env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
    projects: mappedProjects,
    activeProjectId,
  };
}

export async function findActiveOwnedProject(ctx: ReadCtx, ownerId: string) {
  const settings = await getSettings(ctx, ownerId);
  if (settings?.activeProjectId) return await requireOwnedProject(ctx, ownerId, settings.activeProjectId);
  return await ctx.db
    .query("projects")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .first();
}

export async function getActiveOwnedProject(ctx: ReadCtx, ownerId: string) {
  const project = await findActiveOwnedProject(ctx, ownerId);
  if (project === null) throw new Error("Create a project first");
  return project;
}

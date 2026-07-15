import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const brainValidator = v.object({
  niche: v.string(),
  appName: v.string(),
  appDescription: v.string(),
  audience: v.string(),
  styleMemory: v.string(),
});

export const defaultsValidator = v.object({
  socialAccountIds: v.array(v.number()),
  mode: v.union(v.literal("draft"), v.literal("schedule")),
});

export const imageKindValidator = v.union(
  v.literal("library"),
  v.literal("rendered"),
  v.literal("generated"),
);

export const slideshowStatusValidator = v.union(
  v.literal("queue"),
  v.literal("draft"),
  v.literal("scheduled"),
);

export default defineSchema({
  ...authTables,

  settings: defineTable({
    ownerId: v.string(),
    model: v.string(),
    activeProjectId: v.optional(v.id("projects")),
  }).index("by_ownerId", ["ownerId"]),

  projects: defineTable({
    ownerId: v.string(),
    legacyId: v.optional(v.string()),
    name: v.string(),
    brain: brainValidator,
    defaults: defaultsValidator,
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_legacyId", ["ownerId", "legacyId"]),

  imagePacks: defineTable({
    ownerId: v.string(),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    source: v.union(v.literal("uploaded"), v.literal("bundled")),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_slug", ["ownerId", "slug"]),

  projectImagePacks: defineTable({
    ownerId: v.string(),
    projectId: v.id("projects"),
    imagePackId: v.id("imagePacks"),
  })
    .index("by_ownerId_and_projectId", ["ownerId", "projectId"])
    .index("by_ownerId_and_projectId_and_imagePackId", [
      "ownerId",
      "projectId",
      "imagePackId",
    ])
    .index("by_ownerId_and_imagePackId", ["ownerId", "imagePackId"]),

  images: defineTable({
    ownerId: v.string(),
    projectId: v.optional(v.id("projects")),
    imagePackId: v.optional(v.id("imagePacks")),
    slideshowId: v.optional(v.id("slideshows")),
    storageId: v.id("_storage"),
    kind: imageKindValidator,
    mimeType: v.string(),
    originalName: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_projectId", ["ownerId", "projectId"])
    .index("by_ownerId_and_imagePackId", ["ownerId", "imagePackId"])
    .index("by_ownerId_and_slideshowId", ["ownerId", "slideshowId"])
    .index("by_ownerId_and_storageId", ["ownerId", "storageId"]),

  slideshows: defineTable({
    ownerId: v.string(),
    projectId: v.id("projects"),
    legacyId: v.optional(v.string()),
    hook: v.string(),
    caption: v.string(),
    hashtags: v.array(v.string()),
    createdAt: v.string(),
    rationale: v.string(),
    status: slideshowStatusValidator,
  })
    .index("by_ownerId_and_projectId", ["ownerId", "projectId"])
    .index("by_ownerId_and_projectId_and_status", ["ownerId", "projectId", "status"])
    .index("by_ownerId_and_projectId_and_legacyId", ["ownerId", "projectId", "legacyId"]),

  slides: defineTable({
    ownerId: v.string(),
    projectId: v.id("projects"),
    slideshowId: v.id("slideshows"),
    externalId: v.string(),
    position: v.number(),
    text: v.string(),
    imageId: v.optional(v.id("images")),
    bgFrom: v.optional(v.string()),
    bgTo: v.optional(v.string()),
  })
    .index("by_ownerId_and_slideshowId", ["ownerId", "slideshowId"])
    .index("by_ownerId_and_projectId", ["ownerId", "projectId"]),
});

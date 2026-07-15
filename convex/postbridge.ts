import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, env } from "./_generated/server";
import { requireActionOwnerId } from "./authz";

const BASE_URL = "https://api.post-bridge.com";
const MIN_GAP_MS = 350;
const MAX_ATTEMPTS = 5;

type JsonObject = Record<string, unknown>;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function apiKey(): string {
  if (env.POST_BRIDGE_ENABLED !== "true") {
    throw new Error("post-bridge support is currently disabled.");
  }
  const key = env.POST_BRIDGE_API_KEY;
  if (!key) throw new Error("POST_BRIDGE_API_KEY is not configured.");
  return key;
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const candidate = (body as { message?: unknown; error?: unknown }).message ??
      (body as { error?: unknown }).error;
    if (Array.isArray(candidate)) return candidate.map(String).join("; ");
    if (candidate !== undefined) return String(candidate);
  }
  return typeof body === "string" && body ? body : fallback;
}

async function postBridge(path: string, init: RequestInit = {}): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // A textual error body is still useful below.
    }

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 600 * 2 ** (attempt - 1));
      continue;
    }
    if (!response.ok) {
      throw new Error(`post-bridge ${response.status}: ${errorMessage(body, response.statusText)}`);
    }
    return body;
  }
  throw new Error("post-bridge request exhausted its retry budget.");
}

async function listAccountsImpl(): Promise<unknown[]> {
  const body = (await postBridge("/v1/social-accounts?limit=100")) as { data?: unknown[] };
  return body?.data ?? [];
}

async function listAnalyticsImpl(): Promise<unknown[]> {
  const body = (await postBridge("/v1/analytics?limit=100")) as { data?: unknown[] };
  return body?.data ?? [];
}

async function listPostsImpl(): Promise<JsonObject[]> {
  const body = (await postBridge("/v1/posts?limit=100")) as { data?: unknown[] };
  const posts = (body?.data ?? []).filter(
    (post): post is JsonObject => !!post && typeof post === "object" && !Array.isArray(post),
  );
  const postIds = posts.map((post) => post.id).filter((id): id is string => typeof id === "string");
  const mediaUrlsById: Record<string, string> = {};
  if (postIds.length) {
    try {
      const query = postIds.map((id) => `post_id=${encodeURIComponent(id)}`).join("&");
      const mediaBody = (await postBridge(`/v1/media?limit=200&${query}`)) as { data?: unknown[] };
      for (const value of mediaBody?.data ?? []) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const media = value as { id?: unknown; object?: { url?: unknown } };
        if (typeof media.id === "string" && typeof media.object?.url === "string") {
          mediaUrlsById[media.id] = media.object.url;
        }
      }
    } catch {
      // Thumbnails are best-effort and should not block the posts list.
    }
  }
  return posts.map((post) => {
    const media = Array.isArray(post.media) ? post.media : [];
    const mediaUrls = media
      .map((value) => {
        if (typeof value === "string") return mediaUrlsById[value] ?? "";
        if (!value || typeof value !== "object" || Array.isArray(value)) return "";
        const item = value as { id?: unknown; url?: unknown; object?: { url?: unknown } };
        if (typeof item.object?.url === "string") return item.object.url;
        if (typeof item.url === "string") return item.url;
        return typeof item.id === "string" ? mediaUrlsById[item.id] ?? "" : "";
      })
      .filter(Boolean);
    return { ...post, media_urls: mediaUrls };
  });
}

async function uploadMedia(blob: Blob, name: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const created = (await postBridge("/v1/media/create-upload-url", {
        method: "POST",
        body: JSON.stringify({ mime_type: "image/png", size_bytes: blob.size, name }),
      })) as { upload_url?: unknown; media_id?: unknown };
      if (typeof created.upload_url !== "string" || typeof created.media_id !== "string") {
        throw new Error("post-bridge returned invalid upload metadata.");
      }
      const upload = await fetch(created.upload_url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: blob,
      });
      if (!upload.ok) throw new Error(`Media upload failed (${upload.status}) for ${name}`);
      return created.media_id;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(400 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Media upload failed.");
}

export const test = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireActionOwnerId(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId,
      projectId: args.projectId,
    });
    await listAccountsImpl();
    return true;
  },
});

export const listAccounts = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireActionOwnerId(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId,
      projectId: args.projectId,
    });
    return await listAccountsImpl();
  },
});

export const listPosts = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireActionOwnerId(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId,
      projectId: args.projectId,
    });
    return await listPostsImpl();
  },
});

export const listAnalytics = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireActionOwnerId(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId,
      projectId: args.projectId,
    });
    return await listAnalyticsImpl();
  },
});

export const syncAnalytics = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ownerId = await requireActionOwnerId(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId,
      projectId: args.projectId,
    });
    try {
      await postBridge("/v1/analytics/sync", { method: "POST" });
    } catch (error) {
      // Keep the legacy behavior: a rate-limited sync still returns cached data.
      if (!(error instanceof Error) || !error.message.includes(" 429:")) throw error;
    }
    return await listAnalyticsImpl();
  },
});

export const schedule = action({
  args: {
    projectId: v.id("projects"),
    slideshowId: v.id("slideshows"),
    caption: v.string(),
    storageIds: v.array(v.id("_storage")),
    socialAccounts: v.array(v.number()),
    scheduledAt: v.union(v.string(), v.null()),
    mode: v.union(v.literal("draft"), v.literal("schedule")),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireActionOwnerId(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId,
      projectId: args.projectId,
    });
    const slideshow: Doc<"slideshows"> = await ctx.runQuery(internal.access.authorizeSlideshow, {
      ownerId,
      slideshowId: args.slideshowId,
    });
    if (slideshow.projectId !== args.projectId) throw new Error("Unauthorized");
    await ctx.runQuery(internal.access.authorizeStorageIds, {
      ownerId,
      projectId: args.projectId,
      slideshowId: args.slideshowId,
      storageIds: args.storageIds,
    });
    try {
      if (args.socialAccounts.length === 0) throw new Error("Pick at least one social account.");
      if (args.storageIds.length === 0) throw new Error("No slide images to upload.");
      if (args.storageIds.length > 100) throw new Error("A slideshow cannot contain more than 100 slides.");
      const blobs = await Promise.all(
        args.storageIds.map(async (storageId) => {
          const blob = await ctx.storage.get(storageId);
          if (!blob) throw new Error("A temporary slide image no longer exists.");
          if (blob.type && blob.type !== "image/png") {
            throw new Error(`Expected image/png, received ${blob.type}.`);
          }
          const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
          const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
          if (pngSignature.some((byte, index) => signature[index] !== byte)) {
            throw new Error("A temporary slide file is not a valid PNG.");
          }
          return blob;
        }),
      );

      const mediaIds: string[] = [];
      for (let index = 0; index < blobs.length; index += 1) {
        if (index > 0) await sleep(MIN_GAP_MS);
        mediaIds.push(await uploadMedia(blobs[index], `${args.slideshowId}-${index + 1}.png`));
      }

      const post = await postBridge("/v1/posts", {
        method: "POST",
        body: JSON.stringify({
          caption: args.caption,
          media: mediaIds,
          social_accounts: args.socialAccounts,
          scheduled_at: args.mode === "schedule" ? args.scheduledAt : null,
          is_draft: args.mode !== "schedule",
        }),
      });
      await ctx.runMutation(internal.slideshows.removeAfterSchedule, {
        ownerId,
        projectId: args.projectId,
        slideshowId: args.slideshowId,
      });
      return post;
    } finally {
      await ctx.runMutation(internal.images.cleanupTemporary, { ownerId, storageIds: args.storageIds });
    }
  },
});

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env } from "./_generated/server";
import { requireAllowedIdentity } from "./authz";

const BASE_URL = "https://openrouter.ai/api/v1";
const ATTRIBUTION_HEADERS = {
  "HTTP-Referer": "https://github.com/slidesmith",
  "X-Title": "Slidesmith",
};
const BATCH_SIZE = 6;
const PALETTE = [
  ["#0f172a", "#1e293b"],
  ["#1a1a2e", "#16213e"],
  ["#2d1b1b", "#1a1010"],
  ["#0a1f1c", "#0f2922"],
  ["#1f1147", "#160d33"],
  ["#26120a", "#1a0c06"],
] as const;

type Brain = {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  styleMemory: string;
};

type GeneratedSlide = {
  externalId: string;
  position: number;
  text: string;
  bgFrom: string;
  bgTo: string;
  imageId?: Id<"images">;
};

type GeneratedSlideshow = {
  hook: string;
  caption: string;
  hashtags: string[];
  rationale: string;
  createdAt: string;
  slides: GeneratedSlide[];
};

type ModelSlideshow = {
  hook?: unknown;
  caption?: unknown;
  hashtags?: unknown;
  rationale?: unknown;
  slides?: unknown;
};

function openRouterKey(): string {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured.");
  return key;
}

function buildPrompt(brain: Brain, count: number): string {
  return `You write short-form social media carousel slideshows (TikTok/Instagram).

Account context:
- Niche: ${brain.niche || "(unspecified)"}
- App / brand: ${brain.appName || "(unspecified)"} — ${brain.appDescription || ""}
- Audience: ${brain.audience || "(unspecified)"}

What's working for this account (style memory — respect this closely):
${brain.styleMemory || "(none yet — use proven short-form patterns)"}

Write ${count} distinct slideshows. Respond with a JSON object of this exact shape:
{
  "slideshows": [
    {
      "hook": "the first slide — a scroll-stopping line, max ~8 words",
      "slides": ["the hook again as slide 1", "slide 2", "...5-6 lines total, each max ~8 words, last is a CTA like 'Save this'"],
      "caption": "the post caption with 1-2 emoji",
      "hashtags": ["three", "relevant", "hashtags"],
      "rationale": "one sentence on why this should perform, tied to the style memory"
    }
  ]
}

Keep them on-brand, varied, and genuinely good. Do not write generic filler. Return ONLY the JSON object.`;
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model returned an invalid JSON object.");
  }
  return parsed as Record<string, unknown>;
}

async function chatJson(model: string, prompt: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey()}`,
      "content-type": "application/json",
      ...ATTRIBUTION_HEADERS,
    },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : response.statusText;
    throw new Error(`OpenRouter ${response.status}: ${message}`);
  }
  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("OpenRouter returned no content.");
  return extractJson(content);
}

function cleanModelSlideshow(value: unknown): ModelSlideshow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ModelSlideshow;
}

export const listModels = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await requireAllowedIdentity(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId: identity.tokenIdentifier,
      projectId: args.projectId,
    });
    const response = await fetch(`${BASE_URL}/models`);
    if (!response.ok) throw new Error(`OpenRouter models ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: unknown; name?: unknown }> };
    return (body.data ?? [])
      .filter((model) => typeof model.id === "string")
      .map((model) => ({
        id: model.id as string,
        name: typeof model.name === "string" ? model.name : (model.id as string),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const test = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await requireAllowedIdentity(ctx);
    await ctx.runQuery(internal.access.authorizeProject, {
      ownerId: identity.tokenIdentifier,
      projectId: args.projectId,
    });
    const response = await fetch(`${BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${openRouterKey()}` },
    });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: invalid key`);
    return true;
  },
});

export const generate = action({
  args: {
    projectId: v.id("projects"),
    count: v.number(),
    model: v.optional(v.string()),
    imagePackIds: v.optional(v.array(v.id("imagePacks"))),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const identity = await requireAllowedIdentity(ctx);
    const context: {
      project: { brain: Brain };
      model: string | null;
      images: Array<{ _id: Id<"images">; storageId: Id<"_storage"> }>;
    } = await ctx.runQuery(internal.access.generationContext, {
      ownerId: identity.tokenIdentifier,
      projectId: args.projectId,
      imagePackIds: args.imagePackIds,
    });
    const count = Math.min(Math.max(Math.round(args.count || 4), 1), 100);
    const model = args.model?.trim() || context.model || env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    const raw: ModelSlideshow[] = [];
    let attempts = 0;
    while (raw.length < count && attempts < count + 5) {
      attempts += 1;
      const requested = Math.min(BATCH_SIZE, count - raw.length);
      const parsed = await chatJson(model, buildPrompt(context.project.brain, requested));
      const batch = Array.isArray(parsed.slideshows)
        ? parsed.slideshows.map(cleanModelSlideshow).filter((item): item is ModelSlideshow => item !== null)
        : [];
      if (batch.length === 0) break;
      raw.push(...batch);
    }

    const stamp = Date.now();
    const slideshows: GeneratedSlideshow[] = raw.slice(0, count).map((show, showIndex) => {
      const [bgFrom, bgTo] = PALETTE[showIndex % PALETTE.length];
      const slideTexts = Array.isArray(show.slides)
        ? show.slides.filter((text): text is string => typeof text === "string")
        : [];
      return {
        hook:
          typeof show.hook === "string"
            ? show.hook
            : slideTexts[0] ?? "",
        caption: typeof show.caption === "string" ? show.caption : "",
        hashtags: Array.isArray(show.hashtags)
          ? show.hashtags.filter((tag): tag is string => typeof tag === "string")
          : [],
        rationale: typeof show.rationale === "string" ? show.rationale : "",
        createdAt: new Date(stamp + showIndex).toISOString(),
        slides: slideTexts.map((text, position) => {
          const imageId = context.images.length
            ? context.images[(showIndex * slideTexts.length + position) % context.images.length]._id
            : undefined;
          return {
            externalId: `slide-${stamp}-${showIndex}-${position}`,
            position,
            text,
            bgFrom,
            bgTo,
            ...(imageId ? { imageId } : {}),
          };
        }),
      };
    });

    return await ctx.runMutation(internal.slideshows.createGeneratedBatch, {
      ownerId: identity.tokenIdentifier,
      projectId: args.projectId,
      slideshows,
    });
  },
});

import type { Id } from '../convex/_generated/dataModel';

export type ViewKey = 'queue' | 'library' | 'schedule' | 'results' | 'brain' | 'settings';

export interface Slide {
  id: string;
  imageId?: Id<'images'>;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
  bgFrom?: string;
  bgTo?: string;
}

export interface Slideshow {
  id: Id<'slideshows'>;
  hook: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  createdAt: string;
  rationale: string;
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  styleMemory: string;
}

export interface ProjectDefaults {
  socialAccountIds: number[];
  mode: 'draft' | 'schedule';
}

export interface Project {
  id: Id<'projects'>;
  name: string;
  brain: BrainState;
  defaults: ProjectDefaults;
  imagePacks: string[]; // background packs generation draws from ([] = gradients only)
}

export interface AppConfig {
  keys: { postbridge: boolean; openrouter: boolean };
  model: string;
  projects: Project[];
  activeProjectId: Id<'projects'> | null;
}

export interface LibraryImage {
  id: Id<'images'>;
  url: string | null;
  pack: string;
  packId?: Id<'imagePacks'>;
  source: 'uploaded' | 'bundled';
}

export interface LibraryPack {
  id: Id<'imagePacks'>;
  name: string;
  source: string;
  count: number;
  covers: string[];
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface SocialAccount {
  id: number;
  platform: string;
  username: string;
}

// Shapes returned by post-bridge (mapped in lib/api.ts).
export interface ScheduledPost {
  id: string;
  caption: string;
  status: string; // scheduled | processing | posted | draft
  scheduledAt: string | null;
  mediaUrls: string[];
  socialAccounts: number[];
  isDraft: boolean;
}

export interface PostResult {
  id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  coverImageUrl: string | null;
  shareUrl: string | null;
  description: string | null;
  lastSyncedAt: string | null;
}

import type { Id } from '../../convex/_generated/dataModel';
import type { PostResult, ScheduledPost, SocialAccount } from '../types';

// Convex queries/mutations/actions are invoked with the React hooks at the
// component boundary. This module only contains transport-free normalization
// and File Storage upload helpers; it never calls the retired Express API.

export async function uploadPng(
  blob: Blob,
  generateUploadUrl: () => Promise<string>,
): Promise<Id<'_storage'>> {
  if (blob.type !== 'image/png') throw new Error('Only rendered PNG slides can be uploaded.');
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  });
  if (!response.ok) throw new Error(`Slide upload failed (${response.status}).`);
  const body = await response.json() as { storageId?: Id<'_storage'> };
  if (!body.storageId) throw new Error('Convex File Storage did not return a storage ID.');
  return body.storageId;
}

export async function uploadFile(
  blob: Blob,
  generateUploadUrl: () => Promise<string>,
): Promise<Id<'_storage'>> {
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!response.ok) throw new Error(`File upload failed (${response.status}).`);
  const body = await response.json() as { storageId?: Id<'_storage'> };
  if (!body.storageId) throw new Error('Convex File Storage did not return a storage ID.');
  return body.storageId;
}

export function mapScheduledPosts(raw: Array<Record<string, unknown>>): ScheduledPost[] {
  return raw.map((post) => ({
    id: String(post.id),
    caption: String(post.caption || ''),
    status: String(post.status || (post.is_draft ? 'draft' : 'scheduled')),
    scheduledAt: (post.scheduled_at as string) || null,
    mediaUrls: Array.isArray(post.media_urls)
      ? post.media_urls.map(String).filter(Boolean)
      : Array.isArray(post.media)
        ? (post.media as Array<{ url?: string; object?: { url?: string } } | string>)
            .map((media) => typeof media === 'string' ? media : media.object?.url || media.url || '')
            .filter(Boolean)
        : [],
    socialAccounts: (post.social_accounts as number[]) || [],
    isDraft: Boolean(post.is_draft),
  }));
}

export function mapAccounts(raw: unknown[]): SocialAccount[] {
  return raw.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const account = value as Record<string, unknown>;
    const numericId = Number(account.id);
    if (!Number.isFinite(numericId)) return [];
    return [{
      id: numericId,
      platform: String(account.platform || account.provider || ''),
      username: String(account.username || account.name || account.handle || ''),
    }];
  });
}

export function mapResults(raw: Array<Record<string, unknown>>): PostResult[] {
  return raw.map((analytics) => ({
    id: String(analytics.id),
    platform: String(analytics.platform || ''),
    views: Number(analytics.view_count || 0),
    likes: Number(analytics.like_count || 0),
    comments: Number(analytics.comment_count || 0),
    shares: Number(analytics.share_count || 0),
    coverImageUrl: (analytics.cover_image_url as string) || null,
    shareUrl: (analytics.share_url as string) || null,
    description: (analytics.video_description as string) || null,
    lastSyncedAt: (analytics.last_synced_at as string) || null,
  }));
}

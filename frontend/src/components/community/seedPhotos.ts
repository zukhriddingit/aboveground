import type { CommunityPost } from "@/types/tverse";

/**
 * Seed posts at a station with a Pocket City diorama show a shot of that block (public/feed/).
 * The other seeds drop their generated clip-art and read as text posts. Rider posts are untouched.
 */
const SEED_FEED_PHOTOS: Record<string, string> = {
  "seed-1": "/feed/seed-1.jpg", // BU Central platform, a Green-B train in
  "seed-3": "/feed/seed-3.jpg", // the Harvard Pit and the Red Line headhouse
};

export function withSeedPhoto(post: CommunityPost): CommunityPost {
  if (!post.id.startsWith("seed-")) return post;
  const photo = SEED_FEED_PHOTOS[post.id];
  if (photo) return { ...post, imageUrl: photo };
  if (!post.imageUrl?.startsWith("data:image/svg")) return post;
  const textOnly = { ...post };
  delete textOnly.imageUrl;
  return textOnly;
}

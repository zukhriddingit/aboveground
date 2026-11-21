// Offline T-Feed: the same 8 posts backend/community.py seeds, used when the backend is down.
// Built lazily with the current time so "6m ago" stays true whenever the page loads.
import type { CommunityPost, CommunityReply, PostVibe, RiderBadge, StationId, TransitLine } from "@/types/tverse";
import { stopName } from "./feedStops";
import { sceneSvg, type SceneOptions } from "./sceneArt";

type ReplySeed = [author: string, badge: RiderBadge, text: string, replyTo: string | null, likes: number, minutesAgo: number];

interface PostSeed {
  n: number;
  line: TransitLine;
  branch?: string;
  stationId: StationId;
  vibe: PostVibe;
  author: string;
  badge: RiderBadge;
  color: string;
  caption: string;
  minutesAgo: number;
  reactions: [heart: number, train: number, dunkin: number, fire: number];
  replies: ReplySeed[];
  scene?: SceneOptions;
}

const SEEDS: PostSeed[] = [
  {
    n: 1, line: "Green", branch: "Green-B", stationId: "place-bucen", vibe: "ON_THE_T",
    author: "terrier_tess", badge: "BU", color: "#ef4444", minutesAgo: 6, reactions: [87, 14, 9, 33],
    caption: "A golden retriever just boarded the Green-B at BU Central wearing a tiny BU scarf. Better posture than everyone in this car and he's not even holding the rail 🐕",
    replies: [
      ["packard_pete", "Local", "he got off at Packard's Corner like he had a 9am", null, 12, 5],
      ["commave_cat", "BU", "the B line is so slow he could've walked faster and he KNOWS it", null, 8, 4],
      ["terrier_tess", "BU", "honestly he was more prepared for that 9am than me", "packard_pete", 5, 2],
    ],
    scene: { top: "#2a1b5e", bottom: "#e0607e", glow: "#ffb36b", track: "#38d283", seed: 1,
      emojis: [["🐕", 450, 560, 300], ["🧣", 520, 660, 110], ["🚋", 760, 820, 120]] },
  },
  {
    n: 2, line: "Green", stationId: "place-pktrm", vibe: "CROWD_CHECK",
    author: "parkst_survivor", badge: "Local", color: "#f59e0b", minutesAgo: 14, reactions: [31, 46, 3, 12],
    caption: "PSA: inbound Green at Park St is a sardine can rn. Let the first one go, there's an E right behind it with actual seats 🫠",
    replies: [
      ["northeastern_nat", "NEU", "can confirm, I am currently someone's armrest", null, 15, 12],
      ["tourist_tom", "Tourist", "is it always like this?? I thought it was a parade", null, 9, 10],
      ["parkst_survivor", "Local", "every weekday at 5:15. the parade is us", "tourist_tom", 21, 8],
    ],
  },
  {
    n: 3, line: "Red", stationId: "place-harsq", vibe: "STREET_VIBES",
    author: "pit_regular", badge: "Local", color: "#a855f7", minutesAgo: 23, reactions: [64, 7, 11, 52],
    caption: "Violin busker in the Harvard Pit just went from Vivaldi's Summer straight into Mr. Brightside. Let two Alewife trains go on purpose 🎻",
    replies: [
      ["visiting_vik", "Tourist", "visiting from Chicago and this is the most Boston thing I've seen. besides the Dunkin' line", null, 6, 20],
      ["mit_marcus", "MIT", "she played the Tetris theme last week, absolute legend", null, 11, 17],
    ],
    scene: { top: "#0b1442", bottom: "#3b1c6e", glow: "#c084fc", track: "#ff5948", seed: 3,
      emojis: [["🎻", 450, 540, 280], ["🎶", 250, 330, 120], ["🎵", 680, 300, 100]] },
  },
  {
    n: 4, line: "Orange", stationId: "place-chncl", vibe: "FOOD_SPOT",
    author: "dumplingdan", badge: "NEU", color: "#f97316", minutesAgo: 38, reactions: [72, 5, 2, 61],
    caption: "$8 for 12 pork & chive dumplings at 11:40pm. Take the Essex St exit, hang a left, follow the steam 🥟",
    replies: [
      ["nightowl_nina", "BU", "bookmarking this for finals week. and every week", null, 14, 33],
      ["late_train_luis", "Local", "the chili oil there should be regulated", null, 19, 30],
      ["dumplingdan", "NEU", "it is regulated. by me. get the extra spicy", "late_train_luis", 7, 26],
    ],
    scene: { top: "#3a0d12", bottom: "#b4361c", glow: "#ffab31", track: "#ffab31", seed: 4,
      emojis: [["🥟", 450, 560, 290], ["🏮", 190, 260, 120], ["🏮", 710, 230, 120], ["♨️", 450, 330, 110]] },
  },
  {
    n: 5, line: "Red", stationId: "place-chmnl", vibe: "ON_THE_T",
    author: "kendall_commuter", badge: "MIT", color: "#06b6d4", minutesAgo: 52, reactions: [140, 22, 6, 48],
    caption: "Sunset over the Charles from the Red Line on the Longfellow Bridge. The whole car went quiet and pulled out their phones at the same time 🌇",
    replies: [
      ["salt_n_pepper_sam", "Local", "the 30 seconds on that bridge are the best part of the Red Line. the other 40 minutes, not so much", null, 26, 47],
      ["tourist_tom", "Tourist", "wait you all get this every day??", null, 10, 41],
    ],
    scene: { top: "#3d1a5c", bottom: "#ff8a4c", glow: "#ffcf6b", track: "#ff5948", seed: 5, water: true, sun: "#ffd27a",
      emojis: [["🚇", 700, 868, 90]] },
  },
  {
    n: 6, line: "Blue", stationId: "place-aqucl", vibe: "STREET_VIBES",
    author: "harbor_hana", badge: "Tourist", color: "#3b82f6", minutesAgo: 75, reactions: [95, 8, 4, 27],
    caption: "Free harbor seal show outside the New England Aquarium, 2 min from the Blue Line. One of them is definitely judging my outfit 🦭",
    replies: [
      ["eastie_eddie", "Local", "the seals have seen things. they've seen the Blue Line at rush hour", null, 9, 70],
      ["aqua_ari", "NEU", "the one on the left does that to everyone, don't take it personally", null, 13, 64],
    ],
    scene: { top: "#06294a", bottom: "#0e7490", glow: "#67e8f9", track: "#428dff", seed: 6, water: true,
      emojis: [["🦭", 450, 580, 300], ["🌊", 220, 720, 120], ["🐟", 720, 380, 90]] },
  },
  {
    n: 7, line: "Orange", stationId: "place-dwnxg", vibe: "DELAY_VENT",
    author: "orange_oliver", badge: "Local", color: "#ED8B00", minutesAgo: 110, reactions: [28, 39, 15, 18],
    caption: "The countdown sign at Downtown Crossing said '2 min' for 11 minutes straight. Honestly I respect its confidence 🙃",
    replies: [
      ["nu_nadia", "NEU", "the Orange Line runs on vibes and hope", null, 17, 101],
      ["dtx_danielle", "Local", "it said ARRIVING for me once and I aged a full year", null, 11, 95],
    ],
  },
  {
    n: 8, line: "Green", stationId: "place-kencl", vibe: "CROWD_CHECK",
    author: "fenway_frank", badge: "Local", color: "#22c55e", minutesAgo: 160, reactions: [44, 51, 12, 20],
    caption: "Sox game just let out and Kenmore is a sea of red, platform is FULL. Walk to Hynes if you value your ribs ⚾",
    replies: [
      ["bu_brianna", "BU", "walked to Hynes, ribs intact, thank you for your service", null, 8, 150],
      ["sox_steve", "Local", "worth it. we won 🧹", null, 12, 146],
    ],
  },
];

let art: Partial<Record<number, string>> = {};

export function buildMockPosts(now = Date.now()): CommunityPost[] {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  return SEEDS.map((s) => {
    const id = `seed-${s.n}`;
    if (s.scene && !art[s.n]) art = { ...art, [s.n]: sceneSvg(s.scene) };
    const replies: CommunityReply[] = s.replies.map(([author, badge, text, replyTo, likes, m], i) => ({
      id: `${id}-r${i + 1}`,
      postId: id,
      author,
      authorBadge: badge,
      text,
      ...(replyTo ? { replyToAuthor: replyTo } : {}),
      likes,
      createdAt: ago(m),
    }));
    const [heart, train, dunkin, fire] = s.reactions;
    return {
      id,
      line: s.line,
      ...(s.branch ? { branch: s.branch } : {}),
      stationId: s.stationId,
      stationName: stopName(s.stationId),
      vibe: s.vibe,
      author: s.author,
      authorBadge: s.badge,
      avatarColor: s.color,
      caption: s.caption,
      ...(s.scene ? { imageUrl: art[s.n] } : {}),
      reactions: { heart, train, dunkin, fire },
      replies,
      createdAt: ago(s.minutesAgo),
    };
  });
}

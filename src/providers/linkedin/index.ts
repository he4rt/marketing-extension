import type {
  BackgroundStore,
  ExportComment,
  ExportLinkedInPost,
  ExportSummaryLinkedin,
  ExportV3PlatformLinkedin,
  LinkedInEngagementMetrics,
  LinkedInEngagerStore,
  LinkedInReactionUser,
  LinkedInRepostEntry,
  LinkedInRepostStore,
  SocialActor,
  SocialComment,
} from "../../shared/domain";
import type { CapturedPayloadMessage } from "../../shared/messages";
import type { BackgroundProviderFacet, ScopeMode } from "../contract";
import { publicationKey } from "../shared/utils";
import { getCalibration, harvestSignature, isCalibrated } from "./active-fetch/calibration";
import { registry } from "./process/registry";
import { searchScopeMode } from "./search/scope";
import type { LinkedInStore } from "./types";

export function emptyLinkedInStore(): LinkedInStore {
  return {
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
    extra: {
      posts: {},
      reactions: {},
      reposts: {},
      comments: {},
      commentReactions: {},
      accountInfo: null,
      feedOrder: [],
    },
  };
}

export function processLinkedInCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  if (request.url) harvestSignature(request.url, request.signature);

  const processor = registry[request.endpoint];
  if (processor) processor.process(store, request);
}

function buildLinkedInCommentWithReactions(
  items: SocialComment[],
  commentReactions: Record<string, { users: SocialActor[] }>,
): ExportComment[] {
  const byId = new Map<string, ExportComment>();
  const roots: ExportComment[] = [];

  for (const c of items) {
    const node: ExportComment = {
      comment_id: c.comment_id,
      author: c.author,
      text: c.text,
      created_at: c.created_at,
      replies: [],
    };
    byId.set(c.comment_id, node);
  }

  for (const c of items) {
    const node = byId.get(c.comment_id);
    if (!node) continue;
    if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
      byId.get(c.parent_comment_id)?.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const [, node] of byId) {
    const reactions = commentReactions[node.comment_id];
    if (reactions?.users?.length) {
      node.reaction_users = reactions.users;
    }
  }

  return roots;
}

function computeLinkedInEngagementMetrics(
  reactions: LinkedInEngagerStore | undefined,
  reposts: LinkedInRepostStore | undefined,
  comments: ExportComment[],
  trackedAccountUrn: string,
): LinkedInEngagementMetrics {
  let realComments = 0;
  let replies = 0;
  const commenterUrns = new Set<string>();
  const reacterUrns = new Set<string>();
  const allUrns = new Set<string>();

  const walk = (items: ExportComment[], depth: number) => {
    for (const c of items) {
      if (depth === 0) realComments++;
      else replies++;
      if (c.author.provider_user_id) {
        commenterUrns.add(c.author.provider_user_id);
        allUrns.add(c.author.provider_user_id);
      }
      for (const r of c.reaction_users || []) {
        if (r.provider_user_id) {
          reacterUrns.add(r.provider_user_id);
          allUrns.add(r.provider_user_id);
        }
      }
      walk(c.replies || [], depth + 1);
    }
  };
  walk(comments, 0);

  for (const u of reactions?.users || []) {
    if (u.provider_user_id) {
      reacterUrns.add(u.provider_user_id);
      allUrns.add(u.provider_user_id);
    }
  }
  for (const u of reposts?.users || []) {
    if (u.urn) allUrns.add(u.urn);
  }

  let audienceInteractions = 0;
  for (const urn of allUrns) {
    if (urn !== trackedAccountUrn) audienceInteractions++;
  }

  return {
    real_comments: realComments,
    replies,
    unique_commenters_count: commenterUrns.size,
    unique_reacters_count: reacterUrns.size,
    unique_engagers_count: allUrns.size,
    audience_interactions: audienceInteractions,
  };
}

export function buildPlatformDataLinkedin(store: BackgroundStore): ExportV3PlatformLinkedin {
  const lstore = store.platforms.linkedin.extra;
  const trackedAccountUrn = lstore.accountInfo?.provider_user_id || "";

  const content: ExportLinkedInPost[] = (lstore.feedOrder || []).reduce<ExportLinkedInPost[]>(
    (acc, id) => {
      const post = lstore.posts[id];
      if (!post) return acc;
      const shareUrn = post.share_urn;
      const activityUrn = post.activity_urn;
      const reactions = lstore.reactions[shareUrn] || lstore.reactions[activityUrn];
      // Fallback por activity_urn (mesmo padrão de reactions/comments): posts vindos da
      // busca SDUI têm share_urn vazio, então o Active Fetch (L3) consolida os reposts sob
      // o activity_urn (targetUrn:<activity_urn>). Sem este fallback a riqueza de reposts
      // do L3-search se perderia do export. Byte-compat: no profile/feed os reposts ficam
      // sob o share_urn e não há entrada sob activity_urn → fallback resolve undefined.
      const reposts = lstore.reposts[shareUrn] || lstore.reposts[activityUrn];
      const commentsStore = lstore.comments[shareUrn] || lstore.comments[activityUrn];

      const reactionUsers: LinkedInReactionUser[] = (reactions?.users || []).map((u) => ({
        urn: u.provider_user_id,
        name: u.name,
        headline: "",
        avatar_url: u.avatar_url,
        navigation_url: "",
        reaction_type: (u as any).reaction_type || "",
      }));

      const repostEntries: LinkedInRepostEntry[] = (reposts?.users || []).map((u) => ({
        urn: u.urn,
        name: u.name,
        avatar_url: u.avatar_url,
        ...(u.activity_urn
          ? {
              id: u.id,
              activity_urn: u.activity_urn,
              share_urn: u.share_urn,
              text: u.text,
              type: u.type,
              author: u.author,
              metrics: u.metrics,
              hashtags: u.hashtags,
              media: u.media,
              post_not_found: u.post_not_found,
              reshare_ref: u.reshare_ref,
            }
          : {}),
      }));

      const commentItems = commentsStore?.items || [];
      const exportComments = buildLinkedInCommentWithReactions(
        commentItems,
        lstore.commentReactions,
      );

      const engagementMetrics = computeLinkedInEngagementMetrics(
        reactions,
        reposts,
        exportComments,
        trackedAccountUrn,
      );

      // Provenance aditiva no v3 (#5/#14): anexa {mode,value} ao item SÓ quando o
      // store tem a entrada E o mode é "search". O modo "profile" permanece interno
      // para preservar byte-compat dos snapshots profile-puro (LinkedIn profile grava
      // provenance "profile", mas ela NÃO pode vazar no export atual). A chave de
      // lookup é a mesma de recordProvenance: publicationKey("linkedin", activity_urn).
      const prov = store.provenance.linkedin?.[publicationKey("linkedin", activityUrn)];
      const searchProv = prov && prov.mode === "search" ? prov : null;

      acc.push({
        ...post,
        engagers: {
          reactions: reactionUsers,
          reposts: repostEntries,
          comments: exportComments,
        },
        engagement_metrics: engagementMetrics,
        ...(searchProv ? { provenance: searchProv } : {}),
      });
      return acc;
    },
    [],
  );

  return { content };
}

export function computeSummaryLinkedin(store: BackgroundStore): ExportSummaryLinkedin {
  const lstore = store.platforms.linkedin.extra;
  const posts = Object.values(lstore.posts);
  const totalReactionUsers = Object.values(lstore.reactions).reduce(
    (s, r) => s + r.users.length,
    0,
  );
  const totalRepostUsers = Object.values(lstore.reposts).reduce((s, r) => s + r.users.length, 0);
  const totalCommentItems = Object.values(lstore.comments).reduce((s, c) => s + c.items.length, 0);
  const totalCommentReactionUsers = Object.values(lstore.commentReactions).reduce(
    (s, r) => s + r.users.length,
    0,
  );

  const allEngagers = new Set<string>();
  for (const entry of Object.values(lstore.reactions))
    for (const u of entry.users) allEngagers.add(u.provider_user_id || u.username);
  for (const entry of Object.values(lstore.reposts))
    for (const u of entry.users) allEngagers.add(u.urn || u.activity_urn || "");
  for (const entry of Object.values(lstore.comments))
    for (const c of entry.items) allEngagers.add(c.author.provider_user_id || c.author.username);

  return {
    total_content: posts.length,
    total_likes: posts.reduce((s, p) => s + p.metrics.like_count, 0),
    total_comments: posts.reduce((s, p) => s + p.metrics.comment_count, 0),
    total_shares: posts.reduce((s, p) => s + p.metrics.share_count, 0),
    total_reaction_users: totalReactionUsers,
    total_repost_users: totalRepostUsers,
    total_comment_items: totalCommentItems,
    total_comment_reaction_users: totalCommentReactionUsers,
    total_audience_interactions: allEngagers.size,
  };
}

// Contract hooks — extraídos de handleRuntimeMessage para desacoplar do controller.

function buildPlatformData(store: BackgroundStore) {
  const lstore = store.platforms.linkedin.extra;
  const enriched = (lstore.feedOrder || [])
    .map((id) => {
      const post = lstore.posts[id];
      if (!post) return null;
      const shareUrn = post.share_urn;
      const activityUrn = post.activity_urn;
      const reactions = lstore.reactions[shareUrn] || lstore.reactions[activityUrn];
      const reposts = lstore.reposts[shareUrn];
      const comments = lstore.comments[shareUrn] || lstore.comments[activityUrn];
      return {
        ...post,
        engagers: {
          reactions: { captured: reactions?.users?.length || 0, total: reactions?.total || 0 },
          reposts: { captured: reposts?.users?.length || 0, total: reposts?.total || 0 },
          comments: { captured: comments?.items?.length || 0, total: comments?.total || 0 },
        },
      };
    })
    .filter(Boolean);
  return {
    type: "linkedin" as const,
    content: enriched,
    lastUpdated: store.lastUpdated,
    unreadable: lstore.searchUnreadable ?? 0,
    calibrated: isCalibrated(getCalibration()),
  };
}

function computePopupSummary(store: BackgroundStore) {
  const liExtra = store.platforms.linkedin.extra;
  const liPubs = Object.values(liExtra.posts);
  const liEngagers = new Set<string>();
  for (const entry of Object.values(liExtra.reactions)) {
    for (const u of entry.users) liEngagers.add(u.provider_user_id || u.username);
  }
  for (const entry of Object.values(liExtra.reposts)) {
    for (const u of entry.users) liEngagers.add(u.urn || u.activity_urn || "");
  }
  for (const entry of Object.values(liExtra.comments)) {
    for (const c of entry.items) liEngagers.add(c.author.provider_user_id || c.author.username);
  }
  return { content_count: liPubs.length, engager_count: liEngagers.size };
}

// Modos de Scope declaráveis (#9). O filtro real continua dentro do parser
// (linkedinFeedToPublications/linkedinFeedToPosts), que casa pelo NOME da organização
// via substring (actorInfo.name.includes(handle)); selects() espelha esse comportamento
// — casa quando o nome do autor da publicação contém o valor (org name), não igualdade.
export const scopeModes: ScopeMode[] = [
  {
    id: "profile",
    label: "Profile",
    selects: (pub, value) => pub.author.name?.toLowerCase().includes(value.toLowerCase()) ?? false,
  },
  // Modo "search" (#16): detectFromPage lê ?keywords= da SRP; selects() sempre true
  // (o LinkedIn já filtrou no servidor). Definido em search/scope.ts.
  searchScopeMode,
];

export const linkedinProvider: BackgroundProviderFacet = {
  id: "linkedin",
  processCapture: processLinkedInCapture,
  scopeModes,
  buildPlatformData,
  computePopupSummary,
  buildExportPlatformData: buildPlatformDataLinkedin,
  computeExportSummary: computeSummaryLinkedin,
};

import {
  recordProvenance,
  storeComment,
  storeEngagement,
  storePublication,
  trackedHandleForProvider,
} from "../../background/store";
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
import {
  linkedinFeedAccountInfo,
  linkedinFeedToPosts,
  linkedinFeedToPublications,
  linkedinParseComments,
  linkedinParseReactions,
  linkedinParseReposts,
} from "./parser";

export function processLinkedInCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  // A riqueza bespoke do LinkedIn vive em platforms.linkedin.extra (LinkedInExtra).
  const lstore = store.platforms.linkedin.extra;
  const handle = trackedHandleForProvider(store, "linkedin");

  if (request.endpoint === "feedDashOrganizationalPageUpdates") {
    const publications = linkedinFeedToPublications(request.payload, handle);
    for (const pub of publications) {
      // O filtro real (name OU headerText) vive no parser; aqui só gravamos a Provenance
      // das publicações que já passaram por ele. Ver decisão 3 do plano #9.
      if (handle) recordProvenance(store, "linkedin", pub.publication_id, "profile", handle);
      storePublication(store, pub);
    }

    const posts = linkedinFeedToPosts(request.payload, handle);
    for (const post of posts) {
      lstore.posts[post.id] = post;
      if (!lstore.feedOrder.includes(post.id)) lstore.feedOrder.push(post.id);
    }

    const accountInfo = linkedinFeedAccountInfo(request.payload, handle);
    if (accountInfo) {
      lstore.accountInfo = accountInfo;
      store.trackedProfiles.linkedin = accountInfo;
    }
  }

  if (request.endpoint === "socialDashReactions" && request.url) {
    const result = linkedinParseReactions(request.payload, request.url);
    if (result) {
      if (result.isCommentReaction) {
        const threadUrn = result.parentUrn;
        if (!lstore.commentReactions[threadUrn]) {
          lstore.commentReactions[threadUrn] = { users: [] };
        }
        const existing = new Set(
          lstore.commentReactions[threadUrn].users.map((u) => u.provider_user_id),
        );
        const fresh = result.users.filter((u) => !existing.has(u.provider_user_id));
        lstore.commentReactions[threadUrn].users.push(...fresh);
      } else {
        const parentUrn = result.parentUrn;
        if (!lstore.reactions[parentUrn]) {
          const total = 0;
          lstore.reactions[parentUrn] = { users: [], total, lastStart: 0 };
        }
        const entry = lstore.reactions[parentUrn];
        if (entry) {
          const existing = new Set(entry.users.map((u) => u.provider_user_id));
          const fresh = result.users.filter((u) => !existing.has(u.provider_user_id));
          entry.users.push(...fresh);
        }

        for (const user of result.users) {
          const pub = findLinkedInPublicationByUrn(store, parentUrn);
          const pid = pub?.publication_id || parentUrn;
          storeEngagement(store, {
            provider: "linkedin",
            publication_id: pid,
            kind: "like",
            engagement_id: publicationKey(
              "linkedin",
              `${pid}:like:${user.provider_user_id || user.username}`,
            ),
            actor: user,
          });
        }
      }
    }
  }

  if (request.endpoint === "feedDashReshareFeed" && request.url) {
    const result = linkedinParseReposts(request.payload, request.url);
    if (result) {
      const parentUrn = result.parentUrn;
      if (!lstore.reposts[parentUrn]) {
        lstore.reposts[parentUrn] = { users: [], total: 0, lastStart: 0 };
      }
      const entry = lstore.reposts[parentUrn];

      const existingUrns = new Set(entry.users.map((u) => u.urn).filter(Boolean));
      const existingActivityUrns = new Set(entry.users.map((u) => u.activity_urn).filter(Boolean));

      for (const user of result.users) {
        if (user.urn) {
          if (existingUrns.has(user.urn)) continue;
          existingUrns.add(user.urn);
          entry.users.push(user);

          const pub = findLinkedInPublicationByUrn(store, parentUrn);
          const pid = pub?.publication_id || parentUrn;
          storeEngagement(store, {
            provider: "linkedin",
            publication_id: pid,
            kind: "like",
            engagement_id: publicationKey("linkedin", `${pid}:repost:${user.urn}`),
            actor: {
              provider: "linkedin",
              provider_user_id: user.urn,
              username: (user.name || "").toLowerCase().replace(/\s+/g, "_"),
              name: user.name || "",
              avatar_url: user.avatar_url || "",
            },
          });
        } else if (user.activity_urn) {
          if (existingActivityUrns.has(user.activity_urn)) continue;
          existingActivityUrns.add(user.activity_urn);

          const existingPost = Object.values(lstore.posts).find(
            (p) => p.activity_urn === user.activity_urn,
          );
          if (existingPost) {
            entry.users.push({ reshare_ref: existingPost.id, activity_urn: user.activity_urn });
          } else {
            entry.users.push(user);
          }
        }
      }
    }
  }

  if (request.endpoint === "socialDashComments" && request.url) {
    const result = linkedinParseComments(request.payload, request.url);
    if (result) {
      const parentUrn = result.parentUrn;
      if (!lstore.comments[parentUrn]) {
        lstore.comments[parentUrn] = { items: [], total: 0, lastStart: 0 };
      }
      const entry = lstore.comments[parentUrn];
      if (entry) {
        const existing = new Set(entry.items.map((c) => c.comment_id));
        const fresh = result.comments.filter((c) => !existing.has(c.comment_id));
        entry.items.push(...fresh);
      }

      for (const comment of result.comments) {
        const pub = findLinkedInPublicationByUrn(store, parentUrn);
        const pid = pub?.publication_id || parentUrn;
        comment.publication_id = pid;
        storeComment(store, comment);
        storeEngagement(store, {
          provider: "linkedin",
          publication_id: pid,
          kind: "comment",
          engagement_id: publicationKey("linkedin", `${pid}:comment:${comment.comment_id}`),
          actor: comment.author,
          engaged_at: comment.created_at,
        });
      }
    }
  }
}

function findLinkedInPublicationByUrn(store: BackgroundStore, urn: string) {
  return Object.values(store.platforms.linkedin.publications).find(
    (p) =>
      p.provider === "linkedin" && (p.publication_id === urn || p.reposted_publication_id === urn),
  );
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
    const node = byId.get(c.comment_id)!;
    if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
      byId.get(c.parent_comment_id)!.replies.push(node);
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
      const reposts = lstore.reposts[shareUrn];
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

      acc.push({
        ...post,
        engagers: {
          reactions: reactionUsers,
          reposts: repostEntries,
          comments: exportComments,
        },
        engagement_metrics: engagementMetrics,
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
];

export const linkedinProvider: BackgroundProviderFacet = {
  id: "linkedin",
  processCapture: processLinkedInCapture,
};

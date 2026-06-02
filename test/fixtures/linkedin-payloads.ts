// @ts-nocheck
// Fixture mínima-porém-real do formato Voyager do LinkedIn.
// Cobre: feedDashOrganizationalPageUpdates (post + métricas + reaction_breakdown),
// socialDashReactions, socialDashComments (comentário + reply) e feedDashReshareFeed.
// O parser resolve um grafo de entidades por `entityUrn` referenciadas por `*...`.

const ROOT = "https://media.licdn.com/dms/image/";

function vectorImage(seg, width = 400, height = 400) {
  return {
    rootUrl: ROOT,
    artifacts: [{ fileIdentifyingUrlPathSegment: seg, width, height }],
  };
}

function profilePicture(seg) {
  return { attributes: [{ detailData: { nonEntityProfilePicture: { vectorImage: vectorImage(seg) } } }] };
}

// ---- feedDashOrganizationalPageUpdates ----------------------------------

const companyEntity = {
  entityUrn: "urn:li:fsd_company:123",
  url: "https://www.linkedin.com/company/he4rt",
};

const hashtagEntity = {
  entityUrn: "urn:li:fsd_hashtag:laravel",
  trackingUrn: "urn:li:hashtag:laravel",
};

const feedCounts = {
  entityUrn: "urn:li:fsd_socialActivityCounts:111",
  numLikes: 207,
  numComments: 12,
  numShares: 5,
  reactionTypeCounts: [
    { reactionType: "LIKE", count: 155 },
    { reactionType: "PRAISE", count: 26 },
    { reactionType: "EMPATHY", count: 26 },
  ],
};

const feedSocialDetail = {
  entityUrn: "urn:li:fsd_socialDetail:111",
  "*totalSocialActivityCounts": "urn:li:fsd_socialActivityCounts:111",
};

const feedUpdate = {
  entityUrn: "urn:li:activity:111",
  $type: "com.linkedin.voyager.dash.feed.Update",
  actor: {
    name: { text: "He4rt Developers" },
    backendUrn: "urn:li:company:123",
    description: { text: "Open source community" },
    subDescription: { text: "1d" },
    image: {
      attributes: [
        {
          detailData: {
            nonEntityCompanyLogo: {
              "*company": "urn:li:fsd_company:123",
              vectorImage: vectorImage("company-logo.jpg", 800, 800),
            },
          },
        },
      ],
    },
  },
  commentary: {
    text: {
      text: "Bora aprender Laravel com a comunidade #laravel",
      attributesV2: [{ detailData: { "*hashtag": "urn:li:fsd_hashtag:laravel" } }],
    },
  },
  content: {},
  metadata: { backendUrn: "urn:li:activity:111", shareUrn: "urn:li:share:111" },
  "*socialDetail": "urn:li:fsd_socialDetail:111",
};

export const linkedinFeedPayload = {
  data: {
    data: {
      feedDashOrganizationalPageUpdatesByOrganizationalPage: {
        "*elements": ["urn:li:activity:111"],
      },
    },
  },
  included: [feedUpdate, feedSocialDetail, feedCounts, companyEntity, hashtagEntity],
};

// ---- socialDashReactions -------------------------------------------------

function reaction(urn, memberId, name, seg) {
  return {
    entityUrn: urn,
    $type: "com.linkedin.voyager.dash.social.Reaction",
    preDashEntityUrn: `urn:li:member:${memberId}`,
    reactorLockup: {
      title: { text: name },
      image: profilePicture(seg),
    },
  };
}

export const linkedinReactionsPayload = {
  data: {
    data: {
      socialDashReactionsByReactionType: {
        "*elements": ["urn:li:fsd_reaction:r1", "urn:li:fsd_reaction:r2"],
      },
    },
  },
  included: [
    reaction("urn:li:fsd_reaction:r1", "555", "Reactor One", "r1.jpg"),
    reaction("urn:li:fsd_reaction:r2", "556", "Reactor Two", "r2.jpg"),
  ],
};

export const linkedinReactionsUrl =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashReactions.aaa&variables=(count:10,start:0,urn:urn:li:activity:111)";

// ---- socialDashComments (comentário + reply) -----------------------------

const replyComment = {
  entityUrn: "urn:li:fsd_comment:c1r1",
  $type: "com.linkedin.voyager.dash.social.Comment",
  commenter: {
    title: { text: "He4rt Developers" },
    urn: "urn:li:company:123",
    image: profilePicture("he4rt.jpg"),
  },
  commentary: { text: "Valeu pelo apoio!" },
};

const rootComment = {
  entityUrn: "urn:li:fsd_comment:c1",
  $type: "com.linkedin.voyager.dash.social.Comment",
  commenter: {
    title: { text: "Commenter One" },
    urn: "urn:li:member:777",
    image: profilePicture("c1.jpg"),
  },
  commentary: { text: "Otimo conteudo, obrigado!" },
  "*socialDetail": "urn:li:fsd_socialDetail:c1",
};

const commentSocialDetail = {
  entityUrn: "urn:li:fsd_socialDetail:c1",
  comments: { "*elements": ["urn:li:fsd_comment:c1r1"] },
};

export const linkedinCommentsPayload = {
  data: {
    data: {
      socialDashCommentsBySocialDetail: {
        "*elements": ["urn:li:fsd_comment:c1"],
      },
    },
  },
  included: [rootComment, commentSocialDetail, replyComment],
};

export const linkedinCommentsUrl =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashComments.bbb&variables=(count:10,start:0,socialDetailUrn:urn:li:fsd_socialDetail:urn:li:activity:111)";

// ---- feedDashReshareFeed (reposter simples) ------------------------------

const reposterProfile = {
  entityUrn: "urn:li:fsd_profile:888",
  firstName: "Reposter",
  lastName: "Person",
};

const reshareUpdate = {
  entityUrn: "urn:li:activity:222",
  $type: "com.linkedin.voyager.dash.feed.Update",
  metadata: { actionsPosition: "HEADER_COMPONENT" },
  header: {
    text: {
      text: "Reposter Person reposted this",
      attributesV2: [{ detailData: { "*profileFullName": "urn:li:fsd_profile:888" } }],
    },
    image: profilePicture("reposter.jpg"),
  },
};

export const linkedinRepostsPayload = {
  data: {
    data: {
      feedDashReshareFeedByReshareFeed: {
        "*elements": ["urn:li:activity:222"],
      },
    },
  },
  included: [reshareUpdate, reposterProfile],
};

export const linkedinRepostsUrl =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerFeedDashReshareFeed.ccc&variables=(count:10,start:0,targetUrn:urn:li:share:111)";

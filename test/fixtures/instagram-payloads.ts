// @ts-nocheck

function user({
  id,
  username,
  fullName,
  privateAccount = false,
  verified = false,
  following = false,
}) {
  return {
    pk: id,
    id,
    username,
    full_name: fullName,
    profile_pic_url: `https://img.example/instagram/${username}.jpg`,
    is_private: privateAccount,
    is_verified: verified,
    friendship_status: {
      following,
    },
  };
}

const he4rt = user({
  id: "ig-1",
  username: "he4rtdevs",
  fullName: "He4rt Developers",
  verified: true,
});

const member = user({
  id: "ig-2",
  username: "community_member",
  fullName: "Community Member",
  following: true,
});

function media({
  pk,
  code,
  author = he4rt,
  caption,
  likes = 0,
  comments = 0,
  views = 0,
  mediaType = 1,
  productType = "feed",
  takenAt = 1_779_201_600,
  carouselCount = null,
}) {
  return {
    pk,
    id: `${pk}_${author.pk}`,
    code,
    user: author,
    caption: {
      pk: `${pk}-caption`,
      text: caption,
    },
    like_count: likes,
    comment_count: comments,
    view_count: views,
    media_type: mediaType,
    product_type: productType,
    taken_at: takenAt,
    carousel_media_count: carouselCount,
    carousel_media: carouselCount
      ? Array.from({ length: carouselCount }, (_, index) => ({ pk: `${pk}-item-${index}` }))
      : null,
  };
}

const firstMedia = media({
  pk: "391",
  code: "ABC123",
  caption: "Bora estudar Laravel e TypeScript #He4rtDevelopers @community_member",
  likes: 42,
  comments: 3,
  views: 1000,
});

const reelMedia = media({
  pk: "392",
  code: "REEL456",
  caption: "Reel sobre carreira dev",
  likes: 20,
  comments: 1,
  views: 2500,
  mediaType: 2,
  productType: "clips",
});

export const instagramFeedPayload = {
  data: {
    xdt_api__v1__feed__timeline__connection: {
      edges: [
        {
          node: {
            media: firstMedia,
          },
          cursor: "cursor-1",
        },
        {
          node: {
            media: reelMedia,
          },
          cursor: "cursor-2",
        },
      ],
      page_info: {
        has_next_page: true,
        end_cursor: "cursor-2",
      },
    },
  },
};

export const instagramSingleMediaPayload = {
  data: {
    media: media({
      pk: "393",
      code: "CAR789",
      caption: "Carrossel de aprendizado",
      likes: 8,
      comments: 0,
      carouselCount: 3,
    }),
  },
};

export const instagramPostPagePayload = {
  require: [
    [
      "ScheduledServerJS",
      "handle",
      null,
      [
        {
          __bbox: {
            result: {
              data: {
                media: media({
                  pk: "394",
                  code: "POSTSSR",
                  caption: "Publicacao principal renderizada por SSR",
                  likes: 13,
                  comments: 15,
                  carouselCount: 2,
                }),
              },
            },
          },
        },
      ],
    ],
  ],
};

export const instagramCommentsPayload = {
  data: {
    xdt_api__v1__media__media_id__comments__connection: {
      edges: [
        {
          node: {
            pk: "comment-1",
            user: member,
            text: "Conteudo excelente!",
            created_at: 1_779_202_000,
            comment_like_count: 2,
            parent_comment_id: null,
            has_liked_comment: false,
          },
          cursor: "comment-cursor-1",
        },
        {
          node: {
            pk: "comment-2",
            user: he4rt,
            text: "@community_member valeu!",
            created_at: 1_779_202_100,
            comment_like_count: 1,
            parent_comment_id: "comment-1",
            has_liked_comment: false,
          },
          cursor: "comment-cursor-2",
        },
      ],
      page_info: {
        has_next_page: false,
        end_cursor: "",
      },
    },
  },
};

export const instagramLikersPayload = {
  data: {
    users: [
      {
        ...member,
        is_professional_account: false,
      },
      {
        ...user({
          id: "ig-3",
          username: "private_member",
          fullName: "Private Member",
          privateAccount: true,
        }),
        is_professional_account: false,
      },
    ],
  },
};

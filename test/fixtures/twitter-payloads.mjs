function user({
  restId,
  screenName,
  name,
  followers = 0,
  friends = 0,
  statuses = 0,
  description = '',
  avatar = '',
  blue = false,
  following = false,
  followedBy = false
}) {
  return {
    __typename: 'User',
    rest_id: restId,
    core: {
      screen_name: screenName,
      name
    },
    legacy: {
      followers_count: followers,
      friends_count: friends,
      statuses_count: statuses,
      description
    },
    avatar: {
      image_url: avatar || `https://img.example/${screenName}.jpg`
    },
    privacy: {
      protected: false
    },
    relationship_perspectives: {
      following,
      followed_by: followedBy
    },
    is_blue_verified: blue
  };
}

function tweet({
  id,
  author,
  text,
  createdAt,
  favorites = 0,
  retweets = 0,
  replies = 0,
  quotes = 0,
  bookmarks = 0,
  views = 0,
  replyTo = null,
  quoteId = null,
  retweetedStatus = null,
  hashtags = [],
  mentions = [],
  urls = [],
  mediaCount = 0
}) {
  const legacy = {
    id_str: id,
    full_text: text,
    created_at: createdAt,
    lang: 'en',
    favorite_count: favorites,
    retweet_count: retweets,
    reply_count: replies,
    quote_count: quotes,
    bookmark_count: bookmarks,
    entities: {
      hashtags: hashtags.map((text) => ({ text })),
      user_mentions: mentions.map((screenName) => ({
        screen_name: screenName,
        name: screenName
      })),
      urls: urls.map((expandedUrl) => ({
        expanded_url: expandedUrl,
        display_url: expandedUrl.replace(/^https?:\/\//, '')
      })),
      media: Array.from({ length: mediaCount }, (_, index) => ({ id_str: `${id}-media-${index}` }))
    }
  };

  if (replyTo) {
    legacy.in_reply_to_status_id_str = replyTo.tweetId;
    legacy.in_reply_to_screen_name = replyTo.screenName;
  }

  if (quoteId) {
    legacy.is_quote_status = true;
    legacy.quoted_status_id_str = quoteId;
  }

  if (retweetedStatus) {
    legacy.retweeted_status_result = {
      result: retweetedStatus
    };
  }

  return {
    __typename: 'Tweet',
    rest_id: id,
    core: {
      user_results: {
        result: author
      }
    },
    legacy,
    views: {
      count: String(views)
    },
    source: '<a href="https://mobile.twitter.com" rel="nofollow">Twitter for iPhone</a>'
  };
}

function tweetEntry(result) {
  return {
    content: {
      __typename: 'TimelineTimelineItem',
      itemContent: {
        tweet_results: {
          result
        }
      }
    }
  };
}

function moduleEntry(results) {
  return {
    content: {
      __typename: 'TimelineTimelineModule',
      items: results.map((result) => ({
        item: {
          itemContent: {
            tweet_results: {
              result
            }
          }
        }
      }))
    }
  };
}

function userEntry(result) {
  return {
    content: {
      __typename: 'TimelineTimelineItem',
      itemContent: {
        user_results: {
          result
        }
      }
    }
  };
}

export const trackedUser = user({
  restId: 'tracked-1',
  screenName: 'He4rtDevs',
  name: 'He4rt Developers',
  followers: 20945,
  friends: 320,
  statuses: 2178,
  description: 'Open source community',
  blue: true
});

export const alternateTrackedUser = user({
  restId: 'tracked-2',
  screenName: 'OtherHandle',
  name: 'Other Handle',
  followers: 99
});

export const communityUser = user({
  restId: 'community-1',
  screenName: 'community_member',
  name: 'Community Member',
  followers: 150,
  following: true,
  followedBy: true
});

export const retweetedAuthor = user({
  restId: 'source-1',
  screenName: 'source_author',
  name: 'Source Author',
  followers: 500
});

const originalTweet = tweet({
  id: '100',
  author: trackedUser,
  text: 'Pinned launch from He4rt #He4rtDevelopers',
  createdAt: 'Tue May 19 12:00:00 +0000 2026',
  favorites: 15,
  retweets: 4,
  replies: 2,
  quotes: 1,
  bookmarks: 3,
  views: 1000,
  hashtags: ['He4rtDevelopers'],
  mentions: ['He4rtDevs'],
  urls: ['https://he4rt.dev'],
  mediaCount: 2
});

const quoteTweet = tweet({
  id: '101',
  author: trackedUser,
  text: 'Quoting a community win',
  createdAt: 'Tue May 19 13:00:00 +0000 2026',
  favorites: 5,
  retweets: 1,
  replies: 0,
  quotes: 2,
  views: 500,
  quoteId: '900'
});

const replyFromTracked = tweet({
  id: '102',
  author: trackedUser,
  text: 'Replying from the tracked account',
  createdAt: 'Tue May 19 14:00:00 +0000 2026',
  favorites: 2,
  replies: 1,
  views: 200,
  replyTo: {
    tweetId: '901',
    screenName: 'someone_else'
  }
});

const sourceTweet = tweet({
  id: '800',
  author: retweetedAuthor,
  text: 'Original source post',
  createdAt: 'Tue May 19 11:00:00 +0000 2026',
  favorites: 30,
  retweets: 8,
  replies: 3,
  views: 2000
});

const retweet = tweet({
  id: '103',
  author: trackedUser,
  text: 'RT @source_author: Original source post',
  createdAt: 'Tue May 19 15:00:00 +0000 2026',
  retweetedStatus: sourceTweet
});

const communityReply = tweet({
  id: '200',
  author: communityUser,
  text: 'This helped a lot!',
  createdAt: 'Tue May 19 16:00:00 +0000 2026',
  favorites: 1,
  views: 50,
  replyTo: {
    tweetId: '100',
    screenName: 'He4rtDevs'
  }
});

const otherHandleTweet = tweet({
  id: '300',
  author: alternateTrackedUser,
  text: 'A tweet for another handle',
  createdAt: 'Tue May 19 17:00:00 +0000 2026',
  favorites: 7,
  views: 70
});

export const userTweetsPayload = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelinePinEntry',
                entry: tweetEntry(originalTweet)
              },
              {
                type: 'TimelineAddEntries',
                entries: [
                  tweetEntry(originalTweet),
                  tweetEntry(quoteTweet),
                  tweetEntry(replyFromTracked),
                  moduleEntry([retweet, communityReply]),
                  {
                    content: {
                      __typename: 'TimelineTimelineCursor',
                      value: 'cursor'
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    }
  }
};

export const alternateUserTweetsPayload = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  tweetEntry(otherHandleTweet)
                ]
              }
            ]
          }
        }
      }
    }
  }
};

export const userByScreenNamePayload = {
  data: {
    user: {
      result: trackedUser
    }
  }
};

export const favoritersPayload = {
  data: {
    favoriters_timeline: {
      timeline: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries: [
              userEntry(user({
                restId: 'fan-1',
                screenName: 'first_fan',
                name: 'First Fan',
                followers: 1000,
                blue: true,
                following: true,
                followedBy: false
              })),
              userEntry(user({
                restId: 'fan-2',
                screenName: 'second_fan',
                name: 'Second Fan',
                followers: 300,
                following: false,
                followedBy: true
              })),
              {
                content: {
                  __typename: 'TimelineTimelineCursor'
                }
              }
            ]
          }
        ]
      }
    }
  }
};

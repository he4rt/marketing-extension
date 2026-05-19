let store = {
  trackedHandle: '',
  endpoints: {},
  tweets: {},
  communityReplies: {},
  favoriters: {},
  accountInfo: null,
  lastUpdated: null
};

chrome.storage.local.get(['trackedHandle'], (result) => {
  if (result.trackedHandle) store.trackedHandle = result.trackedHandle;
});

function getEndpointStore(name) {
  if (!store.endpoints[name]) {
    store.endpoints[name] = { payloads: [], count: 0, lastSeen: null };
  }
  return store.endpoints[name];
}

function extractTweetData(result) {
  if (!result || result.__typename !== 'Tweet') return null;
  const legacy = result.legacy || {};
  const authorResult = result.core?.user_results?.result;
  const authorCore = authorResult?.core || {};
  const authorLegacy = authorResult?.legacy || {};
  const views = result.views || {};

  const isRetweet = !!legacy.retweeted_status_result;
  const isReply = !!legacy.in_reply_to_status_id_str;
  const isQuote = legacy.is_quote_status && !!legacy.quoted_status_id_str && !isRetweet;

  let type = 'original';
  if (isRetweet) type = 'retweet';
  else if (isReply) type = 'reply';
  else if (isQuote) type = 'quote';

  const sourceMatch = (result.source || '').match(/>([^<]+)</);

  return {
    tweet_id: legacy.id_str || result.rest_id,
    text: legacy.full_text || '',
    created_at: legacy.created_at || '',
    type,
    lang: legacy.lang || '',
    author: {
      screen_name: authorCore.screen_name || '',
      name: authorCore.name || '',
      rest_id: authorResult?.rest_id || '',
      avatar_url: authorResult?.avatar?.image_url || '',
      followers_count: authorLegacy.followers_count || 0,
      is_blue_verified: authorResult?.is_blue_verified || false,
    },
    metrics: {
      favorite_count: legacy.favorite_count || 0,
      retweet_count: legacy.retweet_count || 0,
      reply_count: legacy.reply_count || 0,
      quote_count: legacy.quote_count || 0,
      bookmark_count: legacy.bookmark_count || 0,
      view_count: parseInt(views.count) || 0,
    },
    hashtags: (legacy.entities?.hashtags || []).map(h => h.text),
    user_mentions: (legacy.entities?.user_mentions || []).map(m => ({ screen_name: m.screen_name, name: m.name })),
    media_count: (legacy.extended_entities?.media || legacy.entities?.media || []).length,
    urls: (legacy.entities?.urls || []).map(u => u.expanded_url || u.display_url),
    source: sourceMatch ? sourceMatch[1] : '',
    in_reply_to_tweet_id: legacy.in_reply_to_status_id_str || null,
    in_reply_to_screen_name: legacy.in_reply_to_screen_name || null,
    quoted_tweet_id: legacy.quoted_status_id_str || null,
    retweeted_tweet_id: isRetweet ? (legacy.retweeted_status_result?.result?.rest_id || null) : null,
  };
}

function processUserTweetsPayload(payload) {
  const handle = store.trackedHandle.toLowerCase();
  if (!handle) return;

  const instructions = payload?.data?.user?.result?.timeline?.timeline?.instructions || [];

  for (const instruction of instructions) {
    if (instruction.type === 'TimelinePinEntry' && instruction.entry) {
      processEntry(instruction.entry, handle);
    }
    if (instruction.type === 'TimelineAddEntries') {
      for (const entry of (instruction.entries || [])) {
        processEntry(entry, handle);
      }
    }
  }
}

function processEntry(entry, handle) {
  const content = entry?.content;
  if (!content) return;

  if (content.__typename === 'TimelineTimelineItem' && content.itemContent?.tweet_results?.result) {
    processTweetResult(content.itemContent.tweet_results.result, handle);
  }

  if (content.__typename === 'TimelineTimelineModule' && content.items) {
    for (const item of content.items) {
      const result = item?.item?.itemContent?.tweet_results?.result;
      if (result) processTweetResult(result, handle);
    }
  }
}

function processTweetResult(result, handle) {
  const tweet = extractTweetData(result);
  if (!tweet) return;

  const authorHandle = tweet.author.screen_name.toLowerCase();

  if (authorHandle === handle) {
    if (!store.accountInfo && tweet.author.rest_id) {
      const authorResult = result.core?.user_results?.result;
      const authorLegacy = authorResult?.legacy || {};
      store.accountInfo = {
        screen_name: tweet.author.screen_name,
        name: tweet.author.name,
        rest_id: tweet.author.rest_id,
        avatar_url: tweet.author.avatar_url,
        followers_count: authorLegacy.followers_count || 0,
        friends_count: authorLegacy.friends_count || 0,
        statuses_count: authorLegacy.statuses_count || 0,
        description: authorLegacy.description || '',
      };
    }

    if (tweet.type === 'retweet') {
      const original = result.legacy?.retweeted_status_result?.result;
      if (original) {
        const origTweet = extractTweetData(original);
        if (origTweet) {
          tweet.retweeted_tweet = {
            tweet_id: origTweet.tweet_id,
            text: origTweet.text,
            author: origTweet.author,
            metrics: origTweet.metrics,
          };
        }
      }
    }

    store.tweets[tweet.tweet_id] = tweet;
  }

  if (tweet.in_reply_to_screen_name?.toLowerCase() === handle && authorHandle !== handle) {
    store.communityReplies[tweet.tweet_id] = tweet;
  }
}

function processFavoritersPayload(payload) {
  const instructions = payload?.data?.favoriters_timeline?.timeline?.instructions || [];
  const users = [];
  for (const instruction of instructions) {
    for (const entry of (instruction?.entries || [])) {
      const content = entry?.content;
      if (content?.__typename !== 'TimelineTimelineItem') continue;
      const result = content?.itemContent?.user_results?.result;
      if (!result || result?.__typename !== 'User') continue;
      const core = result?.core || {};
      const legacy = result?.legacy || {};
      const rel = result?.relationship_perspectives || {};
      users.push({
        rest_id: result.rest_id || '',
        screen_name: core.screen_name || '',
        name: core.name || '',
        followers_count: legacy.followers_count || 0,
        is_blue_verified: result.is_blue_verified || false,
        following: rel.following || false,
        followed_by: rel.followed_by || false,
      });
    }
  }
  return users;
}

function buildExportJSON() {
  const tweets = Object.values(store.tweets).sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const replies = Object.values(store.communityReplies).sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const originalTweets = tweets.filter(t => t.type === 'original');
  const totalLikes = originalTweets.reduce((s, t) => s + t.metrics.favorite_count, 0);
  const totalViews = originalTweets.reduce((s, t) => s + t.metrics.view_count, 0);
  const totalReplies = originalTweets.reduce((s, t) => s + t.metrics.reply_count, 0);

  const uniqueEngagers = new Set();
  replies.forEach(r => uniqueEngagers.add(r.author.rest_id));
  Object.values(store.favoriters).flat().forEach(u => uniqueEngagers.add(u.rest_id));

  return {
    tracked_account: store.accountInfo || { screen_name: store.trackedHandle },
    exported_at: new Date().toISOString(),
    tweets,
    community_replies: replies,
    favoriters_by_tweet: store.favoriters,
    summary: {
      total_tweets: tweets.length,
      total_original: originalTweets.length,
      total_retweets: tweets.filter(t => t.type === 'retweet').length,
      total_quotes: tweets.filter(t => t.type === 'quote').length,
      total_replies_from_account: tweets.filter(t => t.type === 'reply').length,
      total_community_replies: replies.length,
      total_likes: totalLikes,
      total_views: totalViews,
      total_reply_engagement: totalReplies,
      avg_likes_per_original: originalTweets.length ? Math.round(totalLikes / originalTweets.length) : 0,
      avg_views_per_original: originalTweets.length ? Math.round(totalViews / originalTweets.length) : 0,
      unique_engagers: uniqueEngagers.size,
      top_tweet_by_likes: originalTweets.sort((a, b) => b.metrics.favorite_count - a.metrics.favorite_count)[0]?.tweet_id || null,
      top_tweet_by_views: originalTweets.sort((a, b) => b.metrics.view_count - a.metrics.view_count)[0]?.tweet_id || null,
    }
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GRAPHQL_CAPTURED') {
    const ep = getEndpointStore(request.endpoint);
    ep.payloads.push(request.payload);
    ep.count++;
    ep.lastSeen = request.timestamp;
    store.lastUpdated = request.timestamp;

    if (request.endpoint === 'UserTweets') {
      processUserTweetsPayload(request.payload);
    }

    if (request.endpoint === 'Favoriters') {
      const users = processFavoritersPayload(request.payload);
      const tweetIdMatch = (request.pageUrl || '').match(/status\/(\d+)/);
      if (tweetIdMatch && users.length) {
        const tweetId = tweetIdMatch[1];
        if (!store.favoriters[tweetId]) store.favoriters[tweetId] = [];
        const existing = new Set(store.favoriters[tweetId].map(u => u.rest_id));
        store.favoriters[tweetId].push(...users.filter(u => !existing.has(u.rest_id)));
      }
    }

    if (request.endpoint === 'UserByScreenName') {
      const user = request.payload?.data?.user?.result;
      if (user && store.trackedHandle && user.core?.screen_name?.toLowerCase() === store.trackedHandle.toLowerCase()) {
        const legacy = user.legacy || {};
        store.accountInfo = {
          screen_name: user.core.screen_name,
          name: user.core.name,
          rest_id: user.rest_id,
          avatar_url: user.avatar?.image_url || '',
          followers_count: legacy.followers_count || 0,
          friends_count: legacy.friends_count || 0,
          statuses_count: legacy.statuses_count || 0,
          description: legacy.description || '',
          is_blue_verified: user.is_blue_verified || false,
        };
      }
    }

    console.log(`[X Interceptor] ${request.endpoint} (tweets: ${Object.keys(store.tweets).length}, replies: ${Object.keys(store.communityReplies).length})`);
    sendResponse({ success: true });
  }

  if (request.action === 'SET_HANDLE') {
    store.trackedHandle = request.handle;
    chrome.storage.local.set({ trackedHandle: request.handle });
    store.tweets = {};
    store.communityReplies = {};
    store.favoriters = {};
    store.accountInfo = null;
    for (const ep of Object.values(store.endpoints)) {
      if (ep.payloads) {
        for (const payload of ep.payloads) {
          processUserTweetsPayload(payload);
        }
      }
    }
    sendResponse({ success: true, tweetCount: Object.keys(store.tweets).length });
  }

  if (request.action === 'GET_HANDLE') {
    sendResponse({ handle: store.trackedHandle });
  }

  if (request.action === 'GET_TWEETS') {
    const tweets = Object.values(store.tweets).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sendResponse({
      tweets,
      replyCount: Object.keys(store.communityReplies).length,
      accountInfo: store.accountInfo,
      lastUpdated: store.lastUpdated,
    });
  }

  if (request.action === 'GET_EXPORT') {
    sendResponse(buildExportJSON());
  }

  if (request.action === 'GET_ENDPOINTS') {
    const summary = {};
    for (const [name, ep] of Object.entries(store.endpoints)) {
      summary[name] = { count: ep.count, lastSeen: ep.lastSeen };
    }
    sendResponse({ endpoints: summary, lastUpdated: store.lastUpdated });
  }

  if (request.action === 'GET_ENDPOINT_PAYLOADS') {
    const ep = store.endpoints[request.endpoint];
    sendResponse({ payloads: ep ? ep.payloads : [] });
  }

  if (request.action === 'GET_ALL_RAW') {
    sendResponse({ endpoints: store.endpoints });
  }

  if (request.action === 'CLEAR_ALL') {
    store = { trackedHandle: store.trackedHandle, endpoints: {}, tweets: {}, communityReplies: {}, favoriters: {}, accountInfo: null, lastUpdated: null };
    sendResponse({ success: true });
  }

  return true;
});

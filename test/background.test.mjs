import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  alternateUserTweetsPayload,
  favoritersPayload,
  userByScreenNamePayload,
  userTweetsPayload
} from './fixtures/twitter-payloads.mjs';

async function loadBackground(storageState = {}) {
  const listeners = [];
  const storage = { ...storageState };
  const logs = [];
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        }
      }
    },
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          for (const key of keys) {
            if (Object.hasOwn(storage, key)) result[key] = storage[key];
          }
          callback(result);
        },
        set(values) {
          Object.assign(storage, values);
        }
      }
    }
  };

  const context = vm.createContext({
    chrome,
    console: {
      log(message) {
        logs.push(message);
      }
    },
    Date,
    Object,
    Set,
    parseInt
  });

  const source = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  vm.runInContext(source, context, { filename: 'background.js' });

  assert.equal(listeners.length, 1, 'background should register one message listener');

  async function sendMessage(request) {
    return await new Promise((resolve) => {
      listeners[0](request, { tab: { url: request.pageUrl } }, (response) => {
        resolve(JSON.parse(JSON.stringify(response)));
      });
    });
  }

  return { sendMessage, storage, logs };
}

test('loads persisted tracked handle and exposes it through GET_HANDLE', async () => {
  const app = await loadBackground({ trackedHandle: 'He4rtDevs' });

  const response = await app.sendMessage({ action: 'GET_HANDLE' });

  assert.deepEqual(response, { handle: 'He4rtDevs' });
});

test('captures UserTweets, parses nested timeline entries, and deduplicates by tweet id', async () => {
  const app = await loadBackground();

  await app.sendMessage({ action: 'SET_HANDLE', handle: 'He4rtDevs' });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'UserTweets',
    payload: userTweetsPayload,
    timestamp: '2026-05-20T12:00:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs'
  });

  const response = await app.sendMessage({ action: 'GET_TWEETS' });
  const tweetsById = Object.fromEntries(response.tweets.map((tweet) => [tweet.tweet_id, tweet]));

  assert.equal(response.tweets.length, 4);
  assert.equal(response.replyCount, 1);
  assert.equal(response.accountInfo.screen_name, 'He4rtDevs');
  assert.equal(tweetsById['100'].type, 'original');
  assert.equal(tweetsById['100'].media_count, 2);
  assert.deepEqual(tweetsById['100'].hashtags, ['He4rtDevelopers']);
  assert.equal(tweetsById['100'].metrics.view_count, 1000);
  assert.equal(tweetsById['101'].type, 'quote');
  assert.equal(tweetsById['102'].type, 'reply');
  assert.equal(tweetsById['103'].type, 'retweet');
  assert.equal(tweetsById['103'].retweeted_tweet.tweet_id, '800');
  assert.equal(response.lastUpdated, '2026-05-20T12:00:00.000Z');
});

test('captures UserByScreenName account metadata for the tracked handle', async () => {
  const app = await loadBackground();

  await app.sendMessage({ action: 'SET_HANDLE', handle: 'He4rtDevs' });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'UserByScreenName',
    payload: userByScreenNamePayload,
    timestamp: '2026-05-20T12:01:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs'
  });

  const response = await app.sendMessage({ action: 'GET_TWEETS' });

  assert.deepEqual(response.accountInfo, {
    screen_name: 'He4rtDevs',
    name: 'He4rt Developers',
    rest_id: 'tracked-1',
    avatar_url: 'https://img.example/He4rtDevs.jpg',
    followers_count: 20945,
    friends_count: 320,
    statuses_count: 2178,
    description: 'Open source community',
    is_blue_verified: true
  });
});

test('links Favoriters payloads to the tweet id parsed from the current page URL', async () => {
  const app = await loadBackground();

  await app.sendMessage({ action: 'SET_HANDLE', handle: 'He4rtDevs' });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'Favoriters',
    payload: favoritersPayload,
    timestamp: '2026-05-20T12:02:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs/status/100/likes'
  });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'Favoriters',
    payload: favoritersPayload,
    timestamp: '2026-05-20T12:03:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs/status/100/likes'
  });

  const exported = await app.sendMessage({ action: 'GET_EXPORT' });

  assert.equal(exported.favoriters_by_tweet['100'].length, 2);
  assert.deepEqual(
    exported.favoriters_by_tweet['100'].map((user) => user.screen_name),
    ['first_fan', 'second_fan']
  );
  assert.equal(exported.favoriters_by_tweet['100'][0].followers_count, 1000);
  assert.equal(exported.favoriters_by_tweet['100'][0].following, true);
});

test('reprocesses cached UserTweets payloads after SET_HANDLE changes', async () => {
  const app = await loadBackground();

  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'UserTweets',
    payload: userTweetsPayload,
    timestamp: '2026-05-20T12:04:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs'
  });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'UserTweets',
    payload: alternateUserTweetsPayload,
    timestamp: '2026-05-20T12:05:00.000Z',
    pageUrl: 'https://x.com/OtherHandle'
  });

  const setResponse = await app.sendMessage({ action: 'SET_HANDLE', handle: 'OtherHandle' });
  const response = await app.sendMessage({ action: 'GET_TWEETS' });

  assert.equal(setResponse.tweetCount, 1);
  assert.equal(response.tweets.length, 1);
  assert.equal(response.tweets[0].tweet_id, '300');
  assert.equal(response.tweets[0].author.screen_name, 'OtherHandle');
  assert.equal(app.storage.trackedHandle, 'OtherHandle');
});

test('builds export JSON summary and raw endpoint views', async () => {
  const app = await loadBackground();

  await app.sendMessage({ action: 'SET_HANDLE', handle: 'He4rtDevs' });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'UserTweets',
    payload: userTweetsPayload,
    timestamp: '2026-05-20T12:06:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs'
  });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'Favoriters',
    payload: favoritersPayload,
    timestamp: '2026-05-20T12:07:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs/status/100/likes'
  });

  const endpoints = await app.sendMessage({ action: 'GET_ENDPOINTS' });
  const userTweetPayloads = await app.sendMessage({
    action: 'GET_ENDPOINT_PAYLOADS',
    endpoint: 'UserTweets'
  });
  const allRaw = await app.sendMessage({ action: 'GET_ALL_RAW' });
  const exported = await app.sendMessage({ action: 'GET_EXPORT' });

  assert.deepEqual(Object.keys(endpoints.endpoints).sort(), ['Favoriters', 'UserTweets']);
  assert.equal(endpoints.endpoints.UserTweets.count, 1);
  assert.equal(userTweetPayloads.payloads.length, 1);
  assert.equal(allRaw.endpoints.Favoriters.count, 1);

  assert.equal(exported.tracked_account.screen_name, 'He4rtDevs');
  assert.equal(exported.tweets.length, 4);
  assert.equal(exported.community_replies.length, 1);
  assert.equal(exported.summary.total_tweets, 4);
  assert.equal(exported.summary.total_original, 1);
  assert.equal(exported.summary.total_retweets, 1);
  assert.equal(exported.summary.total_quotes, 1);
  assert.equal(exported.summary.total_replies_from_account, 1);
  assert.equal(exported.summary.total_community_replies, 1);
  assert.equal(exported.summary.total_likes, 15);
  assert.equal(exported.summary.total_views, 1000);
  assert.equal(exported.summary.total_reply_engagement, 2);
  assert.equal(exported.summary.avg_likes_per_original, 15);
  assert.equal(exported.summary.avg_views_per_original, 1000);
  assert.equal(exported.summary.unique_engagers, 3);
  assert.equal(exported.summary.top_tweet_by_likes, '100');
  assert.equal(exported.summary.top_tweet_by_views, '100');
});

test('CLEAR_ALL resets captured data but keeps the tracked handle', async () => {
  const app = await loadBackground();

  await app.sendMessage({ action: 'SET_HANDLE', handle: 'He4rtDevs' });
  await app.sendMessage({
    action: 'GRAPHQL_CAPTURED',
    endpoint: 'UserTweets',
    payload: userTweetsPayload,
    timestamp: '2026-05-20T12:08:00.000Z',
    pageUrl: 'https://x.com/He4rtDevs'
  });
  await app.sendMessage({ action: 'CLEAR_ALL' });

  const tweets = await app.sendMessage({ action: 'GET_TWEETS' });
  const endpoints = await app.sendMessage({ action: 'GET_ENDPOINTS' });
  const handle = await app.sendMessage({ action: 'GET_HANDLE' });

  assert.equal(tweets.tweets.length, 0);
  assert.equal(tweets.replyCount, 0);
  assert.deepEqual(endpoints.endpoints, {});
  assert.deepEqual(handle, { handle: 'He4rtDevs' });
});

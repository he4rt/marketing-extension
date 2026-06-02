# Exported Data Structure (V3)

This document describes the JSON structure returned by `GET_EXPORT`.

## Top-Level Shape

```json
{
  "schema_version": 3,
  "meta": { ... },
  "per_platform": {
    "x": { ... },
    "instagram": { ... },
    "linkedin": { ... }
  },
  "unified": { ... }
}
```

---

## `meta`

```json
{
  "exported_at": "2026-06-02T12:00:00.000Z",
  "handles": {
    "x": "@handle",
    "instagram": "handle",
    "linkedin": "Company Name"
  },
  "profiles": {
    "x": { ... },
    "instagram": { ... },
    "linkedin": { ... }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `exported_at` | string | ISO 8601 timestamp of export |
| `handles` | object | Tracked handles per platform |
| `profiles` | object | Tracked account profiles, keyed by platform |

---

## `per_platform.x`

```json
{
  "content": [ TweetData[] ],
  "engagers": {
    "likes_by_tweet": { "tweet_id": [ Favoriter[] ] },
    "replies": [ SocialPublication[] ]
  }
}
```

### Content item — `TweetData`

```json
{
  "tweet_id": "123456789",
  "text": "Tweet content",
  "created_at": "Mon May 25 12:00:00 +0000 2026",
  "type": "original",
  "lang": "en",
  "author": { ... },
  "metrics": {
    "favorite_count": 100,
    "retweet_count": 20,
    "reply_count": 5,
    "quote_count": 3,
    "bookmark_count": 10,
    "view_count": 5000
  },
  "hashtags": ["example"],
  "user_mentions": [ ... ],
  "media_count": 1,
  "urls": [ ... ],
  "source": "Twitter for iPhone",
  "in_reply_to_tweet_id": null,
  "in_reply_to_screen_name": null,
  "quoted_tweet_id": null,
  "retweeted_tweet_id": null,
  "retweeted_tweet": null
}
```

### `likes_by_tweet`

Keyed by tweet ID. Each entry is an array of `Favoriter` objects:

```json
{
  "rest_id": "987654321",
  "screen_name": "follower",
  "name": "Follower Name",
  "followers_count": 200,
  "is_blue_verified": false,
  "following": false,
  "followed_by": true
}
```

### `replies`

Array of `SocialPublication` objects — replies to the tracked account from other users.

---

## `per_platform.instagram`

```json
{
  "content": [
    {
      "publication_id": "391",
      "shortcode": "ABC123",
      "text": "Post caption...",
      "created_at": "...",
      "type": "image",
      "author": { ... },
      "metrics": { "like_count": 100, "comment_count": 10, "view_count": 5000 },
      "engagers": {
        "likes": [ SocialActor[] ],
        "comments": [ ExportComment[] ]
      }
    }
  ]
}
```

### Content item

Extends `SocialPublication` with inline `engagers`. Fields are the standard social
publication fields (author, text, metrics, hashtags, etc).

### `engagers.likes`

Array of `SocialActor` — users who liked the post.

```json
{
  "provider": "instagram",
  "provider_user_id": "ig-2",
  "username": "community_member",
  "name": "Community Member",
  "avatar_url": "https://..."
}
```

### `engagers.comments`

Array of `ExportComment` — nested comment tree. Replies are nested inside their
parent comment.

```json
[
  {
    "comment_id": "comment-1",
    "author": { ... },
    "text": "Great post!",
    "created_at": "...",
    "like_count": 2,
    "replies": [
      {
        "comment_id": "comment-2",
        "author": { ... },
        "text": "Thanks!",
        "like_count": 1,
        "replies": []
      }
    ]
  }
]
```

---

## `per_platform.linkedin`

```json
{
  "content": [
    {
      "id": "urn:li:fsd_update:(...)",
      "activity_urn": "urn:li:activity:...",
      "share_urn": "urn:li:ugcPost:...",
      "text": "Post content...",
      "type": "original",
      "author": { ... },
      "metrics": {
        "like_count": 207,
        "comment_count": 12,
        "share_count": 5,
        "total_reactions": 207,
        "reaction_breakdown": { "LIKE": 155, "PRAISE": 26 }
      },
      "hashtags": ["laravel"],
      "media": [ ... ],
      "engagers": {
        "reactions": [ LinkedInReactionUser[] ],
        "reposts": [ LinkedInRepostEntry[] ],
        "comments": [ ExportComment[] ]
      },
      "engagement_metrics": { ... }
    }
  ]
}
```

### Content item

Extends `LinkedInPostData` with inline `engagers` and `engagement_metrics`.

### `engagers.reactions`

```json
[
  {
    "urn": "urn:li:member:123",
    "name": "User Name",
    "headline": "Job Title",
    "avatar_url": "https://...",
    "navigation_url": "https://www.linkedin.com/in/...",
    "reaction_type": "LIKE"
  }
]
```

### `engagers.reposts`

Mixed array: header entries (simple user repost) and actor entries (reshared post).

**Header entry:**
```json
{
  "urn": "urn:li:member:...",
  "name": "User Name",
  "avatar_url": "https://...",
  "profile_link": "https://..."
}
```

**Actor entry (reshared post):**
```json
{
  "id": "urn:li:fsd_update:(...)",
  "activity_urn": "urn:li:activity:...",
  "text": "Reshared post text",
  "author": { ... },
  "metrics": { "like_count": 10, ... },
  "post_not_found": true
}
```

### `engagers.comments`

Same `ExportComment` structure as Instagram, with additional optional fields:

```json
{
  "comment_id": "urn:li:fsd_comment:(...)",
  "author": { ... },
  "text": "Comment text",
  "created_at": "...",
  "reactions": {
    "total": 2,
    "types": [{ "type": "LIKE", "count": 1 }, { "type": "EMPATHY", "count": 1 }]
  },
  "reaction_users": [ SocialActor[] ],
  "replies": [ ... ]
}
```

### `engagement_metrics`

Computed from captured interaction data:

| Field | Description |
|---|---|
| `real_comments` | Count of depth-0 (top-level) comments |
| `replies` | Count of all nested replies |
| `unique_commenters_count` | Unique commenter URNs |
| `unique_reacters_count` | Unique reactor URNs (post + comment reactions) |
| `unique_engagers_count` | Unique URNs across all interaction types |
| `audience_interactions` | `unique_engagers_count` minus tracked account URN |

---

## `unified`

### `unified.summary.all`

```json
{
  "total_content": 15,
  "total_likes": 500,
  "total_comments": 30,
  "unique_engagers": 42
}
```

### `unified.summary.by_platform`

Platform-specific summary objects:

**X:**
```json
{
  "total_content": 5,
  "total_likes": 200,
  "total_retweets": 20,
  "total_replies": 5,
  "total_quotes": 3,
  "total_bookmarks": 10,
  "total_views": 5000
}
```

**Instagram:**
```json
{
  "total_content": 3,
  "total_likes": 100,
  "total_comments": 10,
  "total_views": 5000
}
```

**LinkedIn:**
```json
{
  "total_content": 7,
  "total_likes": 200,
  "total_comments": 12,
  "total_shares": 5,
  "total_reaction_users": 45,
  "total_repost_users": 12,
  "total_comment_items": 30,
  "total_comment_reaction_users": 8,
  "total_audience_interactions": 80
}
```

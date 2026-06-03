import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import { extractInstagramComments, extractInstagramPublications } from "../src/providers/instagram/parser";
import { instagramCommentsPayload, instagramFeedPayload } from "./fixtures/instagram-payloads";

describe("trace", () => {
  test("comments", () => {
    const store = createStore();
    function send(req: any) {
      return handleRuntimeMessage(store, req, {
        log: () => {},
        persistHandle: () => {},
      });
    }

    send({ action: "SET_HANDLE", handle: "he4rtdevs" });

    send({
      action: "CAPTURED_PAYLOAD",
      provider: "instagram",
      endpoint: "InstagramFeedTimeline",
      payload: instagramFeedPayload,
      timestamp: "2026-05-20T13:00:00.000Z",
      pageUrl: "https://www.instagram.com/",
    });

    const pubs = extractInstagramPublications(instagramFeedPayload);
    console.log("Feed pubs:", pubs.map((p) => ({ id: p.publication_id, sc: p.shortcode, author: p.author.username })));

    const istore = store.platforms.instagram;
    console.log("Platform pubs:", Object.keys(istore.publications));
    console.log("Platform pubIdsBySc:", Object.keys(istore.publicationIdsByShortcode));

    const comments = extractInstagramComments(instagramCommentsPayload, "https://www.instagram.com/p/ABC123/");
    console.log("Extracted comments:", comments.map((c) => ({ id: c.comment_id, pubId: c.publication_id })));

    send({
      action: "CAPTURED_PAYLOAD",
      provider: "instagram",
      endpoint: "InstagramComments",
      payload: instagramCommentsPayload,
      timestamp: "2026-05-20T13:02:00.000Z",
      pageUrl: "https://www.instagram.com/p/ABC123/",
    });

    const resp = send({ action: "GET_PUBLICATIONS" }) as any;
    console.log("commentsCount:", resp.commentsCount);
    console.log("Platform commentsByPub keys:", Object.keys(istore.commentsByPublication));

    expect(resp.commentsCount).toBe(2);
  });
});

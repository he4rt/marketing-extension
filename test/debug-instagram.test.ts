import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import { extractInstagramComments } from "../src/providers/instagram/parser";
import {
  instagramCommentsPayload,
  instagramFeedPayload,
} from "./fixtures/instagram-payloads";

describe("debug instagram comments", () => {
  test("trace comment capture flow", () => {
    const store = createStore();
    function send(req: any) {
      return JSON.parse(
        JSON.stringify(
          handleRuntimeMessage(store, req, {
            log: (m: string) => console.log("[log]", m),
            persistHandle: (h: string) => {},
          }),
        ),
      );
    }

    send({ action: "SET_HANDLE", handle: "he4rtdevs" });

    console.log("publicationIdsByShortcode:", store.instagramPublicationIdsByShortcode);
    console.log("platform pubIds:", store.platforms.instagram.publicationIdsByShortcode);

    send({
      action: "CAPTURED_PAYLOAD",
      provider: "instagram",
      endpoint: "InstagramFeedTimeline",
      payload: instagramFeedPayload,
      timestamp: "2026-05-20T13:00:00.000Z",
      pageUrl: "https://www.instagram.com/",
    });

    console.log("After feed, publications:", Object.keys(store.publications));
    console.log("After feed, platform pubs:", Object.keys(store.platforms.instagram.publications));
    console.log("After feed, pubIdsByShortcode:", store.instagramPublicationIdsByShortcode);
    console.log("After feed, platform pubIdsByShortcode:", store.platforms.instagram.publicationIdsByShortcode);

    const comments = extractInstagramComments(
      instagramCommentsPayload,
      "https://www.instagram.com/p/ABC123/",
    );
    console.log(
      "Extracted comments pubIds:",
      comments.map((c) => ({ id: c.comment_id, pubId: c.publication_id })),
    );

    send({
      action: "CAPTURED_PAYLOAD",
      provider: "instagram",
      endpoint: "InstagramComments",
      payload: instagramCommentsPayload,
      timestamp: "2026-05-20T13:02:00.000Z",
      pageUrl: "https://www.instagram.com/p/ABC123/",
    });

    const pubs = send({ action: "GET_PUBLICATIONS" }) as any;
    console.log("commentsCount:", pubs.commentsCount);
    console.log("all comments keys:", Object.keys(store.commentsByPublication));
    console.log("platform comments keys:", Object.keys(store.platforms.instagram.commentsByPublication));

    // If this is 0, we know the filter is blocking
    expect(pubs.commentsCount).toBe(2);
  });
});

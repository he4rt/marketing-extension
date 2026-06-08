import type { BackgroundStore } from "../../../shared/domain";
import type { CapturedPayloadMessage } from "../../../shared/messages";
import { processLinkedInSearchCapture } from "../search/process";
import { SEARCH_ENDPOINT } from "../shared";
import { processCommentsCapture } from "./comments";
import { processFeedCapture } from "./feed";
import { processReactionsCapture } from "./reactions";
import { processRepostsCapture } from "./reposts";

export type EndpointProcessor = {
  endpoint: string;
  process: (store: BackgroundStore, request: CapturedPayloadMessage) => void;
};

const PROCESSORS: EndpointProcessor[] = [
  { endpoint: SEARCH_ENDPOINT, process: processLinkedInSearchCapture },
  { endpoint: "feedDashOrganizationalPageUpdates", process: processFeedCapture },
  { endpoint: "socialDashReactions", process: processReactionsCapture },
  { endpoint: "feedDashReshareFeed", process: processRepostsCapture },
  { endpoint: "socialDashComments", process: processCommentsCapture },
];

export const registry: Record<string, EndpointProcessor> = {};
for (const p of PROCESSORS) {
  registry[p.endpoint] = p;
}

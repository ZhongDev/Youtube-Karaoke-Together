import { describe, expect, it } from "vitest";
import { reorderQueueForDrag } from "./queueOrdering";

const queue = [
  { queueId: "1", controllerId: "a" },
  { queueId: "2", controllerId: "b" },
  { queueId: "3", controllerId: "a" },
  { queueId: "4", controllerId: "b" },
];

describe("controller queue drag ordering", () => {
  it("reorders the full pending queue when round-robin is disabled", () => {
    const result = reorderQueueForDrag(queue, "1", "4", false, "a");
    expect(result.orderedQueueIds).toEqual(["2", "3", "4", "1"]);
    expect(result.queue.map((item) => item.queueId)).toEqual(result.orderedQueueIds);
  });

  it("only changes the requesting controller personal order in round-robin mode", () => {
    const result = reorderQueueForDrag(queue, "1", "3", true, "a");
    expect(result.orderedQueueIds).toEqual(["3", "1"]);
    expect(result.queue.map((item) => item.queueId)).toEqual(["3", "2", "1", "4"]);
  });

  it("ignores drops outside the permitted round-robin scope", () => {
    expect(reorderQueueForDrag(queue, "1", "2", true, "a")).toBeNull();
  });
});

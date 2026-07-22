function queueId(item) {
  return String(item.queueId);
}

function move(items, from, to) {
  const reordered = [...items];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  return reordered;
}

export function reorderQueueForDrag(queue, activeId, overId, roundRobinEnabled, controllerId) {
  const scopedItems = roundRobinEnabled
    ? queue.filter((item) => item.controllerId === controllerId)
    : queue;
  const from = scopedItems.findIndex((item) => queueId(item) === String(activeId));
  const to = scopedItems.findIndex((item) => queueId(item) === String(overId));
  if (from < 0 || to < 0 || from === to) return null;

  const reorderedScope = move(scopedItems, from, to);
  if (!roundRobinEnabled) {
    return { queue: reorderedScope, orderedQueueIds: reorderedScope.map(queueId) };
  }

  let ownedIndex = 0;
  return {
    queue: queue.map((item) => item.controllerId === controllerId ? reorderedScope[ownedIndex++] : item),
    orderedQueueIds: reorderedScope.map(queueId),
  };
}

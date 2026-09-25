import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimItems,
  fetchBatches,
  fetchDiff,
  fetchText,
  fetchItem,
  fetchMyItems,
  saveDecision,
  type DecisionInput,
  type DiffGranularity,
  type MyItemsState,
  type ReviewItem,
} from '../api/review';
import { batchNames } from '../utils';

/** Root key for every review query; use with invalidateQueries. */
export const reviewQueryKeyRoot = ['dedup-review'] as const;

const keys = {
  batches: [...reviewQueryKeyRoot, 'batches'] as const,
  myItemsRoot: [...reviewQueryKeyRoot, 'my-items'] as const,
  myItems: (state: MyItemsState, batchId?: string) =>
    [...reviewQueryKeyRoot, 'my-items', state, batchId ?? 'all-batches'] as const,
  item: (itemId: number) => [...reviewQueryKeyRoot, 'item', itemId] as const,
  text: (mwId: string) => [...reviewQueryKeyRoot, 'text', mwId] as const,
  diff: (a: string, b: string, g: DiffGranularity) => [...reviewQueryKeyRoot, 'diff', a, b, g] as const,
};

export function useBatches() {
  return useQuery({
    queryKey: keys.batches,
    queryFn: ({ signal }) => fetchBatches({ signal }),
  });
}

/** The batch row from the batch list (there is no single-batch endpoint). */
export function useBatch(batchId: string | undefined) {
  const batches = useBatches();
  return { ...batches, data: batches.data?.find((b) => b.batch_id === batchId) };
}

/** `batch_id` -> "First batch", "Second batch", … by the order batches were added.
 * Falls back to the raw id until the batch list has loaded. */
export function useBatchName() {
  const { data } = useBatches();
  const names = useMemo(() => batchNames(data ?? []), [data]);
  return useCallback((batchId: string) => names[batchId] ?? batchId, [names]);
}

/** This user's items, oldest first; all batches unless one is given. */
export function useMyItems(state: MyItemsState = 'all', batchId?: string) {
  return useQuery({
    queryKey: keys.myItems(state, batchId),
    queryFn: ({ signal }) => fetchMyItems(state, batchId, { signal }),
  });
}

/** Returns the user's unfinished items instead while there still are some. */
export function useClaimItems(batchId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => claimItems(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.myItemsRoot });
      queryClient.invalidateQueries({ queryKey: keys.batches });
    },
  });
}

/**
 * Shown straight from the my-items list. The item endpoint is only called for a deep
 * link, or on the first opening, which the backend records as `first_opened_at`.
 */
export function useItem(itemId: number | undefined) {
  const queryClient = useQueryClient();
  const valid = itemId != null && !Number.isNaN(itemId);
  const fromList = valid
    ? queryClient
        .getQueriesData<ReviewItem[]>({ queryKey: keys.myItemsRoot })
        .flatMap(([, data]) => data ?? [])
        .find((it) => it.item_id === itemId)
    : undefined;
  const alreadyOpened = Boolean(fromList?.assignment?.first_opened_at);
  return useQuery({
    queryKey: keys.item(itemId ?? 0),
    queryFn: ({ signal }) => fetchItem(itemId!, { signal }),
    enabled: valid && !alreadyOpened,
    initialData: fromList,
    // A list copy counts as old, so a first opening still reaches the backend once;
    // after that the item stays cached (saves update it in place).
    initialDataUpdatedAt: 0,
    staleTime: Infinity,
  });
}

/** The response is the updated item, so it replaces the cached copies directly. */
export function useSaveDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, fields }: { itemId: number; fields: DecisionInput }) =>
      saveDecision(itemId, fields),
    onSuccess: (updated: ReviewItem) => {
      queryClient.setQueryData(keys.item(updated.item_id), updated);
      queryClient.setQueriesData<ReviewItem[]>({ queryKey: keys.myItemsRoot }, (data) =>
        data?.map((it) => (it.item_id === updated.item_id ? updated : it)),
      );
      queryClient.invalidateQueries({ queryKey: keys.myItemsRoot });
      queryClient.invalidateQueries({ queryKey: keys.batches });
    },
  });
}

/** Only fetched when `enabled`. */
export function useFullText(mwId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.text(mwId ?? ''),
    queryFn: ({ signal }) => fetchText(mwId!, { signal }),
    enabled: Boolean(mwId) && enabled,
    staleTime: Infinity,
  });
}

/** Only fetched when `enabled`. */
export function useTextDiff(a: string | undefined, b: string | undefined, granularity: DiffGranularity, enabled = true) {
  return useQuery({
    queryKey: keys.diff(a ?? '', b ?? '', granularity),
    queryFn: ({ signal }) => fetchDiff(a!, b!, granularity, { signal }),
    enabled: Boolean(a && b) && enabled,
    staleTime: Infinity,
  });
}

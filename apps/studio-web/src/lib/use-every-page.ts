'use client'

import { useEffect } from 'react'

/**
 * Every page of a listing, one after another.
 *
 * For the lists that are searched, filtered or counted where they are read:
 * stopping at the first page would hide what the second holds, and a count
 * over half a list is a wrong count. It stops at an error, so a page that
 * fails is asked for again only when somebody asks.
 */
export function useEveryPage(query: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isError: boolean
  fetchNextPage: () => unknown
}): void {
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])
}

/**
 * The notices kept for a person in Space: `OP-IDN-074` lists them and `OP-IDN-075` marks
 * one read. ADR-054, `HU-SP-091`.
 *
 * A notice is written by the database in the transaction of the event that causes it; no
 * client writes one. It holds no words: the app writes the sentence in her language from
 * the kind and the names. Whether it awaits her decision is read from its subject at list
 * time, never stored.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { BodyProgressHolder } from './body-progress.js'

export type SpaceNotice = AllfitV1Schemas['SpaceNotice']
export type SpaceNoticeFilter = 'all' | 'awaiting'

export const NOTICE_FILTERS: readonly SpaceNoticeFilter[] = ['all', 'awaiting']
export const NOTICE_PAGE_SIZE = 30

/** Where the next page starts: after this notice, in newest-first order. */
export interface SpaceNoticeCursor {
  occurredAt: string
  noticeId: string
}

export interface SpaceNoticeListInput {
  filter: SpaceNoticeFilter
  after?: SpaceNoticeCursor
}

export interface SpaceNoticeDatabasePage {
  items: SpaceNotice[]
  has_more: boolean
  awaiting_count: number
  unread_count: number
}

type Holder = BodyProgressHolder & { requestId: string }

export interface SpaceNoticesDatabase {
  list(input: Holder & SpaceNoticeListInput & { limit: number }): Promise<SpaceNoticeDatabasePage>
  markRead(input: Holder & { noticeId: string }): Promise<SpaceNotice>
}

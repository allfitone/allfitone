/**
 * A person's notices in Space, listed and marked read as herself (`OP-IDN-074`,
 * `OP-IDN-075`).
 *
 * The page size is the operation's, not the caller's: thirty, newest first. Which
 * notices are hers, which await her and the names they carry are the database's to say.
 */

import type { VerifiedToken } from '@allfitone/auth-provider'

import {
  NOTICE_PAGE_SIZE,
  type SpaceNotice,
  type SpaceNoticeDatabasePage,
  type SpaceNoticeListInput,
  type SpaceNoticesDatabase,
} from '../domain/space-notices.js'

export interface SpaceNoticesService {
  /** `OP-IDN-074`. */
  list(token: VerifiedToken, input: SpaceNoticeListInput): Promise<SpaceNoticeDatabasePage>
  /** `OP-IDN-075`. */
  markRead(token: VerifiedToken, noticeId: string): Promise<SpaceNotice>
}

export function createSpaceNoticesService(dependencies: {
  database: SpaceNoticesDatabase
  issuer: string
  requestId: () => string
}): SpaceNoticesService {
  const holder = (token: VerifiedToken) => ({
    issuer: dependencies.issuer,
    subject: String(token.subject),
    requestId: dependencies.requestId(),
  })

  return {
    list: (token, input) =>
      dependencies.database.list({ ...holder(token), ...input, limit: NOTICE_PAGE_SIZE }),
    markRead: (token, noticeId) => dependencies.database.markRead({ ...holder(token), noticeId }),
  }
}

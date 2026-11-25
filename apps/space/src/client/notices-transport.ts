/**
 * The native half of «Avisos»: the stored session and the bearer header. Split from
 * `notices.ts` so that file stays loadable by the test runner.
 *
 * Marking a notice read carries no command headers: reading twice answers the same, and
 * the contract asks for none (`OP-IDN-075`).
 */

import { authorizedGet, authorizedPost } from './index'
import { noticesPath, type Notice, type NoticeFilter, type NoticePage } from './notices'
import { authenticated } from './session'

export const noticesApi = {
  list: (filter: NoticeFilter, cursor?: string): Promise<NoticePage> =>
    authenticated((token) => authorizedGet<NoticePage>(noticesPath(filter, cursor), token)),

  markRead: (noticeId: string): Promise<Notice> =>
    authenticated((token) =>
      authorizedPost<Notice>(`/space/v1/notices/${noticeId}/read`, undefined, undefined, token),
    ),
}

/**
 * The native half of «Importar historial»: the stored session, the bearer header,
 * `expo-crypto` and the document picker. Split from `history-import.ts` so that file
 * stays loadable by the test runner.
 *
 * Staging takes a new command each time: the server recognises the same file by its
 * hash and answers the import already alive, so a second upload cannot make a second
 * import. Each part of a commit is a new command too: a part is short, and if its answer
 * is lost the next call simply goes on from where the server stopped. Undoing holds one
 * command per import until it is answered, so a retry replays instead of conflicting.
 */

import { newCommand, type CommandHeaders } from '@allfitone/contracts/commands'
import * as Crypto from 'expo-crypto'
import * as DocumentPicker from 'expo-document-picker'

import { authorizedGet, authorizedPost } from './index'
import { authenticated } from './session'
import type { HistoryImport, HistoryImportChoice } from './history-import'

// A heavy history is a megabyte to send, which a slow connection takes a while to carry.
const STAGE_TIMEOUT_MS = 60_000

const pending = new Map<string, CommandHeaders>()

const command = () =>
  newCommand(
    { randomBytes: (length) => Crypto.getRandomValues(new Uint8Array(length)) },
    Date.now(),
  )

function held(key: string): CommandHeaders {
  const existing = pending.get(key) ?? command()
  pending.set(key, existing)
  return existing
}

/** The chosen file's text, or null when the person backed out of the picker. */
export async function pickHistoryFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Android names a CSV in several ways, and some file managers call it plain text.
    type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled) return null
  const [asset] = result.assets
  if (!asset) return null
  // A local file URI on a device and a blob URL on the web: fetch reads both.
  return (await fetch(asset.uri)).text()
}

export const historyImports = {
  stage: (content: string, timezone: string): Promise<HistoryImport> =>
    authenticated((token) =>
      authorizedPost<HistoryImport>(
        '/space/v1/history-imports',
        command(),
        { timezone, content },
        token,
        undefined,
        STAGE_TIMEOUT_MS,
      ),
    ),

  read: (importId: string): Promise<HistoryImport> =>
    authenticated((token) =>
      authorizedGet<HistoryImport>(`/space/v1/history-imports/${importId}`, token),
    ),

  list: async (): Promise<readonly HistoryImport[]> =>
    (
      await authenticated((token) =>
        authorizedGet<{ data: HistoryImport[] }>('/space/v1/history-imports', token),
      )
    ).data,

  /** One part: at most 25 sessions. `commitAll` repeats it until nothing is pending. */
  commit: (
    importId: string,
    timezone: string,
    choices: HistoryImportChoice[],
  ): Promise<HistoryImport> =>
    authenticated((token) =>
      authorizedPost<HistoryImport>(
        `/space/v1/history-imports/${importId}/commit`,
        command(),
        { timezone, choices },
        token,
      ),
    ),

  async undo(importId: string): Promise<HistoryImport> {
    const key = `undo:${importId}`
    const result = await authenticated((token) =>
      authorizedPost<HistoryImport>(
        `/space/v1/history-imports/${importId}/undo`,
        held(key),
        undefined,
        token,
      ),
    )
    pending.delete(key)
    return result
  },
}

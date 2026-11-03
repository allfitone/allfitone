import { StudioEntry } from '@/components/studio-entry'

/**
 * The workspace entry, where signing in returns. It asks the API who is here
 * and sends each person on: activation, a first space, a choice of
 * organization or straight to their workspace. Without a session it returns
 * to the landing at `/`.
 */
export default function StudioEntryPage() {
  return <StudioEntry />
}

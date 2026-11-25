/**
 * The page a client invitation email opens: `/{lang}/client-invitations#token=…` (TECH-360).
 *
 * The invitation is decided in Allfit Space, never here. The page calls no API and names
 * no gym: it hands the token to the app, and says what to do on a computer or when the
 * link arrived cut short. The token has the waitlist links' shape, so it is read the same.
 */

export const CLIENT_INVITATION_PATH = '/client-invitations'

/** The link the app opens itself on; the token stays in the fragment there too. */
export const appLink = (token: string): string => `allfitspace://client-invitations#token=${token}`

/**
 * Whether this device can run Allfit Space. iPadOS presents itself as a Mac, so touch is
 * what tells a tablet from a computer.
 */
export function canOpenApp(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

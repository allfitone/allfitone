/**
 * Disposable email providers the waitlist refuses (HU-SP-115, criterion 6).
 *
 * Kept here as data and updated by hand, not taken from a dependency (ADR-050,
 * decision 2). It is not exhaustive and does not try to be: it stops the casual case,
 * and the Backoffice fraud mark handles what gets through. A subdomain of a listed
 * domain is refused with it.
 */

const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'airmail.cc',
  'anonaddy.me',
  'burnermail.io',
  'byom.de',
  'chacuo.net',
  'cock.li',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'emailfake.com',
  'fakeinbox.com',
  'fakemail.net',
  'fakemailgenerator.com',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'inboxbear.com',
  'inboxkitten.com',
  'incognitomail.org',
  'jetable.org',
  'mail-temp.com',
  'mail.tm',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailnesia.com',
  'mailsac.com',
  'mailtemp.info',
  'minuteinbox.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'nada.email',
  'pokemail.net',
  'sharklasers.com',
  'spam4.me',
  'spambog.com',
  'spambox.us',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'tmail.ws',
  'tmpmail.net',
  'tmpmail.org',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'trbvm.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
])

/** Whether the address belongs to a listed provider, or to a subdomain of one. */
export function isDisposableEmail(email: string): boolean {
  const labels = email.trim().toLowerCase().split('@').at(-1)?.split('.') ?? []
  for (let start = 0; start < labels.length - 1; start += 1) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(start).join('.'))) return true
  }
  return false
}

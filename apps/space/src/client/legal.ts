/**
 * Allfit One's legal documents. They live on www.allfit.one, one set for every
 * product, in the app's language. The analytics notice's address comes from
 * `@allfitone/telemetry`, next to the consent version it belongs to.
 *
 * Duplicated on purpose in `apps/space-web` and `apps/studio-web`: three
 * addresses do not earn a package, and an app never imports another.
 */
export const LEGAL_URLS = {
  terms: 'https://www.allfit.one/es/legal/terms',
  privacy: 'https://www.allfit.one/es/legal/privacy',
} as const

/**
 * Studio's theme: dark, unless the person chose light.
 *
 * The choice belongs to her account, so it follows her to another browser. A
 * page that is served before anyone is known cannot ask the account in time
 * for its first frame, so this browser remembers the last answer the account
 * gave and a script that opens the document body shows it before anything paints.
 *
 * The landing takes no part in this. It has its own root layout and its own
 * look, and it never mounts the script.
 */
export type StudioTheme = 'dark' | 'light'

export const STUDIO_DEFAULT_THEME: StudioTheme = 'dark'
export const STUDIO_THEME_STORAGE_KEY = 'allfit-studio-theme:v1'

const THEME_ATTRIBUTE = 'data-afo-theme'
const THEME_EVENT = 'allfit:studio-theme'

export function isStudioTheme(value: unknown): value is StudioTheme {
  return value === 'dark' || value === 'light'
}

/** What the account answered last time on this browser, if it ever did. */
export function rememberedStudioTheme(): StudioTheme | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const stored = localStorage.getItem(STUDIO_THEME_STORAGE_KEY)
    return isStudioTheme(stored) ? stored : undefined
  } catch {
    // A disabled store is a browser that remembers nothing: the default shows.
    return undefined
  }
}

/** `null` forgets it, for a person whose account holds no choice. */
export function rememberStudioTheme(theme: StudioTheme | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (theme === null) localStorage.removeItem(STUDIO_THEME_STORAGE_KEY)
    else localStorage.setItem(STUDIO_THEME_STORAGE_KEY, theme)
  } catch {
    // Nothing to do: the account still holds the choice.
  }
}

/** The theme the document is showing right now. */
export function shownStudioTheme(): StudioTheme {
  if (typeof document === 'undefined') return STUDIO_DEFAULT_THEME
  const shown = document.documentElement.getAttribute(THEME_ATTRIBUTE)
  return isStudioTheme(shown) ? shown : STUDIO_DEFAULT_THEME
}

export function showStudioTheme(theme: StudioTheme): void {
  if (typeof document === 'undefined') return
  if (document.documentElement.getAttribute(THEME_ATTRIBUTE) === theme) return
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme)
  window.dispatchEvent(new Event(THEME_EVENT))
}

/**
 * What the account answered becomes what the screen shows and what this browser
 * remembers. `null` is a person who never chose: Studio's own default.
 */
export function followAccountTheme(theme: StudioTheme | null): void {
  showStudioTheme(theme ?? STUDIO_DEFAULT_THEME)
  rememberStudioTheme(theme)
}

/**
 * Tells a listener when the shown theme changes, here or in another tab of the
 * same browser: the other tab writes the store and this one follows it.
 */
export function subscribeToStudioTheme(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  function followOtherTab(event: StorageEvent) {
    if (event.key !== STUDIO_THEME_STORAGE_KEY) return
    showStudioTheme(rememberedStudioTheme() ?? STUDIO_DEFAULT_THEME)
  }
  window.addEventListener(THEME_EVENT, listener)
  window.addEventListener('storage', followOtherTab)
  return () => {
    window.removeEventListener(THEME_EVENT, listener)
    window.removeEventListener('storage', followOtherTab)
  }
}

/**
 * Runs as the body opens, before the first frame. It only ever writes one
 * of the two known values, so a tampered store cannot put anything else on the
 * element.
 */
export function studioThemeScript(): string {
  const key = JSON.stringify(STUDIO_THEME_STORAGE_KEY)
  return `(function(){try{var t=localStorage.getItem(${key});if(t==='light'||t==='dark')document.documentElement.setAttribute('${THEME_ATTRIBUTE}',t)}catch(e){}})()`
}

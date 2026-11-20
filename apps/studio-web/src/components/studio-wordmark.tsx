import { BrandLogo, ProductWordmark } from '@allfitone/react/brand'

/**
 * Studio's brand on a surface that follows the theme.
 *
 * The brand draws its neutral letters in one fixed colour per surface, so a
 * page that can be dark or light needs both drawings. Both are rendered and the
 * stylesheet keeps the one for the theme in force. A hook would learn the theme
 * only after hydration, and a browser that remembers light would show letters
 * the colour of the page until then.
 *
 * The menu does not use this: it is dark on either theme, so it names its
 * surface itself. `compact` is the bare mark, for a header with no room.
 */
export function StudioWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <span data-brand-surface="dark">
        {compact ? (
          <BrandLogo variant="cyan" title="Allfit Studio" height={28} />
        ) : (
          <ProductWordmark
            product="studio"
            surface="dark"
            title="Allfit Studio"
            width={138}
            height={28}
          />
        )}
      </span>
      <span data-brand-surface="light">
        {compact ? (
          <BrandLogo variant="ink" title="Allfit Studio" height={28} />
        ) : (
          <ProductWordmark
            product="studio"
            surface="light"
            title="Allfit Studio"
            width={138}
            height={28}
          />
        )}
      </span>
    </>
  )
}

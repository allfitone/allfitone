import {
  SiteFooter,
  SiteFooterBar,
  SiteFooterLink,
  SiteFooterLinks,
  SiteFooterMeta,
  SiteFooterParent,
  SiteFooterPartner,
  SiteFooterPartnerLegal,
  SiteFooterPartnerText,
} from '@allfitone/react/components/site-shell'
import { ExternalIcon } from '@allfitone/react/icons'
import Image from 'next/image'

import type { Dictionary } from '@/content'
import { legalUrl } from '@/lib/legal'
import type { Locale } from '@/lib/locale'

/** The site footer shared with studio.allfit.one, from the Design System. */
export function Footer({ locale, copy }: { locale: Locale; copy: Dictionary }) {
  return (
    <SiteFooter>
      <SiteFooterPartner>
        <Image
          src="/partners/nvidia-inception-program-badge.svg"
          alt={copy.nvidia.alt}
          width={200}
          height={86}
        />
        <div>
          <SiteFooterPartnerText>{copy.nvidia.member}</SiteFooterPartnerText>
          <SiteFooterPartnerLegal lang="en">{copy.nvidia.trademark}</SiteFooterPartnerLegal>
        </div>
      </SiteFooterPartner>
      <SiteFooterBar>
        <SiteFooterParent href={`https://www.allfit.one/${locale}`}>
          Allfit One
          <ExternalIcon size="sm" decorative />
        </SiteFooterParent>
        <SiteFooterLinks>
          <SiteFooterLink href={legalUrl(locale, 'terms')}>{copy.footer.terms}</SiteFooterLink>
          <SiteFooterLink href={legalUrl(locale, 'privacy')}>{copy.footer.privacy}</SiteFooterLink>
          <SiteFooterLink
            href={`https://studio.allfit.one/${locale}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.footer.studio}
            <span className="sr-only"> {copy.footer.newWindow}</span>
          </SiteFooterLink>
        </SiteFooterLinks>
      </SiteFooterBar>
      <SiteFooterMeta>{copy.footer.rights}</SiteFooterMeta>
    </SiteFooter>
  )
}

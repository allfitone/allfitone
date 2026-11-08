/**
 * The site footer, built from the Design System's site shell like the one on
 * studio.allfit.one.
 *
 * Allfit One and Allfit Studio sit together as two buttons, because they are
 * the family this app belongs to: Allfit One is the filled cyan one, since it is
 * the company behind both, and Allfit Studio is the outlined one.
 *
 * Every link here leaves the landing, the three legal documents on
 * www.allfit.one included, so each opens in a new tab and says so to screen
 * readers.
 */

import { buttonVariants } from '@allfitone/react/components/button'
import {
  SiteFooter,
  SiteFooterBar,
  SiteFooterLink,
  SiteFooterLinks,
  SiteFooterMeta,
  SiteFooterPartner,
  SiteFooterPartnerLegal,
  SiteFooterPartnerText,
} from '@allfitone/react/components/site-shell'
import { ExternalIcon } from '@allfitone/react/icons'
import Image from 'next/image'

import type { Dictionary } from '@/content'
import { legalUrl } from '@/lib/legal'
import type { Locale } from '@/lib/locale'

export function Footer({ locale, copy }: { locale: Locale; copy: Dictionary }) {
  const family = [
    { name: 'Allfit One', href: `https://www.allfit.one/${locale}`, variant: 'default' },
    { name: copy.footer.studio, href: `https://studio.allfit.one/${locale}`, variant: 'outline' },
  ] as const
  const legal = ['terms', 'privacy', 'analytics'] as const

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
        <div className="footer-family">
          {family.map(({ name, href, variant }) => (
            <a
              key={href}
              className={`${buttonVariants({ variant })} footer-family__${variant}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {name}
              <ExternalIcon data-icon="inline-end" decorative />
              <span className="sr-only"> {copy.footer.newWindow}</span>
            </a>
          ))}
        </div>
        <SiteFooterLinks>
          {legal.map((document) => (
            <SiteFooterLink
              key={document}
              href={legalUrl(locale, document)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.footer[document]}
              <span className="sr-only"> {copy.footer.newWindow}</span>
            </SiteFooterLink>
          ))}
        </SiteFooterLinks>
      </SiteFooterBar>
      <SiteFooterMeta>{copy.footer.rights}</SiteFooterMeta>
    </SiteFooter>
  )
}

'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { useOrganizationContext } from './organization-context'
import { clientDoors } from '@/lib/client-card'
import { clientCardQueryOptions } from '@/lib/studio-query'

/**
 * Every screen this relationship opens, so moving between them is one press.
 *
 * Each of the ten carried «Volver a su ficha» and «Volver a clientes» and
 * nothing else, so reading her profile and then her sessions meant going back
 * to the card and choosing again — twenty controls across the block whose only
 * job was to undo a navigation, and not one that moved sideways.
 *
 * **It is not a tab strip, and deliberately not a fixed one.** These are ten
 * addresses, not one with panels, and which of them exist depends on what she
 * authorized. A fixed strip with the rest disabled would turn her screen into
 * an inventory of what she withheld, which is the opposite of how this product
 * treats her data.
 *
 * The card is always the first door and is known from the address, so the way
 * back is on screen before the card read answers; the rest join it when it
 * does. Opening the card writes no access event — it is an index, not a copy
 * of her data — so carrying this on all ten screens costs her audit log
 * nothing.
 *
 * **`nested` is for the two screens that live under a door rather than being
 * one.** A session and a prescription are reached from a row of the sessions
 * list and of the programs list, so their door is the section the reader is in
 * and also the way back up to it: it stays a link, and says `aria-current`
 * without claiming to be this page.
 */
export function ClientScreenStrip({
  segment,
  nested = false,
}: {
  segment?: string
  nested?: boolean
}) {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const cardQuery = useQuery({
    ...clientCardQueryOptions(current.organization_id, params.personId),
    // Some of these screens read the card themselves, and it is never cached,
    // so a second reader mounting later would otherwise ask for it again.
    refetchOnMount: false,
  })

  const sections = cardQuery.data && 'sections' in cardQuery.data ? cardQuery.data.sections : []
  const doors = clientDoors(sections, {
    organizationId: current.organization_id,
    personId: params.personId,
    ...(segment === undefined ? {} : { segment }),
  })

  return (
    <nav data-client-screen-strip aria-label="Pantallas de esta persona">
      {doors.map((door) =>
        door.here && !nested ? (
          <span key={door.href} data-client-screen-door aria-current="page">
            {door.label}
          </span>
        ) : (
          <Link
            key={door.href}
            href={door.href}
            data-client-screen-door
            aria-current={door.here ? 'true' : undefined}
          >
            {door.label}
          </Link>
        ),
      )}
    </nav>
  )
}

/**
 * One action in a sheet: an icon on its tile, what it does, and what that means (FIN-18b).
 *
 * `SheetChoice` answers «which one»; this answers «what to do», so it leads with the
 * icon the action is recognised by. A destructive one tints its icon with the danger tone.
 */

import { ContentRow } from '@allfitone/react-native/content-row'
import type { IconName } from '@allfitone/react-native/icons'

export function ActionRow({
  icon,
  name,
  detail,
  danger = false,
  onPress,
}: {
  readonly icon: IconName
  readonly name: string
  readonly detail: string
  readonly danger?: boolean
  readonly onPress: () => void
}) {
  return (
    <ContentRow
      name={name}
      caption={detail}
      icon={icon}
      iconTone={danger ? 'danger' : 'quiet'}
      accessibilityLabel={name}
      onPress={onPress}
    />
  )
}

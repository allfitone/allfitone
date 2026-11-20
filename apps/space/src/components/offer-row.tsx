/**
 * Una salida que se ofrece: el azulejo de acento, lo que es, y a dónde lleva.
 *
 * **Es la forma que `FIN-9` le da a «Crear una rutina»**, y la dibuja el `OfferRow` del
 * design system. `deep` es la de `FIN-9`, con fondo profundo y chevron; `quiet` es la de
 * `FIN-2b`, plana y sin flecha, para cuando vive entre secciones de una pantalla.
 */

import { OfferRow as DsOfferRow } from '@allfitone/react-native/offer-row'
import { type IconName } from '@allfitone/react-native/icons'

export function OfferRow({
  icon,
  label,
  caption,
  tone = 'deep',
  captionColor = 'muted',
  onPress,
}: {
  readonly icon: IconName
  readonly label: string
  /** Qué pasa al tocarla. Sin esto es un botón, y para eso está el botón. */
  readonly caption: string
  readonly tone?: 'deep' | 'quiet'
  /** Accent when the caption says something is waiting, not what the row does. */
  readonly captionColor?: 'muted' | 'accent'
  readonly onPress: () => void
}) {
  return (
    <DsOfferRow
      icon={icon}
      label={label}
      caption={caption}
      tone={tone}
      captionTone={captionColor}
      onPress={onPress}
    />
  )
}

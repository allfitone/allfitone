/**
 * Choosing the zones to focus on (`HU-SP-097`): the body front and back at once, the
 * zones as chips under it, and «Todo el cuerpo» set apart.
 *
 * Shared by the onboarding and by the screen that edits the zones later. It holds the
 * answer's drawing and nothing of the screen around it: the title, the button and what
 * saving means belong to whoever places it. Why the faces are not toggled and why the
 * chip and the muscle are the same control is in `app/onboarding/focus.tsx`.
 */

import { Chip } from '@allfitone/react-native/chip'
import { Text } from '@allfitone/react-native/text'
import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  bodyGender,
  FOCUS_ZONES,
  focusHint,
  focusSummary,
  INERT_SLUGS,
  litSlugs,
  WHOLE_BODY,
  zoneForSlug,
  type BodySide,
  type BodySlug,
  type FocusChoice,
  type FocusSelection,
} from '../client/focus-form'
import { BodyFigure } from './body-figure'

export function FocusPicker({
  selection,
  onChoose,
  declaredSex,
  scale,
  pressable,
}: {
  readonly selection: FocusSelection
  readonly onChoose: (choice: FocusChoice) => void
  readonly declaredSex: 'male' | 'female' | null
  readonly scale: number
  readonly pressable: boolean
}) {
  const gender = bodyGender(declaredSex)
  const hint = focusHint(selection)

  const choose = useCallback(
    (choice: FocusChoice) => {
      if (pressable) onChoose(choice)
    },
    [onChoose, pressable],
  )

  // Both faces are memoised, so their props have to keep their identity or the memo
  // never hits and every tap redraws the face nobody touched.
  const litFront = useMemo(() => litSlugs(selection, 'front'), [selection])
  const litBack = useMemo(() => litSlugs(selection, 'back'), [selection])
  const pressFront = useCallback(
    (slug: BodySlug) => {
      const zone = zoneForSlug(slug, 'front')
      if (zone) choose(zone)
    },
    [choose],
  )
  const pressBack = useCallback(
    (slug: BodySlug) => {
      const zone = zoneForSlug(slug, 'back')
      if (zone) choose(zone)
    },
    [choose],
  )

  const face = (side: BodySide) => (
    <View style={styles.face}>
      <BodyFigure
        side={side}
        gender={gender}
        scale={scale}
        lit={side === 'front' ? litFront : litBack}
        // Inert through the figure rather than the library's `disabledParts`, which
        // hardcodes a bone white with no prop to override it.
        inert={INERT_SLUGS}
        onPressSlug={side === 'front' ? pressFront : pressBack}
      />
      <Text role="body" size="xs" color="muted" style={styles.faceName}>
        {side === 'front' ? 'FRENTE' : 'ESPALDA'}
      </Text>
    </View>
  )

  return (
    <View>
      <View style={styles.summary}>
        <Text role="body" size="xs" color="muted">
          FRENTE Y ESPALDA
        </Text>
        <Text role="body" size="xs" color={selection.zones.length ? 'accent' : 'muted'}>
          {focusSummary(selection)}
        </Text>
      </View>

      {/* Aligned on the feet: the library renders both sexes and both faces into
          the same 400×200 box, so one scale is all it takes. */}
      <View style={styles.faces}>
        {face('front')}
        {face('back')}
      </View>

      <View style={styles.chips}>
        {FOCUS_ZONES.map((entry) => {
          const on = selection.zones.includes(entry.zone)
          return (
            <Chip
              key={entry.zone}
              label={entry.name}
              selected={on}
              disabled={!pressable}
              onPress={() => choose(entry.zone)}
            />
          )
        })}
      </View>

      {/* Set apart from the zones on purpose: it is an answer of another kind,
          not the eighth zone of the body. */}
      <Chip
        label="Todo el cuerpo"
        selected={selection.whole}
        disabled={!pressable}
        onPress={() => choose(WHOLE_BODY)}
        style={styles.whole}
      />

      {hint ? (
        <Text role="body" size="xs" color="muted" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  faces: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 4 },
  face: { alignItems: 'center' },
  faceName: { marginTop: 3, letterSpacing: 1.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  whole: { alignSelf: 'flex-start', marginTop: 8 },
  hint: { marginTop: 11 },
})

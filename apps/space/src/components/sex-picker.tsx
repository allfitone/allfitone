/**
 * Answering the biological sex (`HU-SP-096`): two portraits and «Prefiero no decirlo»,
 * which is an answer of the same family and not a demoted pill.
 *
 * Shared by the onboarding and by the screen that corrects it later. It holds the
 * answer's drawing and nothing of the screen around it; the line under a decline is
 * the caller's, because what declining means depends on where it is said.
 *
 * The card width is measured from the row that holds them rather than derived from the
 * window, which is the only version that cannot disagree with whatever the design system
 * pads (`sex-form.ts`). Selection never depends on colour alone: the chosen card carries
 * a border, a tonal ground, a check and `accessibilityState.selected`.
 */

import { FoundationIcon } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated'

import femalePortrait from '../../assets/images/sex-female.webp'
import malePortrait from '../../assets/images/sex-male.webp'
import { cssDuration } from '../client/motion'
import { cardGeometry, CARD_GAP, type SexAnswer } from '../client/sex-form'

const CHOICES: Array<{ value: Exclude<SexAnswer, null>; label: string; portrait: number }> = [
  { value: 'male', label: 'Masculino', portrait: malePortrait },
  { value: 'female', label: 'Femenino', portrait: femalePortrait },
]

/** Widths of the three bars on the decline card, as the prototype drew them. */
const STRATA = [13, 19, 16]
const STRATUM_HEIGHT = 2
const STRATA_GAP = 3
/** Where the three settle when the answer is declined: level with each other. */
const STRATA_ALIGNED = 22

/**
 * The bars are absolutely positioned inside a fixed box, which makes animating
 * their width the sanctioned case — nothing else re-lays-out, and the rounded
 * ends survive, where a scaleX would have smeared them into ovals.
 */
const STRATA_TRANSITION = {
  transitionProperty: 'width',
  transitionDuration: cssDuration('normal', false),
  transitionTimingFunction: 'ease-out',
} as const

/** The consequence is an answer to what was just chosen, so it arrives with it. */
const consequenceIn = FadeInDown.duration(160)
const consequenceOut = FadeOut.duration(120)

export function SexPicker({
  answer,
  onChoose,
  pressable,
  declineNote,
}: {
  readonly answer: SexAnswer | undefined
  readonly onChoose: (answer: SexAnswer) => void
  readonly pressable: boolean
  readonly declineNote: string
}) {
  const theme = useTheme()
  const { height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const [rowWidth, setRowWidth] = useState(0)
  const { cardWidth, portraitHeight } = cardGeometry(rowWidth, height)
  const declined = answer === null

  return (
    <>
      <View style={styles.cards} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        {CHOICES.map((choice) => {
          const selected = answer === choice.value
          return (
            <Pressable
              key={choice.value}
              onPress={() => pressable && onChoose(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !pressable }}
              accessibilityLabel={choice.label}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: selected ? theme.color.border.accent : theme.color.border.subtle,
                  backgroundColor: selected
                    ? theme.color.accent.tonal
                    : theme.color.background.surfaceSubtle,
                },
              ]}
            >
              {/* Rendered only once the row has been measured: at width zero the
                  image would resolve against nothing. */}
              {cardWidth > 0 ? (
                <Image
                  source={choice.portrait}
                  style={[
                    { width: cardWidth, height: portraitHeight },
                    selected ? undefined : styles.dimmed,
                  ]}
                  resizeMode="cover"
                  accessible={false}
                />
              ) : null}

              {selected ? (
                <View style={[styles.check, { backgroundColor: theme.color.border.accent }]}>
                  <FoundationIcon
                    name="check"
                    customSize={13}
                    strokeScale="compact"
                    color={theme.color.accent.onAccent}
                    decorative
                  />
                </View>
              ) : null}

              <Text
                role="display"
                size="lg"
                uppercase
                color={selected ? 'accent' : 'secondary'}
                style={styles.name}
              >
                {choice.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Pressable
        onPress={() => pressable && onChoose(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: declined, disabled: !pressable }}
        accessibilityLabel="Prefiero no decirlo"
        style={[
          styles.decline,
          {
            borderColor: declined ? theme.color.border.accent : theme.color.border.subtle,
            backgroundColor: declined
              ? theme.color.accent.tonal
              : theme.color.background.surfaceSubtle,
          },
        ]}
      >
        <View style={styles.strata}>
          {STRATA.map((width, index) => (
            <Animated.View
              key={index}
              style={[
                styles.stratum,
                STRATA_TRANSITION,
                {
                  top: index * (STRATUM_HEIGHT + STRATA_GAP),
                  width: declined ? STRATA_ALIGNED : width,
                  backgroundColor: declined
                    ? theme.color.border.accent
                    : theme.color.border.default,
                },
              ]}
            />
          ))}
        </View>
        <Text role="body" size="md" color={declined ? 'accent' : 'secondary'}>
          Prefiero no decirlo
        </Text>
      </Pressable>

      {declined ? (
        <Animated.View
          style={styles.consequence}
          {...(reduceMotion ? {} : { entering: consequenceIn, exiting: consequenceOut })}
        >
          <FoundationIcon
            name="info"
            size="sm"
            color={theme.color.text.muted}
            decorative
            style={styles.consequenceIcon}
          />
          <Text role="body" size="sm" color="muted" style={styles.consequenceText}>
            {declineNote}
          </Text>
        </Animated.View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: CARD_GAP, marginTop: 20 },
  card: {
    borderWidth: 2,
    borderRadius: 22,
    paddingBottom: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  dimmed: { opacity: 0.72 },
  check: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { paddingTop: 9 },
  decline: {
    marginTop: 11,
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  strata: {
    width: STRATA_ALIGNED,
    height: STRATUM_HEIGHT * 3 + STRATA_GAP * 2,
  },
  stratum: { position: 'absolute', left: 0, height: STRATUM_HEIGHT, borderRadius: 2 },
  consequence: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 11 },
  consequenceIcon: { marginTop: 2 },
  consequenceText: { flex: 1 },
})

/**
 * How somebody trains (`PF-E3b`, `HU-SP-012` criterion 3): days per week on the design
 * system's large `Stepper` with the week drawn under it, and the time per session as four
 * `SelectableTile`s, one choice, each holding its ring.
 *
 * The days start from three when nothing was answered: a stepper with no number cannot
 * step, and three is the middle of what a week of strength usually holds. The ring is
 * the share of an hour, so «60+» reads full like «60» and the caption says the rest.
 */

import { SelectableTile } from '@allfitone/react-native/selectable-tile'
import { Stepper } from '@allfitone/react-native/stepper'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import type { Routine } from '../client/fitness-edit'
import { DURATION_CHOICES, daysLine } from '../client/fitness-profile'
import { useText } from '../i18n/use-text'

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function RoutinePicker({
  routine,
  onChange,
}: {
  readonly routine: Routine
  readonly onChange: (routine: Routine) => void
}) {
  const theme = useTheme()
  const text = useText().fitness
  const { days } = routine
  return (
    <>
      <Text role="label" size="xs" color="secondary" uppercase>
        {text.routine.daysPerWeek}
      </Text>
      <Stepper
        size="lg"
        accessibilityLabel={text.routine.daysPerWeek}
        value={days ?? 3}
        min={1}
        max={7}
        unit={text.routine.dayUnit(days ?? 3)}
        format={(value) => (days === undefined ? '–' : String(value))}
        onChange={(value) => onChange({ ...routine, days: days === undefined ? 3 : value })}
      />
      <View style={styles.segments}>
        {DAYS.map((day) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={daysLine(day, text)}
            accessibilityState={{ selected: days === day }}
            onPress={() => onChange({ ...routine, days: day })}
            style={styles.segment}
          >
            <View
              style={[
                styles.bar,
                {
                  backgroundColor:
                    days !== undefined && day <= days
                      ? theme.color.icon.accent
                      : theme.color.background.surfaceMuted,
                },
              ]}
            />
            <Text role="data" size="xs" color="secondary">
              {String(day)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text role="label" size="xs" color="secondary" uppercase style={styles.second}>
        {text.routine.timePerSession}
      </Text>
      <View style={styles.rings}>
        {DURATION_CHOICES.map((choice) => {
          const chosen = routine.duration === choice.value
          return (
            <SelectableTile
              key={choice.value}
              name={text.durations[choice.value].caption}
              accessibilityLabel={text.durations[choice.value].line}
              choice="single"
              selected={chosen}
              onPress={() => onChange({ ...routine, duration: choice.value })}
              style={styles.tile}
            >
              <Ring
                share={choice.share}
                lit={chosen ? theme.color.icon.accent : theme.color.icon.secondary}
                track={theme.color.border.subtle}
              >
                <Text
                  role="poster"
                  size="lg"
                  color={chosen ? 'accent' : 'primary'}
                  style={styles.figure}
                >
                  {choice.figure}
                </Text>
              </Ring>
            </SelectableTile>
          )
        })}
      </View>
    </>
  )
}

const RING = 56
const STROKE = 5

function Ring({
  share,
  lit,
  track,
  children,
}: {
  readonly share: number
  readonly lit: string
  readonly track: string
  readonly children: ReactNode
}) {
  const radius = (RING - STROKE) / 2
  const length = 2 * Math.PI * radius
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={radius}
          stroke={track}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={radius}
          stroke={lit}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${String(length * share)} ${String(length)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${String(RING / 2)} ${String(RING / 2)})`}
        />
      </Svg>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  // Even on both sides so the figure stays centred in its ring.
  figure: { paddingVertical: 4, paddingHorizontal: 3 },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { height: 8, borderRadius: 4, alignSelf: 'stretch' },
  second: { marginTop: 10 },
  rings: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
})

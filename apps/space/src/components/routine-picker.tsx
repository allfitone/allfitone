/**
 * How somebody trains (`PF-E3b`, `HU-SP-012` criterion 3): days per week on a stepper
 * with the week drawn under it, and the time per session as four rings.
 *
 * The days start from three when nothing was answered: a stepper with no number cannot
 * step, and three is the middle of what a week of strength usually holds. The ring is
 * the share of an hour, so «60+» reads full like «60» and the caption says the rest.
 */

import { FoundationIcon } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import type { Routine } from '../client/fitness-edit'
import { DURATION_CHOICES, daysLine, stepDays } from '../client/fitness-profile'

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function RoutinePicker({
  routine,
  onChange,
}: {
  readonly routine: Routine
  readonly onChange: (routine: Routine) => void
}) {
  const theme = useTheme()
  const { days } = routine
  return (
    <>
      <Text role="label" size="xs" color="secondary" uppercase>
        Días por semana
      </Text>
      <View style={styles.stepper}>
        <Step
          icon="subtract"
          label="Un día menos"
          disabled={days === 1}
          onPress={() => onChange({ ...routine, days: stepDays(days, -1) })}
        />
        <View
          accessibilityLabel={days === undefined ? 'Sin responder' : daysLine(days)}
          style={[
            styles.daysBox,
            {
              borderColor:
                days === undefined ? theme.color.border.subtle : theme.color.border.accent,
              backgroundColor: theme.color.background.surfaceMuted,
            },
          ]}
        >
          <Text
            role="poster"
            size="5xl"
            color={days === undefined ? 'muted' : 'accent'}
            style={styles.days}
          >
            {days === undefined ? '–' : String(days)}
          </Text>
          <Text role="label" size="sm" color="secondary" uppercase>
            {days === 1 ? 'día' : 'días'}
          </Text>
        </View>
        <Step
          icon="add"
          label="Un día más"
          disabled={days === 7}
          onPress={() => onChange({ ...routine, days: stepDays(days, 1) })}
        />
      </View>
      <View style={styles.segments}>
        {DAYS.map((day) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={daysLine(day)}
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
        Tiempo por sesión
      </Text>
      <View style={styles.rings}>
        {DURATION_CHOICES.map((choice) => {
          const chosen = routine.duration === choice.value
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.line}
              accessibilityState={{ selected: chosen }}
              onPress={() => onChange({ ...routine, duration: choice.value })}
              style={[
                styles.ringTile,
                {
                  borderColor: chosen ? theme.color.border.accent : theme.color.border.subtle,
                  backgroundColor: theme.color.background.surfaceMuted,
                },
              ]}
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
              <Text role="body" size="xs" color={chosen ? 'primary' : 'secondary'} align="center">
                {choice.caption}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </>
  )
}

/**
 * The stepper's − and +, as tall as the figure between them: the DS `IconButton` is a
 * fixed touch target, and beside a taller box it sat at the top edge (`PF-E3b`).
 */
function Step({
  icon,
  label,
  disabled,
  onPress,
}: {
  readonly icon: 'add' | 'subtract'
  readonly label: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        {
          borderColor: theme.color.border.subtle,
          backgroundColor: theme.color.background.surfaceMuted,
        },
        (pressed || disabled) && styles.dim,
      ]}
    >
      <FoundationIcon name={icon} size="sm" color={theme.color.icon.primary} decorative />
    </Pressable>
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
  stepper: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  step: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
  },
  dim: { opacity: 0.45 },
  daysBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingVertical: 10,
  },
  // The italic figure rises above its tight line and leans past its box; room on both.
  days: { paddingTop: 8, paddingRight: 4 },
  // Even on both sides so the figure stays centred in its ring.
  figure: { paddingVertical: 4, paddingHorizontal: 3 },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { height: 8, borderRadius: 4, alignSelf: 'stretch' },
  second: { marginTop: 10 },
  rings: { flexDirection: 'row', gap: 8 },
  ringTile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
})

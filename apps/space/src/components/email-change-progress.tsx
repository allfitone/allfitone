/**
 * `PF-E12b` and `PF-E12c` (TECH-44): what the code screen becomes once the code was right,
 * while the worker takes the new address to WorkOS, and once it is in force.
 *
 * **It claims nothing it cannot know.** The app sees «still applying» or «done», so the
 * steps say exactly that: the code is confirmed, the sign-in update is under way, and
 * every step is ticked together when the new address is the one in force.
 *
 * The ring turns while waiting and stands still, full, when done; with reduced motion it
 * never turns.
 */

import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useEffect } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { emailChangeSteps, type StepState } from '../client/fitness-profile'

const RING = 132
const STROKE = 3
const RADIUS = (RING - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const ARC = 0.3

function Ring({ done }: { readonly done: boolean }) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const turn = useSharedValue(0)

  useEffect(() => {
    if (done || reduceMotion) {
      cancelAnimation(turn)
      return
    }
    turn.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false))
    return () => cancelAnimation(turn)
  }, [done, reduceMotion, turn])

  const spinning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }))
  const accent = theme.color.icon.accent

  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          stroke={done ? accent : theme.color.border.subtle}
          strokeWidth={STROKE}
          fill="none"
        />
      </Svg>
      {done ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, spinning]}>
          <Svg width={RING} height={RING}>
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={accent}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${String(CIRCUMFERENCE * ARC)} ${String(CIRCUMFERENCE)}`}
              fill="none"
            />
          </Svg>
        </Animated.View>
      )}
      <View
        style={[
          styles.core,
          {
            backgroundColor: done ? `${theme.color.icon.accent}26` : theme.color.background.surface,
          },
        ]}
      >
        <FoundationIcon
          name={done ? 'check' : 'notification'}
          customSize={36}
          color={accent}
          decorative
        />
      </View>
    </View>
  )
}

function Step({ label, state }: { readonly label: string; readonly state: StepState }) {
  const theme = useTheme()
  const accent = theme.color.icon.accent
  return (
    <View style={styles.step} accessible accessibilityLabel={`${label}: ${STATE_WORDS[state]}`}>
      <View
        style={[
          styles.mark,
          {
            borderColor: state === 'todo' ? theme.color.border.subtle : accent,
            backgroundColor: state === 'done' ? accent : 'transparent',
          },
        ]}
      >
        {state === 'done' ? (
          <FoundationIcon name="check" size="xs" color={theme.color.action.onPrimary} decorative />
        ) : state === 'now' ? (
          <View style={[styles.dot, { backgroundColor: accent }]} />
        ) : null}
      </View>
      <Text
        role={state === 'now' ? 'control' : 'body'}
        size="sm"
        color={state === 'todo' ? 'muted' : 'primary'}
      >
        {label}
      </Text>
    </View>
  )
}

const STATE_WORDS: Record<StepState, string> = {
  done: 'hecho',
  now: 'en curso',
  todo: 'pendiente',
}

export function EmailChangeProgress({
  address,
  done,
  onDone,
}: {
  readonly address: string
  readonly done: boolean
  readonly onDone: () => void
}) {
  const theme = useTheme()
  return (
    <View style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Ring done={done} />
        <View style={styles.words} accessibilityLiveRegion="polite">
          <Text role="display" size="3xl" align="center" accessibilityRole="header">
            {done ? 'TU CORREO CAMBIÓ' : 'CAMBIANDO TU CORREO'}
          </Text>
          <Text role="body" size="sm" color="secondary" align="center">
            {done
              ? 'Desde ahora entras con este correo. Cerramos tus otras sesiones y avisamos al correo anterior.'
              : 'Toma unos segundos. Puedes quedarte aquí: te avisamos cuando termine.'}
          </Text>
        </View>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.color.background.surface,
              borderColor: theme.color.border.subtle,
            },
          ]}
        >
          <Text role="label" size="xs" color="secondary">
            CORREO NUEVO
          </Text>
          <Text role="control" size="md" align="center">
            {address}
          </Text>
        </View>
        {done ? null : (
          <View style={styles.steps}>
            {emailChangeSteps(done).map((step) => (
              <Step key={step.label} label={step.label} state={step.state} />
            ))}
          </View>
        )}
      </ScrollView>
      {done ? (
        <View style={styles.footer}>
          <Button label="Listo" onPress={onDone} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  content: { alignItems: 'center', gap: 22, paddingTop: 36, paddingBottom: 32 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  core: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { gap: 10, maxWidth: 320 },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  steps: { alignSelf: 'stretch', gap: 14, paddingHorizontal: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { paddingTop: 12, paddingBottom: 8 },
})

/**
 * Recording the measures, one at a time (`REG-3`, OP-IDN-006). Pro (`body_measurements`).
 *
 * One measure fills the screen: where to put the tape, lit on the figure; the reading;
 * the last one beside it; and how to take it. A form with seven fields asks somebody
 * holding a tape in one hand to type with the other, and it says nothing about where.
 *
 * **Each measure is saved when the next one is asked for.** Leaving half way keeps
 * what was measured, and «Saltar» leaves a measure empty rather than at zero: an empty
 * waist is not a waist of zero centimetres.
 *
 * The wheel starts at the last reading of that measure, so a second session corrects a
 * known number instead of searching from nothing. Muscle mass turns and is sent in the
 * unit she reads masses in; lengths stay in centimetres.
 */

import { Button } from '@allfitone/react-native/button'
import { Chip } from '@allfitone/react-native/chip'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { WheelPicker } from '@allfitone/react-native/wheel-picker'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'

import {
  MEASURES,
  decimal,
  declarationOf,
  latestOf,
  readingIn,
  runAround,
  shortDay,
  shownMeasure,
  type BodyRecord,
  type Measure,
} from '../../src/client/body'
import { readBodyRecords, recordBodyMeasure } from '../../src/client/body-transport'
import { INERT_SLUGS } from '../../src/client/focus-form'
import { selectionTick } from '../../src/client/selection-tick'
import { deviceTimezone } from '../../src/client/timezone'
import { BodyFigure } from '../../src/components/body-figure'
import { FIGURE_TRACKING } from '../../src/components/nutrition-ui'
import { usePlan, useUpgradeSheet } from '../../src/components/upgrade-sheet'
import { useLocale, useText } from '../../src/i18n/use-text'
import { useUnits } from '../../src/units/use-units'

const FIGURE_SCALE = 0.8
const FIGURE_WIDTH = 200 * FIGURE_SCALE
const FIGURE_HEIGHT = 400 * FIGURE_SCALE
/** About one chip and its gap; the row scrolls by it, so precision is not needed. */
const CHIP_STRIDE = 96

/** Where the tape goes, as a share of the figure's box: centre and width. None for a scale reading. */
const TAPE: Partial<Record<Measure['code'], readonly [number, number, number]>> = {
  chest: [0.5, 0.27, 0.5],
  arm: [0.25, 0.35, 0.16],
  waist: [0.5, 0.4, 0.38],
  hip: [0.5, 0.47, 0.46],
  thigh: [0.4, 0.6, 0.2],
}

export default function MeasuresScreen() {
  const router = useRouter()
  const locale = useLocale()
  const text = useText()
  const words = text.progress.measures
  const { mass } = useUnits()
  const theme = useTheme()
  const today = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: deviceTimezone() }).format(new Date()),
    [],
  )
  const features = usePlan()
  const upgrade = useUpgradeSheet(features)

  const [records, setRecords] = useState<BodyRecord[]>([])
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Partial<Record<Measure['code'], number>>>({})
  const [saved, setSaved] = useState<Partial<Record<Measure['code'], number>>>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const chips = useRef<ScrollView>(null)

  // The measure being taken stays in sight as the row moves on.
  useEffect(() => {
    chips.current?.scrollTo({ x: Math.max(0, step * CHIP_STRIDE - CHIP_STRIDE), animated: true })
  }, [step])

  useEffect(() => {
    let active = true
    readBodyRecords()
      .then((read) => active && setRecords(read))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const stored = MEASURES[step]
  if (!stored) return null
  // What the wheel turns and what is sent are in the unit shown, never converted back.
  const measure = shownMeasure(stored, mass)
  const named = words.each[measure.code]
  const last = latestOf(records, measure.code)
  const lastShown = last ? readingIn(stored, last.value, mass) : undefined
  const value = values[measure.code] ?? lastShown ?? measure.resting
  const run = runAround(lastShown ?? measure.resting, measure.step, 25, measure.min, measure.max)
  const nextMeasure = MEASURES[step + 1]

  const advance = () => {
    if (nextMeasure) setStep(step + 1)
    else router.back()
  }

  const saveAndAdvance = async () => {
    setSaving(true)
    setFailure(undefined)
    try {
      await recordBodyMeasure(declarationOf(measure.code, value, today, mass))
      setSaved({ ...saved, [measure.code]: value })
      advance()
    } catch (cause) {
      if (!upgrade.handled(cause)) setFailure(words.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const tape = TAPE[measure.code]

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="close" accessibilityLabel={words.finish} onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.title}>
          {words.title}
        </Text>
        <Text role="control" size="xs" color="muted" style={styles.step}>
          {words.step(step + 1, MEASURES.length)}
        </Text>
      </View>
      <ScrollView
        ref={chips}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        {/* A chip per measure: the one being taken is on, a saved one carries its tick, and
            any of them jumps straight to that measure. */}
        {MEASURES.map((one, index) => {
          const done = saved[one.code]
          const label = words.each[one.code].label
          return (
            <Chip
              key={one.code}
              label={
                done !== undefined && index !== step ? `${label} ${decimal(done, locale)}` : label
              }
              selected={index === step}
              {...(done !== undefined ? { icon: 'check' as const } : {})}
              onPress={() => setStep(index)}
            />
          )
        })}
      </ScrollView>

      <View style={styles.stage} accessible={false}>
        <View style={styles.figure}>
          <BodyFigure
            side="front"
            gender="male"
            scale={FIGURE_SCALE}
            lit={[]}
            inert={INERT_SLUGS}
            onPressSlug={() => undefined}
          />
          {tape ? (
            <Svg width={FIGURE_WIDTH} height={FIGURE_HEIGHT} style={StyleSheet.absoluteFill}>
              <Ellipse
                cx={tape[0] * FIGURE_WIDTH}
                cy={tape[1] * FIGURE_HEIGHT}
                rx={(tape[2] * FIGURE_WIDTH) / 2 + 6}
                ry={9}
                stroke={theme.color.accent.tonal}
                strokeWidth={10}
                fill="none"
              />
              <Ellipse
                cx={tape[0] * FIGURE_WIDTH}
                cy={tape[1] * FIGURE_HEIGHT}
                rx={(tape[2] * FIGURE_WIDTH) / 2}
                ry={6}
                stroke={theme.color.icon.accent}
                strokeWidth={2.5}
                fill="none"
              />
            </Svg>
          ) : null}
        </View>
      </View>

      <View style={styles.reading}>
        <Text role="control" size="xs" color="accent" uppercase tracking={0.16}>
          {named.label}
        </Text>
        <View style={styles.value}>
          <Text role="display" tracking={FIGURE_TRACKING} size="6xl">
            {decimal(value, locale)}
          </Text>
          <Text role="control" size="lg" color="secondary" style={styles.unit}>
            {measure.suffix}
          </Text>
        </View>
        <Text role="body" size="xs" color="secondary">
          {last && lastShown !== undefined
            ? words.lastTime(
                `${decimal(lastShown, locale)} ${measure.suffix}`,
                shortDay(last.measured_on, text),
              )
            : words.first}
        </Text>
      </View>

      <WheelPicker
        orientation="horizontal"
        values={run}
        value={value}
        onChange={(chosen) => {
          setValues({ ...values, [measure.code]: chosen })
          selectionTick()
        }}
        formatValue={(shown) => decimal(shown, locale)}
        suffix={measure.suffix}
        accessibilityLabel={named.label}
        accessibilityText={`${decimal(value, locale)} ${measure.suffix}`}
      />

      <View style={styles.bottom}>
        <Note boxed accent>
          {named.how}
        </Note>
        {failure ? <InlineAlert message={failure} /> : null}
        <View style={styles.actions}>
          <Button label={words.skip} variant="secondary" onPress={advance} style={styles.skip} />
          <Button
            label={nextMeasure ? words.next(words.each[nextMeasure.code].short) : words.finish}
            icon={nextMeasure ? 'forward' : 'check'}
            loading={saving}
            onPress={() => void saveAndAdvance()}
            style={styles.grow}
          />
        </View>
      </View>
      {upgrade.sheet}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: 'center' },
  step: { width: 44, textAlign: 'right' },
  chipRow: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: FIGURE_HEIGHT },
  figure: { width: FIGURE_WIDTH, height: FIGURE_HEIGHT },
  reading: { alignItems: 'center', gap: 4, paddingBottom: 8 },
  value: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  unit: { paddingBottom: 8 },
  bottom: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 12 },
  how: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  skip: { width: 110 },
  grow: { flex: 1 },
})

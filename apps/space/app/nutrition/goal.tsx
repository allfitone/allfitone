/**
 * Mi meta de nutrición (N-6d, HU-SP-073, ADR-040).
 *
 * Energy leads, exact or as a range; each macro, fibre and water then takes a minimum,
 * an exact figure, a range, a maximum or no goal at all — «sin meta» is a choice, and it
 * leaves the nutrient out of the goal rather than setting it to zero. Publishing makes a
 * new version: the current one is superseded and stays in the history, as the foot says.
 *
 * **What a macro is worth is drawn, not left to arithmetic.** Each macro card rings its
 * share of the day's energy and the energy card splits its bar by the same shares, so
 * somebody setting 150 g of protein sees that it is a quarter of the day.
 *
 * **The value is typed.** The editor sits on the screen, under the macro it is editing,
 * instead of in a sheet with steppers: reaching 150 g in steps of five was six presses,
 * and a sheet lifted by the keyboard floated on device. − and + stay for small moves.
 */

import { type BadgeTone } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { type IconName } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { ProgressRing } from '@allfitone/react-native/progress-ring'
import { Screen } from '@allfitone/react-native/screen'
import { StatTile } from '@allfitone/react-native/stat-tile'
import { Tabs } from '@allfitone/react-native/tabs'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import {
  energyOf,
  macroKcal,
  macroShares,
  MACROS,
  modeCaption,
  orderedRange,
  START,
  withMode,
} from '../../src/client/goal-energy'
import {
  formFromGoal,
  targetsFromForm,
  type FormMode,
  type FormTarget,
  type GoalForm,
  type GoalNutrient,
} from '../../src/client/nutrition'
import { createSpaceNutritionFlow } from '../../src/client/nutrition-transport'
import { GoalEnergyFigure } from '../../src/components/goal-energy-figure'
import { GoalSlider } from '../../src/components/goal-slider'
import { GoalValueField } from '../../src/components/goal-value-field'
import { CardGlow, FIGURE_TRACKING, foodIcon } from '../../src/components/nutrition-ui'
import { useLocale, useText } from '../../src/i18n/use-text'
import { intlLocale, type Locale } from '../../src/i18n'

const MODES: readonly FormMode[] = ['minimum', 'exact', 'range', 'maximum', 'none']
/** The colour each nutrient wears, as the design system's tones. */
const NUTRIENT_TONES: Record<GoalNutrient, BadgeTone> = {
  energy: 'accent',
  protein: 'strength',
  carbohydrates: 'highIntensity',
  fat: 'rhythm',
  fiber: 'wellbeing',
  water: 'info',
}
const EXTRAS: readonly { readonly code: GoalNutrient; readonly icon: IconName }[] = [
  { code: 'fiber', icon: foodIcon('grain') },
  { code: 'water', icon: foodIcon('water') },
]
const DEFAULT_FORM: GoalForm = {
  energy: { mode: 'exact', low: START.energy.value, high: null },
  protein: { mode: 'none', low: null, high: null },
  carbohydrates: { mode: 'none', low: null, high: null },
  fat: { mode: 'none', low: null, high: null },
  fiber: { mode: 'none', low: null, high: null },
  water: { mode: 'none', low: null, high: null },
}

const unitOf = (code: GoalNutrient) => (code === 'energy' ? 'kcal' : code === 'water' ? 'ml' : 'g')
const number = (value: number | null, locale: Locale) =>
  Math.round(value ?? 0).toLocaleString(intlLocale(locale))

function valueText(target: FormTarget, locale: Locale): string {
  if (target.mode === 'none') return '—'
  if (target.mode === 'range') return `${number(target.low, locale)}–${number(target.high, locale)}`
  return number(target.mode === 'maximum' ? target.high : target.low, locale)
}

export default function GoalScreen() {
  const locale = useLocale()
  const text = useText().nutrition
  const words = text.goalForm
  const { modeNames, nutrients: names, nutrientsShort: shortNames } = text
  const router = useRouter()
  const theme = useTheme()
  const flow = useMemo(() => createSpaceNutritionFlow(), [])
  const [form, setForm] = useState<GoalForm>(DEFAULT_FORM)
  const [hasGoal, setHasGoal] = useState(false)
  const [selected, setSelected] = useState<GoalNutrient>('protein')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    flow
      .readGoals()
      .then((goals) => {
        if (!active || !goals.active) return
        const read = formFromGoal(goals.active.targets)
        setForm(read.energy.mode === 'none' ? { ...read, energy: DEFAULT_FORM.energy } : read)
        setSelected(MACROS.find((code) => read[code].mode !== 'none') ?? 'protein')
        setHasGoal(true)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [flow])

  const set = (code: GoalNutrient, target: FormTarget) =>
    setForm((current) => ({ ...current, [code]: target }))
  const energy = form.energy
  const shares = macroShares(form)
  const low = energy.low ?? START.energy.value
  const high = energy.high ?? low
  // A range typed backwards is put right when typing ends, as the macros' are.
  const settleEnergy = () =>
    setForm((current) => ({ ...current, energy: orderedRange(current.energy) }))

  const publish = () => {
    setBusy(true)
    setFailure(undefined)
    flow
      .publishGoal(targetsFromForm(form))
      .then(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        router.back()
      })
      .catch(() => setFailure(words.publishFailed))
      .finally(() => setBusy(false))
  }

  const target = form[selected]
  const kcal = macroKcal(selected, target)
  const fieldFor = (end: 'low' | 'high', autoFocus = false) => {
    const caption = modeCaption(target.mode, end, locale)
    return (
      <View style={styles.fieldBlock} key={end}>
        <Text role="control" size="sm" color="secondary">
          {caption}
        </Text>
        <GoalValueField
          value={target[end]}
          onChange={(value) => set(selected, { ...target, [end]: value })}
          unit={unitOf(selected)}
          step={START[selected].step}
          max={START[selected].max}
          accessibilityLabel={`${names[selected]}, ${caption.toLowerCase()}`}
          keyboardTitle={`${shortNames[selected]} · ${caption.toLowerCase()}`}
          autoFocus={autoFocus}
          onDone={() =>
            setForm((current) => ({ ...current, [selected]: orderedRange(current[selected]) }))
          }
        />
      </View>
    )
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="close" accessibilityLabel={words.close} onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.grow}>
          {words.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* N-6f: the same height exact or as a range, so switching moves nothing below it. */}
        <View
          style={[
            styles.energy,
            {
              backgroundColor: theme.color.background.surface,
              borderColor: theme.color.border.subtle,
            },
          ]}
        >
          <CardGlow />
          <View style={styles.energyHead}>
            <Text role="control" size="sm" color="secondary" style={styles.grow}>
              {words.dailyEnergy}
            </Text>
            <Tabs
              labelStyle="control"
              accessibilityLabel={words.energyKind}
              items={[
                { value: 'exact', label: modeNames.exact },
                { value: 'range', label: modeNames.range },
              ]}
              value={energy.mode === 'range' ? 'range' : 'exact'}
              onChange={(mode) => set('energy', withMode('energy', energy, mode))}
              style={styles.energyTabs}
            />
          </View>
          <View style={styles.energyFigures}>
            <GoalEnergyFigure
              value={low}
              onChange={(value) => set('energy', { ...energy, low: value })}
              max={START.energy.max}
              label={energy.mode === 'range' ? text.captions.from : modeNames.exact}
              keyboardTitle={
                energy.mode === 'range' ? words.energyFromTitle : words.energyExactTitle
              }
              onDone={settleEnergy}
            />
            {energy.mode === 'range' ? (
              <>
                <Text role="display" size="3xl" color="muted" style={styles.dash}>
                  –
                </Text>
                <GoalEnergyFigure
                  value={high}
                  onChange={(value) => set('energy', { ...energy, high: value })}
                  max={START.energy.max}
                  label={text.captions.to}
                  keyboardTitle={words.energyToTitle}
                  onDone={settleEnergy}
                />
              </>
            ) : null}
            <Text role="control" size="md" color="secondary" style={styles.energyUnit}>
              kcal
            </Text>
          </View>
          <GoalSlider
            low={low}
            high={energy.mode === 'range' ? high : null}
            step={START.energy.step}
            unit="kcal"
            lowLabel={energy.mode === 'range' ? words.energyFromLabel : words.dailyEnergy}
            highLabel={words.energyToLabel}
            onChange={(nextLow, nextHigh) =>
              set(
                'energy',
                energy.mode === 'range'
                  ? { ...energy, low: nextLow, high: nextHigh }
                  : { ...energy, low: nextLow },
              )
            }
          />
        </View>

        <Text role="control" size="lg">
          {words.macros}
        </Text>
        <View style={styles.macros}>
          {MACROS.map((code) => {
            const share = shares[code]
            const on = form[code].mode !== 'none'
            const picked = selected === code
            return (
              <StatTile
                key={code}
                layout="stack"
                tone={NUTRIENT_TONES[code]}
                visual={
                  <ProgressRing size={76} stroke={7} share={share ?? 0} tone={NUTRIENT_TONES[code]}>
                    <Text role="poster" tracking={FIGURE_TRACKING} size="lg">
                      {share === null ? '—' : `${String(Math.round(share * 100))}%`}
                    </Text>
                    <Text role="body" size="2xs" color="muted">
                      {words.ofKcal}
                    </Text>
                  </ProgressRing>
                }
                value={valueText(form[code], locale)}
                {...(on ? { unit: 'g' } : {})}
                label={shortNames[code]}
                mode={modeNames[form[code].mode]}
                selected={picked}
                onPress={() => setSelected(code)}
                accessibilityLabel={words.edit(
                  names[code],
                  on
                    ? `${modeNames[form[code].mode]}, ${valueText(form[code], locale)} g`
                    : words.noGoal,
                )}
                style={styles.grow}
              />
            )
          })}
        </View>

        <View
          style={[
            styles.editor,
            {
              backgroundColor: theme.color.background.surface,
              borderColor: theme.color.border.subtle,
            },
          ]}
        >
          <View style={styles.editorHead}>
            <Text role="control" size="lg" style={styles.grow}>
              {names[selected]}
            </Text>
            {kcal !== null ? (
              <Text role="control" size="sm" color="muted">
                {`${number(kcal, locale)} kcal`}
              </Text>
            ) : null}
          </View>
          <Tabs
            labelStyle="control"
            accessibilityLabel={words.kind(names[selected])}
            items={MODES.map((mode) => ({ value: mode, label: modeNames[mode] }))}
            value={target.mode}
            onChange={(mode) => set(selected, withMode(selected, target, mode))}
          />
          {target.mode === 'none' ? (
            <Text role="body" size="sm" color="muted">
              {words.leftOut(names[selected])}
            </Text>
          ) : target.mode === 'range' ? (
            [fieldFor('low'), fieldFor('high')]
          ) : (
            fieldFor(target.mode === 'maximum' ? 'high' : 'low')
          )}
        </View>

        <View style={styles.extras}>
          {EXTRAS.map(({ code, icon }) => {
            const on = form[code].mode !== 'none'
            const picked = selected === code
            return (
              <StatTile
                key={code}
                layout="inline"
                tone={NUTRIENT_TONES[code]}
                icon={icon}
                label={names[code]}
                value={on ? `${valueText(form[code], locale)} ${unitOf(code)}` : text.noGoal}
                empty={!on}
                selected={picked}
                onPress={() => setSelected(code)}
                accessibilityLabel={words.edit(
                  names[code],
                  on ? `${valueText(form[code], locale)} ${unitOf(code)}` : words.noGoal,
                )}
                style={styles.grow}
              />
            )
          })}
        </View>

        {failure ? <InlineAlert message={failure} /> : null}
      </ScrollView>

      <View style={styles.foot}>
        {hasGoal ? (
          <Text role="body" size="xs" color="muted" align="center">
            {words.replaces}
          </Text>
        ) : null}
        <Button
          label={words.publish}
          loading={busy}
          disabled={targetsFromForm(form).length === 0 || energyOf(energy) === null}
          onPress={publish}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  energy: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 16, overflow: 'hidden' },
  energyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  energyTabs: { width: 150 },
  energyFigures: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dash: { paddingTop: 8 },
  energyUnit: { paddingTop: 22 },
  macros: { flexDirection: 'row', gap: 10 },
  editor: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 14 },
  editorHead: { flexDirection: 'row', alignItems: 'center' },
  fieldBlock: { gap: 8 },
  extras: { flexDirection: 'row', gap: 10 },
  foot: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
})

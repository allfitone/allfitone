/**
 * The sheets of capturing a meal (R-F4, R-A3, R-M, ADR-041).
 *
 * - **Adjust an item** (R-F4): the amount in its portion, or in grams; the values the
 *   catalogue calculates, each one editable, with «Editado por ti» and what it would have
 *   been; «Volver a lo calculado» drops every edit. Changing the amount recalculates all
 *   but what the person typed.
 * - **Choose how much** (R-A3): a food from the search, its portions as chips, the kcal and
 *   macros of the one chosen.
 * - **Consent** before a photo first leaves Allfit: what is sent, to whom, and what is not
 *   kept. Searching never needs it.
 * - **The meal**, from the pill: what the hour suggested, and the others.
 */

import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme, type Theme } from '@allfitone/react-native/theme'
import { withAlpha } from '@allfitone/react-native/tokens'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated'

import {
  isEstimated,
  portionText,
  restoreCalculated,
  shownValues,
  withAmount,
  withEdit,
  type CaptureItem,
  type Food,
} from '../client/capture'
import { MEAL_TYPES, type GoalTarget, type MealType, type NutrientCode } from '../client/nutrition'
import { intlLocale, type Locale } from '../i18n'
import { useLocale, useText } from '../i18n/use-text'
import { AmountField, NutrientCells, NutritionFacts } from './nutrition-facts'
import { CardGlow, FIGURE_TRACKING, foodIcon, macroColor, MEAL_ICON } from './nutrition-ui'

/** A food's tile: its DS food icon, on the tint of the macro it is mostly made of. */
export function FoodTile({
  icon,
  food,
  size = 40,
}: {
  readonly icon: string
  readonly food: Food | null
  readonly size?: number
}) {
  const theme = useTheme()
  const tint = tintFor(theme, food)
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: withAlpha(tint, 0.15),
        },
      ]}
    >
      <FoundationIcon name={foodIcon(icon)} customSize={size * 0.5} color={tint} decorative />
    </View>
  )
}

/** The macro a food is mostly made of colours its tile, as the day's cards do. */
function tintFor(theme: Theme, food: Food | null): string {
  if (!food) return theme.color.icon.secondary
  const grams = (code: NutrientCode) =>
    food.nutrients.find((nutrient) => nutrient.nutrient_code === code)?.value_per_100g ?? 0
  const protein = grams('protein') * 4
  const carbs = grams('carbohydrates') * 4
  const fat = grams('fat') * 9
  if (protein >= carbs && protein >= fat) return macroColor(theme, 'protein')
  return carbs >= fat ? macroColor(theme, 'carbohydrates') : macroColor(theme, 'fat')
}

// ———————————————————————————————————————— R-F4, R-A3

/** The amount, the four figures and the label of one item, on its screen. */
export function ItemEditor({
  item,
  targets,
  onChange,
}: {
  readonly item: CaptureItem
  readonly targets: readonly GoalTarget[]
  readonly onChange: (item: CaptureItem) => void
}) {
  const theme = useTheme()
  const locale = useLocale()
  const text = useText().nutrition.editor
  const shown = shownValues(item)
  const edited = Object.keys(item.edited).length > 0
  const estimated = isEstimated(item)
  return (
    <>
      <ItemHero item={item} shown={shown} estimated={estimated} />
      <Section title={text.howMuch}>
        <AmountField
          food={item.food}
          amount={item.amount}
          unit={item.unit}
          mode={item.mode}
          grams={item.grams}
          onChange={(amount, unit, mode) => onChange(withAmount(item, amount, unit, mode))}
        />
      </Section>
      <Section title={text.values} hint={text.valuesHint}>
        <NutrientCells
          shown={shown}
          edited={item.edited}
          estimated={estimated}
          onEdit={(code, value) => onChange(withEdit(item, code, value))}
        />
        {edited ? (
          <Animated.View
            entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(120)}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => onChange(restoreCalculated(item))}
              style={styles.restore}
            >
              <FoundationIcon name="history" size="xs" color={theme.color.icon.accent} decorative />
              <Text role="control" size="sm" color="accent">
                {text.restore}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Section>
      <NutritionFacts
        values={shown}
        portion={portionWithGrams(item, locale)}
        targets={targets}
        estimated={estimated}
      />
    </>
  )
}

/** «1 vaso (240 g)», or just «35 g» when the unit is already the gram. */
const portionWithGrams = (item: CaptureItem, locale: Locale) =>
  item.unit.label === 'g'
    ? portionText(item, locale)
    : `${portionText(item, locale)} (${String(Math.round(item.grams))} g)`

const MACRO_PARTS = ['protein', 'carbohydrates', 'fat'] as const
const tenth = (value: number, locale: Locale) =>
  (Math.round(value * 10) / 10).toLocaleString(intlLocale(locale), { useGrouping: false })

/**
 * The food at a glance, as the diary's energy card: its tile on the accent's glow, the
 * kilocalories large, where they came from, and how the macros split.
 */
function ItemHero({
  item,
  shown,
  estimated,
}: {
  readonly item: CaptureItem
  readonly shown: ReturnType<typeof shownValues>
  readonly estimated: boolean
}) {
  const theme = useTheme()
  const locale = useLocale()
  const text = useText().nutrition
  const grams = MACRO_PARTS.map((code) => shown[code] ?? 0)
  const total = Math.max(
    1,
    grams.reduce((sum, value) => sum + value, 0),
  )
  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: theme.color.background.surface, borderColor: theme.color.border.subtle },
      ]}
    >
      <CardGlow size={200} right={-60} top={-70} />
      <View style={styles.heroTop}>
        <FoodTile icon={item.icon} food={item.food} size={52} />
        <View style={styles.grow}>
          <View style={styles.heroFigure}>
            <Text role="display" tracking={FIGURE_TRACKING} size="5xl">
              {shown.energy === undefined ? '—' : String(Math.round(shown.energy))}
            </Text>
            <Text role="control" size="md" color="secondary" style={styles.heroUnit}>
              kcal
            </Text>
          </View>
          <Text role="control" size="xs" color="accent">
            {estimated ? text.editor.estimated : text.editor.calculated}
          </Text>
        </View>
      </View>
      <Text role="body" size="sm" color="secondary">
        {portionWithGrams(item, locale)}
      </Text>
      <View style={styles.split}>
        {MACRO_PARTS.map((code, at) => (
          <View
            key={code}
            style={[
              styles.splitPart,
              {
                flex: Math.max(0.02, (grams[at] ?? 0) / total),
                backgroundColor: macroColor(theme, code),
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {MACRO_PARTS.map((code, at) => (
          <View key={code} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: macroColor(theme, code) }]} />
            <Text role="control" size="sm">{`${tenth(grams[at] ?? 0, locale)} g`}</Text>
            <Text role="body" size="sm" color="muted">
              {text.macroLegend[code]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** A titled part of the item screen, with an optional line of help under the title. */
function Section({
  title,
  hint,
  children,
}: {
  readonly title: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text role="control" size="lg" accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text role="body" size="sm" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

// ———————————————————————————————————————— consent

// The consent texts, one per version, live in the dictionary (`nutrition.consent.texts`).
export function ConsentSheet({
  visible,
  text,
  busy,
  onAccept,
  onDecline,
}: {
  readonly visible: boolean
  readonly text: string
  readonly busy: boolean
  readonly onAccept: () => void
  readonly onDecline: () => void
}) {
  const theme = useTheme()
  const words = useText().nutrition.consent
  return (
    <Sheet visible={visible} onDismiss={onDecline} title={words.title} hideTitle>
      <View style={styles.sheet}>
        <View
          style={[
            styles.consentIcon,
            { backgroundColor: withAlpha(theme.color.icon.accent, 0.12) },
          ]}
        >
          <FoundationIcon name="camera" size="md" color={theme.color.icon.accent} decorative />
        </View>
        <Text role="control" size="xl" align="center" accessibilityRole="header">
          {words.title}
        </Text>
        <Text role="body" size="md" color="secondary" align="center">
          {text}
        </Text>
        <Button label={words.accept} loading={busy} onPress={onAccept} />
        <Button label={words.decline} variant="ghost" disabled={busy} onPress={onDecline} />
      </View>
    </Sheet>
  )
}

// ———————————————————————————————————————— R-M

export function MealMenu({
  visible,
  value,
  suggested,
  top,
  onChoose,
  onDismiss,
}: {
  readonly visible: boolean
  readonly value: MealType
  readonly suggested: MealType
  readonly top: number
  readonly onChoose: (type: MealType) => void
  readonly onDismiss: () => void
}) {
  const theme = useTheme()
  const text = useText().nutrition
  if (!visible) return null
  return (
    <Animated.View
      entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120)}
      style={[StyleSheet.absoluteFill, styles.menuLayer]}
    >
      <Pressable
        accessibilityLabel={text.menu.close}
        onPress={onDismiss}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: withAlpha(theme.color.background.canvas, 0.7) },
        ]}
      />
      <View
        style={[
          styles.menu,
          {
            top,
            backgroundColor: theme.color.background.surface,
            borderColor: theme.color.border.subtle,
          },
        ]}
      >
        {MEAL_TYPES.map((type) => (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityState={{ selected: type === value }}
            onPress={() => onChoose(type)}
            style={styles.menuRow}
          >
            <FoundationIcon
              name={MEAL_ICON[type]}
              size="sm"
              color={theme.color.icon.secondary}
              decorative
            />
            <Text
              role="control"
              size="md"
              color={type === value ? 'primary' : 'secondary'}
              style={styles.grow}
            >
              {text.meals[type]}
            </Text>
            {type === value ? (
              <FoundationIcon name="check" size="sm" color={theme.color.icon.accent} decorative />
            ) : null}
          </Pressable>
        ))}
      </View>
      <Text
        role="body"
        size="sm"
        color="secondary"
        align="center"
        style={[styles.menuHint, { top: top + 260 }]}
      >
        {text.menu.hint(text.meals[suggested])}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 12, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroFigure: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  heroUnit: { paddingBottom: 8 },
  split: { flexDirection: 'row', gap: 4, height: 6 },
  splitPart: { borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  section: { gap: 12 },
  sectionHead: { gap: 2 },
  grow: { flex: 1, gap: 2 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  sheet: { gap: 14, paddingBottom: 8 },
  restore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  consentIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  menuLayer: { zIndex: 20 },
  menu: {
    position: 'absolute',
    alignSelf: 'center',
    width: 200,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuHint: { position: 'absolute', left: 40, right: 40 },
})

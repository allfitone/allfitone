/**
 * Registrar o corregir una comida (N-2c, N-4d, N-4e, HU-SP-067, HU-SP-069, ADR-040).
 *
 * **The total adds up as it is typed.** Each item takes its grams and whatever nutrients
 * the person knows; a nutrient left blank stays blank, never zero, and the caption says
 * so. Fibre and water are offered on demand because most meals record neither.
 *
 * **Recording and the photo are two writes**, as the contract fixes: the meal is
 * recorded first, then its photo is attached as a correction, so a photo that fails to
 * upload never loses the meal. A record keeps its command until it lands, so a retry
 * logs it once.
 *
 * **A correction keeps the hour and the day** (OP-NUT-001 froze them) and names the
 * revision it read. If the meal changed on another device meanwhile, nothing is
 * overwritten: the sheet offers the saved version or to drop this correction (N-4e).
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { getNativeFontFamily } from '@allfitone/react-native/fonts'
import { typography, withAlpha } from '@allfitone/react-native/tokens'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ApiError } from '../../src/client'
import { clockLabel, clockOf, withClock } from '../../src/client/finished'
import {
  emptyItem,
  formFromMeal,
  formTotals,
  itemsFromForm,
  MEAL_TYPES,
  type Extra,
  type FormItem,
  type MealType,
  type NutrientCode,
  type NutritionMeal,
} from '../../src/client/nutrition'
import { createSpaceNutritionFlow } from '../../src/client/nutrition-transport'
import { deviceTimezone } from '../../src/client/timezone'
import { FIGURE_TRACKING, macroColor, MacroDots } from '../../src/components/nutrition-ui'
import { SheetChoice } from '../../src/components/sheet-choice'
import { ClockWheels } from '../../src/components/time-wheels'
import { useLocale, useText } from '../../src/i18n/use-text'

const HEADER_HEIGHT = 330

const CELLS: readonly {
  readonly code: 'energy' | 'protein' | 'carbohydrates' | 'fat'
  readonly unit: string
}[] = [
  { code: 'energy', unit: '' },
  { code: 'protein', unit: 'g' },
  { code: 'carbohydrates', unit: 'g' },
  { code: 'fat', unit: 'g' },
]
const EXTRAS: readonly { readonly code: Extra; readonly unit: string }[] = [
  { code: 'fiber', unit: 'g' },
  { code: 'water', unit: 'ml' },
]

const two = (value: number) => String(value).padStart(2, '0')
const localDay = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())

type Photo = {
  readonly uri: string
  readonly base64: string
  readonly type: 'image/jpeg' | 'image/png' | 'image/webp'
}

export default function LogMealScreen() {
  const {
    mealId,
    day: dayParam,
    type,
  } = useLocalSearchParams<{ mealId?: string; day?: string; type?: string }>()
  const router = useRouter()
  const theme = useTheme()
  const locale = useLocale()
  const text = useText().nutrition
  const insets = useSafeAreaInsets()
  const timeZone = useMemo(() => deviceTimezone(), [])
  const flow = useMemo(() => createSpaceNutritionFlow(), [])
  const correcting = typeof mealId === 'string' && mealId.length > 0
  const today = localDay(timeZone)
  const day = dayParam ?? today

  const [read, setRead] = useState<NutritionMeal | undefined>(undefined)
  const [mealType, setMealType] = useState<MealType>(
    MEAL_TYPES.find((one) => one === type) ?? 'lunch',
  )
  // A new meal on today is now; on an earlier day, its midday until the person says.
  const [occurredAt, setOccurredAt] = useState(() =>
    day === today
      ? new Date().toISOString()
      : (withClock(`${day}T17:00:00Z`, '12:00', timeZone) ?? new Date().toISOString()),
  )
  const [items, setItems] = useState<readonly FormItem[]>([emptyItem('item-1')])
  const [openKey, setOpenKey] = useState<string | undefined>('item-1')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<Photo | 'remove' | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [typing, setTyping] = useState(false)

  // The save bar would ride the keyboard over the fields being typed in, and take a tap meant for them.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardWillShow', () => setTyping(true))
    const hidden = Keyboard.addListener('keyboardWillHide', () => setTyping(false))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [])
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [asking, setAsking] = useState<'photo' | 'time' | 'conflict' | undefined>(undefined)
  const [clock, setClock] = useState({ hour: 12, minute: 0 })
  const draft = useRef(`draft-${String(Date.now())}`)
  const nextKey = useRef(2)

  const fill = (meal: NutritionMeal) => {
    setRead(meal)
    setMealType(meal.meal_type)
    setOccurredAt(meal.occurred_at)
    const form = formFromMeal(meal, locale)
    setItems(form.items)
    setOpenKey(form.items[0]?.key)
    setNote(meal.note ?? '')
    setPhoto(undefined)
  }

  useEffect(() => {
    if (!correcting) return
    let active = true
    flow
      .readMeal(mealId)
      .then((meal) => active && fill(meal))
      .catch(() => active && setFailure(text.mealReadFailed))
    return () => {
      active = false
    }
  }, [flow, correcting, mealId])

  const totals = formTotals(items)
  const named = itemsFromForm(items)
  const shownPhoto = photo === 'remove' ? null : photo ? photo.uri : (read?.photo?.url ?? null)
  const grams = (['protein', 'carbohydrates', 'fat'] as const).map((code) => totals[code] ?? 0)
  const gramsTotal = grams.reduce((sum, value) => sum + value, 0)

  const editItem = (key: string, change: Partial<FormItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))
  const setValue = (key: string, code: NutrientCode, value: string) =>
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, values: { ...item.values, [code]: value } } : item,
      ),
    )
  const addItem = () => {
    const key = `item-${String((nextKey.current += 1))}`
    setItems((current) => [...current, emptyItem(key)])
    setOpenKey(key)
  }
  const removeItem = (key: string) =>
    setItems((current) =>
      current.length === 1 ? current : current.filter((item) => item.key !== key),
    )

  const pick = async (from: 'camera' | 'library') => {
    setAsking(undefined)
    const options = { mediaTypes: ['images' as const], quality: 0.6, base64: true }
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) return
    }
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)
    const asset = result.canceled ? undefined : result.assets[0]
    if (!asset?.base64) return
    const mime =
      asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
        ? asset.mimeType
        : 'image/jpeg'
    setPhoto({ uri: asset.uri, base64: asset.base64, type: mime })
  }

  const photoPatch =
    photo === 'remove'
      ? { remove_photo: true }
      : photo
        ? { photo: { content_type: photo.type, content: photo.base64 } }
        : {}

  const save = async () => {
    if (named.length === 0) return
    setSaving(true)
    setFailure(undefined)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      if (read) {
        await flow.reviseMeal(read, {
          meal_type: mealType,
          note: note.trim() === '' ? null : note.trim(),
          items: named,
          ...photoPatch,
        })
      } else {
        const recorded = await flow.recordMeal(draft.current, {
          occurred_at: occurredAt,
          timezone: timeZone,
          meal_type: mealType,
          note: note.trim() === '' ? null : note.trim(),
          items: named,
        })
        if (photo && photo !== 'remove') {
          try {
            await flow.reviseMeal(recorded, {
              photo: { content_type: photo.type, content: photo.base64 },
            })
          } catch {
            setFailure(text.log.photoFailed)
            setSaving(false)
            return
          }
        }
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (cause) {
      setSaving(false)
      if (cause instanceof ApiError && cause.failure === 'conflict' && read) {
        setAsking('conflict')
        return
      }
      setFailure(text.mealSaveFailed)
    }
  }

  const time = clockOf(occurredAt, timeZone)
  const timeShown = clockLabel(occurredAt, timeZone)
  const dayLabel =
    (read?.local_date ?? day) === today
      ? text.today
      : text.log.shortDate(
          (read?.local_date ?? day).slice(8),
          (read?.local_date ?? day).slice(5, 7),
        )

  return (
    <Screen edges={[]} padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.grow}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.hero,
              {
                height: HEADER_HEIGHT + insets.top,
                paddingTop: insets.top + 64,
                backgroundColor: theme.color.background.surfaceMuted,
              },
            ]}
          >
            {shownPhoto ? (
              <Image source={shownPhoto} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.heroEmpty]}>
                <FoundationIcon
                  name="nutrition"
                  customSize={72}
                  color={theme.color.icon.secondary}
                  decorative
                />
              </View>
            )}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: withAlpha(theme.color.background.canvas, 0.4) },
              ]}
            />

            {correcting ? (
              <View
                style={[
                  styles.lockNote,
                  { backgroundColor: withAlpha(theme.color.background.canvas, 0.8) },
                ]}
              >
                <FoundationIcon
                  name="info"
                  size="xs"
                  color={theme.color.icon.secondary}
                  decorative
                />
                <Text role="body" size="xs" color="secondary">
                  {text.log.timeLocked}
                </Text>
              </View>
            ) : null}

            <View style={styles.heroBottom}>
              <View style={styles.total}>
                <Text
                  role="display"
                  tracking={FIGURE_TRACKING}
                  size="6xl"
                  style={styles.totalNumber}
                >
                  {String(Math.round(totals.energy ?? 0))}
                </Text>
                <View style={styles.totalUnit}>
                  <Text role="control" size="lg">
                    kcal
                  </Text>
                  <Text role="body" size="xs" color="secondary">
                    {text.log.addingUp}
                  </Text>
                </View>
              </View>
              <View style={styles.bar}>
                {(['protein', 'carbohydrates', 'fat'] as const).map((code, index) =>
                  (grams[index] ?? 0) > 0 ? (
                    <View
                      key={code}
                      style={{
                        flex: (grams[index] ?? 0) / Math.max(1, gramsTotal),
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: macroColor(theme, code),
                      }}
                    />
                  ) : null,
                )}
                {gramsTotal === 0 ? (
                  <View
                    style={[
                      styles.barEmpty,
                      { backgroundColor: theme.color.background.surfaceMuted },
                    ]}
                  />
                ) : null}
              </View>
              <MacroDots totals={totals} />
            </View>
          </View>

          <View style={[styles.body, { backgroundColor: theme.color.background.canvas }]}>
            <View style={[styles.types, { backgroundColor: theme.color.background.surface }]}>
              {MEAL_TYPES.map((one) => (
                <Pressable
                  key={one}
                  accessibilityRole="button"
                  accessibilityState={{ selected: one === mealType }}
                  onPress={() => setMealType(one)}
                  style={[
                    styles.type,
                    one === mealType ? { backgroundColor: theme.color.icon.accent } : null,
                  ]}
                >
                  <Text role="control" size="sm" color={one === mealType ? 'inverse' : 'secondary'}>
                    {text.meals[one]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionHead}>
              <Text role="control" size="lg">
                {text.whatYouAte}
              </Text>
              <Text role="body" size="sm" color="muted">
                {text.items(named.length)}
              </Text>
            </View>

            {failure ? <InlineAlert message={failure} /> : null}

            {items.map((item) =>
              item.key === openKey ? (
                <View
                  key={item.key}
                  style={[
                    styles.item,
                    {
                      backgroundColor: theme.color.background.surface,
                      borderColor: theme.color.border.subtle,
                    },
                  ]}
                >
                  <View style={styles.itemHead}>
                    <TextInput
                      accessibilityLabel={text.log.foodName}
                      testID="item-name"
                      value={item.name}
                      onChangeText={(name) => editItem(item.key, { name })}
                      placeholder={text.log.foodExample}
                      placeholderTextColor={theme.color.text.muted}
                      style={[styles.name, { color: theme.color.text.primary }]}
                    />
                    <View
                      style={[
                        styles.grams,
                        { backgroundColor: theme.color.background.surfaceMuted },
                      ]}
                    >
                      <TextInput
                        accessibilityLabel={text.log.grams}
                        testID="item-grams"
                        maxLength={6}
                        value={item.quantity}
                        onChangeText={(quantity) => editItem(item.key, { quantity })}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={theme.color.text.muted}
                        style={[styles.gramsInput, { color: theme.color.text.primary }]}
                      />
                      <Text role="body" size="sm" color="muted">
                        g
                      </Text>
                    </View>
                    {items.length > 1 ? (
                      <IconButton
                        icon="remove"
                        accessibilityLabel={text.log.removeFood}
                        onPress={() => removeItem(item.key)}
                      />
                    ) : null}
                  </View>
                  <View style={styles.cells}>
                    {[...CELLS, ...EXTRAS.filter((extra) => item.extras.includes(extra.code))].map(
                      (cell) => (
                        <View
                          key={cell.code}
                          style={[
                            styles.cell,
                            { backgroundColor: theme.color.background.surfaceMuted },
                          ]}
                        >
                          <View
                            style={[
                              styles.cellRule,
                              {
                                backgroundColor:
                                  cell.code === 'energy'
                                    ? theme.color.text.primary
                                    : macroColor(theme, cell.code),
                              },
                            ]}
                          />
                          <View style={styles.cellValue}>
                            <TextInput
                              accessibilityLabel={text.log.cells[cell.code]}
                              testID={`cell-${cell.code}`}
                              maxLength={6}
                              value={item.values[cell.code] ?? ''}
                              onChangeText={(value) => setValue(item.key, cell.code, value)}
                              keyboardType="decimal-pad"
                              placeholder="—"
                              placeholderTextColor={theme.color.text.muted}
                              style={[styles.cellInput, { color: theme.color.text.primary }]}
                            />
                            {cell.unit ? (
                              <Text role="body" size="xs" color="muted">
                                {cell.unit}
                              </Text>
                            ) : null}
                          </View>
                          <Text role="eyebrow" size="2xs" color="muted">
                            {text.log.cells[cell.code]}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                  <View style={styles.extras}>
                    {EXTRAS.filter((extra) => !item.extras.includes(extra.code)).map((extra) => (
                      <Pressable
                        key={extra.code}
                        accessibilityRole="button"
                        onPress={() => editItem(item.key, { extras: [...item.extras, extra.code] })}
                        style={[styles.extra, { borderColor: theme.color.border.default }]}
                      >
                        <FoundationIcon
                          name="add"
                          size="xs"
                          color={theme.color.icon.secondary}
                          decorative
                        />
                        <Text role="control" size="sm" color="secondary">
                          {text.nutrients[extra.code]}
                        </Text>
                      </Pressable>
                    ))}
                    <Text role="body" size="xs" color="muted" style={styles.grow}>
                      {text.log.blankStaysBlank}
                    </Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  onPress={() => setOpenKey(item.key)}
                  style={[
                    styles.itemShut,
                    {
                      backgroundColor: theme.color.background.surface,
                      borderColor: theme.color.border.subtle,
                    },
                  ]}
                >
                  <Text role="control" size="md" numberOfLines={1} style={styles.grow}>
                    {item.name.trim() || text.log.unnamed}
                    {item.quantity ? (
                      <Text role="body" size="sm" color="muted">{`  ${item.quantity} g`}</Text>
                    ) : null}
                  </Text>
                  <MacroDots totals={formTotals([item])} />
                  {formTotals([item]).energy !== undefined ? (
                    <Text
                      role="control"
                      size="sm"
                    >{`${String(Math.round(formTotals([item]).energy ?? 0))} kcal`}</Text>
                  ) : null}
                </Pressable>
              ),
            )}

            <Button label={text.log.addFood} icon="add" variant="secondary" onPress={addItem} />

            <View
              style={[
                styles.note,
                {
                  borderColor: note ? theme.color.border.accent : theme.color.border.subtle,
                  backgroundColor: theme.color.background.surface,
                },
              ]}
            >
              <FoundationIcon name="edit" size="sm" color={theme.color.icon.secondary} decorative />
              <View style={styles.grow}>
                <Text role="eyebrow" size="2xs" color="muted" uppercase>
                  {text.log.note}
                </Text>
                <TextInput
                  accessibilityLabel={text.log.noteLabel}
                  testID="note"
                  value={note}
                  onChangeText={setNote}
                  placeholder={text.log.noteExample}
                  placeholderTextColor={theme.color.text.muted}
                  maxLength={1000}
                  multiline
                  style={[styles.noteInput, { color: theme.color.text.primary }]}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {typing ? null : (
          <View
            style={[
              styles.foot,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                backgroundColor: theme.color.background.canvas,
              },
            ]}
          >
            <Button
              label={correcting ? text.log.saveCorrection : text.saveMeal(mealType)}
              icon="check"
              loading={saving}
              disabled={named.length === 0}
              onPress={() => void save()}
            />
          </View>
        )}
      </KeyboardAvoidingView>
      <View style={[styles.heroTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton
          icon="close"
          accessibilityLabel={text.closeUnsaved}
          onPress={() => router.back()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            correcting
              ? text.log.timeLockedLabel(dayLabel, timeShown)
              : text.log.timeLabel(dayLabel, timeShown)
          }
          disabled={correcting}
          onPress={() => {
            const [hour = 12, minute = 0] = time.split(':').map(Number)
            setClock({ hour, minute })
            setAsking('time')
          }}
          style={[
            styles.timeChip,
            { backgroundColor: withAlpha(theme.color.background.canvas, 0.8) },
          ]}
        >
          <FoundationIcon
            name={correcting ? 'locked' : 'time'}
            size="xs"
            color={theme.color.icon.primary}
            decorative
          />
          <Text role="control" size="sm">{`${dayLabel} · ${timeShown}`}</Text>
        </Pressable>
        <IconButton
          icon="camera"
          accessibilityLabel={text.log.photo}
          onPress={() => setAsking('photo')}
        />
      </View>

      <Sheet
        visible={asking === 'photo'}
        onDismiss={() => setAsking(undefined)}
        title={text.log.photo}
      >
        <View style={styles.sheet}>
          <SheetChoice name={text.log.takePhoto} onPress={() => void pick('camera')} />
          <SheetChoice name={text.log.fromLibrary} onPress={() => void pick('library')} />
          {shownPhoto ? (
            <SheetChoice
              name={text.log.removePhoto}
              destructive
              onPress={() => {
                setPhoto(read?.photo ? 'remove' : undefined)
                setAsking(undefined)
              }}
            />
          ) : null}
        </View>
      </Sheet>

      <Sheet
        visible={asking === 'time'}
        onDismiss={() => setAsking(undefined)}
        title={text.log.time}
      >
        <View style={styles.sheet}>
          <ClockWheels clock={clock} onChange={setClock} label={text.log.wheels} />
          <Button
            label={text.done}
            onPress={() => {
              const next = withClock(
                occurredAt,
                `${two(clock.hour)}:${two(clock.minute)}`,
                timeZone,
              )
              if (next) setOccurredAt(next)
              setAsking(undefined)
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={asking === 'conflict'}
        onDismiss={() => setAsking(undefined)}
        title={text.log.conflictTitle}
        hideTitle
      >
        <View style={styles.sheet}>
          <View
            style={[
              styles.conflictIcon,
              { backgroundColor: withAlpha(theme.color.status.warning, 0.15) },
            ]}
          >
            <FoundationIcon
              name="warning"
              size="md"
              color={theme.color.status.warning}
              decorative
            />
          </View>
          <Text role="control" size="xl" align="center" accessibilityRole="header">
            {text.log.conflictTitle}
          </Text>
          <Text role="body" size="md" color="secondary" align="center">
            {text.log.conflictBody}
          </Text>
          <Button
            label={text.log.seeSaved}
            onPress={() => {
              setAsking(undefined)
              if (correcting)
                void flow
                  .readMeal(mealId)
                  .then(fill)
                  .catch(() => setFailure(text.mealReadFailed))
            }}
          />
          <Button label={text.log.discard} variant="ghost" onPress={() => router.back()} />
        </View>
      </Sheet>
    </Screen>
  )
}

const figureFont = { fontFamily: getNativeFontFamily('poster'), fontSize: typography.size['2xl'] }

const styles = StyleSheet.create({
  grow: { flex: 1 },
  scroll: { paddingBottom: 24 },
  hero: { justifyContent: 'space-between' },
  heroEmpty: { alignItems: 'center', justifyContent: 'center' },
  heroTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  lockNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroBottom: { marginTop: 'auto', paddingHorizontal: 20, paddingBottom: 18, gap: 10 },
  total: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  totalNumber: { paddingRight: 4 },
  totalUnit: { paddingBottom: 10, gap: 2 },
  bar: { flexDirection: 'row', gap: 4 },
  barEmpty: { flex: 1, height: 8, borderRadius: 4 },
  body: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 12,
  },
  types: { flexDirection: 'row', borderRadius: 999, padding: 4 },
  type: {
    flexGrow: 1,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 4,
  },
  item: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: {
    flex: 1,
    fontFamily: getNativeFontFamily('control'),
    fontSize: typography.size.lg,
    paddingVertical: 4,
  },
  grams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gramsInput: {
    ...figureFont,
    fontSize: typography.size.xl,
    minWidth: 40,
    textAlign: 'right',
    paddingVertical: 0,
  },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexGrow: 1, flexBasis: '22%', borderRadius: 14, padding: 10, gap: 4 },
  cellRule: { width: 18, height: 3, borderRadius: 2 },
  cellValue: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  cellInput: { ...figureFont, flexGrow: 1, flexShrink: 1, minWidth: 30, paddingVertical: 0 },
  extras: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  extra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  itemShut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  note: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: 'flex-start',
  },
  noteInput: {
    fontFamily: getNativeFontFamily('body'),
    fontSize: typography.size.md,
    paddingVertical: 2,
  },
  foot: { paddingHorizontal: 20, paddingTop: 10 },
  sheet: { gap: 12, paddingBottom: 8 },
  conflictIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
})

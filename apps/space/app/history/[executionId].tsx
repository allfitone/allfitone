/**
 * A finished session, set by set (FIN-18, HU-SP-112, ADR-038).
 *
 * **What it opens on** is the session as it was recorded: what it trained, when, the four
 * figures, and every exercise with its sets. The set that beat everything before says
 * so, and the session is set against the last time the same routine was done.
 *
 * **From here the session can be edited, repeated, shared or deleted**, the four of them
 * in the menu and the two most used on screen. Deleting is annulling: nothing is erased,
 * the session stops counting. Before it is confirmed the menu's second step says what goes with it —
 * the records it holds and what the streak becomes — read from the server, because both
 * depend on every other session.
 *
 * **The header stays put** and the bar at the foot too: only the session scrolls.
 */

import { Badge } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { CoverTile } from '@allfitone/react-native/cover-tile'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { withAlpha } from '@allfitone/react-native/tokens'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { createSpaceContentFlow } from '../../src/client/content-transport'
import { litSlugsFor } from '../../src/client/exercise-catalogue'
import { readExerciseLibrary } from '../../src/client/exercise-library'
import type { FinishedExecution, InvalidationPreview } from '../../src/client/execution'
import { createSpaceExecutionFlow } from '../../src/client/execution-transport'
import {
  annulConsequences,
  bestSetLine,
  comparisonLine,
  deletionLine,
  exercisesLine,
  menuTitle,
  setLine,
  whenRange,
} from '../../src/client/finished'
import { ApiError } from '../../src/client/index'
import { durationLabel, groupsTitle } from '../../src/client/share-cards'
import { deviceTimezone } from '../../src/client/timezone'
import { ActionRow } from '../../src/components/action-row'
import { BodyFigure } from '../../src/components/body-figure'
import { INERT_SLUGS } from '../../src/client/focus-form'
import type { ShareCatalogue } from '../../src/components/share-card'
import { volumeFigure } from '../../src/client/history'
import { useLocale, useText } from '../../src/i18n/use-text'
import { useUnits } from '../../src/units/use-units'

/**
 * The sheet's steps move like pages: forward slides in from the right, back from the
 * left, the sheet's height following on the same curve. Reduced motion keeps the fade.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const STEP_MS = 240
const FORWARD = FadeInRight.duration(STEP_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System)
const BACKWARD = FadeInLeft.duration(STEP_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System)
const RESIZE = LinearTransition.duration(STEP_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System)
/** Each consequence a beat after the one above, as the preview arrives. */
const LINE = (index: number) =>
  FadeInDown.duration(220)
    .delay(index * 60)
    .easing(EASE_OUT)
    .reduceMotion(ReduceMotion.System)
/** Long enough to read «Entreno eliminado», short enough not to wait for it. */
const DELETED_MS = 900

type Catalogue = ShareCatalogue & { readonly pictures: ReadonlyMap<string, string | null> }

export default function FinishedSessionScreen() {
  const { executionId } = useLocalSearchParams<{ executionId: string }>()
  const words = useText().session
  const said = words.finished
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const timeZone = deviceTimezone()
  const flow = useMemo(() => createSpaceExecutionFlow(), [])

  const [detail, setDetail] = useState<FinishedExecution | undefined>(undefined)
  const [catalogue, setCatalogue] = useState<Catalogue>({
    movements: [],
    muscles: [],
    pictures: new Map(),
  })
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /** One sheet for the menu and its delete step: iOS will not present a second while the first leaves. */
  const [sheet, setSheet] = useState<'menu' | 'delete' | 'deleted' | undefined>(undefined)
  /** Which way the menu comes back: from the left when «Cancelar» returns to it. */
  const [back, setBack] = useState(false)
  const [repeating, setRepeating] = useState(false)

  // Read again whenever it is looked at: coming back from editing it shows the correction.
  useFocusEffect(
    useCallback(() => {
      let active = true
      Promise.all([
        flow.readFinished(executionId, timeZone),
        readExerciseLibrary(createSpaceContentFlow()).catch(() => undefined),
      ])
        .then(([read, library]) => {
          if (!active) return
          setDetail(read)
          const movements = library?.movements ?? []
          setCatalogue({
            movements,
            muscles: library?.muscles ?? [],
            pictures: new Map(movements.map((one) => [one.id, one.demo_url])),
          })
        })
        .catch(() => active && setFailure(said.readFailed))
      return () => {
        active = false
      }
    }, [flow, executionId, timeZone, said]),
  )

  const name = detail?.title ?? words.freeSession

  const repeat = () => {
    setSheet(undefined)
    setRepeating(true)
    setFailure(undefined)
    flow
      .repeat(executionId, timeZone)
      .then((opened) =>
        router.replace({ pathname: '/session/[executionId]', params: { executionId: opened } }),
      )
      .catch((cause: unknown) =>
        setFailure(
          cause instanceof ApiError && cause.failure === 'conflict'
            ? said.stillOpen
            : said.repeatFailed,
        ),
      )
      .finally(() => setRepeating(false))
  }
  const share = () => {
    setSheet(undefined)
    router.push({ pathname: '/session/share/[executionId]', params: { executionId, back: '1' } })
  }
  const edit = () => {
    setSheet(undefined)
    router.push({ pathname: '/session/[executionId]', params: { executionId, mode: 'edit' } })
  }

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={said.backToHistory}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/history'))}
        />
        <Text role="control" size="lg" color="secondary" style={styles.title}>
          {said.title}
        </Text>
        <IconButton icon="edit" accessibilityLabel={said.edit} disabled={!detail} onPress={edit} />
        <IconButton
          icon="more"
          accessibilityLabel={said.more}
          disabled={!detail}
          onPress={() => {
            setBack(false)
            setSheet('menu')
          }}
        />
      </View>

      {detail ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Hero detail={detail} catalogue={catalogue} timeZone={timeZone} />
          {failure ? <InlineAlert message={failure} /> : null}
          <View style={styles.sectionHead}>
            <Text role="eyebrow" size="xs" color="muted" uppercase>
              {said.exercises}
            </Text>
            <Text role="body" size="xs" color="muted">
              {exercisesLine(detail, words)}
            </Text>
          </View>
          {detail.exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.position}
              exercise={exercise}
              picture={
                exercise.movement_id ? (catalogue.pictures.get(exercise.movement_id) ?? null) : null
              }
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.waiting}>
          {failure ? (
            <InlineAlert message={failure} />
          ) : (
            <ActivityIndicator color={theme.color.icon.accent} />
          )}
        </View>
      )}

      {detail ? (
        // To the screen's edge, its own padding over the home indicator: with the
        // screen's bottom inset the canvas showed as a gap below it.
        <View
          style={[
            styles.foot,
            {
              borderTopColor: theme.color.border.subtle,
              backgroundColor: theme.color.background.canvas,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.footRow}>
            <IconButton icon="share" accessibilityLabel={said.share} onPress={share} />
            {detail.repeatable ? (
              <View style={styles.grow}>
                <Button label={said.repeat} icon="duplicate" loading={repeating} onPress={repeat} />
              </View>
            ) : null}
          </View>
          {detail.repeatable ? (
            <Text role="body" size="xs" color="muted" align="center">
              {said.repeatNote}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Sheet
        visible={sheet !== undefined}
        onDismiss={() => setSheet(undefined)}
        title={
          sheet === 'deleted'
            ? said.deleted
            : sheet === 'delete'
              ? said.deleteAsk
              : detail
                ? menuTitle(name, detail.started_at, timeZone, words)
                : words.workout
        }
      >
        {/* Keyed by step, so each step enters as a page and the sheet resizes to it. */}
        <Animated.View layout={RESIZE} style={styles.steps}>
          {sheet === 'deleted' ? (
            <Animated.View key="deleted" entering={FORWARD} style={styles.deleted}>
              <Animated.View
                entering={FadeIn.duration(260).delay(80).reduceMotion(ReduceMotion.System)}
                style={[
                  styles.doneMark,
                  { backgroundColor: withAlpha(theme.color.status.success, 0.15) },
                ]}
              >
                <FoundationIcon
                  name="check"
                  size="lg"
                  color={theme.color.status.success}
                  decorative
                />
              </Animated.View>
              <Text role="body" size="md" color="secondary" align="center">
                {said.deletedNote}
              </Text>
            </Animated.View>
          ) : sheet === 'delete' && detail ? (
            <Animated.View key="delete" entering={FORWARD}>
              <DeleteStep
                name={name}
                detail={detail}
                timeZone={timeZone}
                onCancel={() => {
                  void Haptics.selectionAsync()
                  setBack(true)
                  setSheet('menu')
                }}
                onDeleted={() => {
                  // The moment it is gone, felt and seen together; then the way out.
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                  setSheet('deleted')
                  setTimeout(() => {
                    setSheet(undefined)
                    if (router.canGoBack()) router.back()
                    else router.replace('/history')
                  }, DELETED_MS)
                }}
              />
            </Animated.View>
          ) : (
            <Animated.View key="menu" {...(back ? { entering: BACKWARD } : {})} style={styles.menu}>
              <ActionRow icon="edit" name={said.edit} detail={said.editDetail} onPress={edit} />
              {detail?.repeatable ? (
                <ActionRow
                  icon="duplicate"
                  name={said.repeat}
                  detail={said.repeatDetail}
                  onPress={repeat}
                />
              ) : null}
              <ActionRow icon="share" name={said.share} detail={said.shareDetail} onPress={share} />
              <ActionRow
                icon="remove"
                name={said.delete}
                detail={said.deleteDetail}
                danger
                onPress={() => {
                  void Haptics.selectionAsync()
                  setSheet('delete')
                }}
              />
            </Animated.View>
          )}
        </Animated.View>
      </Sheet>
    </Screen>
  )
}

/** The card at the top: what it trained, when, and its four figures. */
function Hero({
  detail,
  catalogue,
  timeZone,
}: {
  readonly detail: FinishedExecution
  readonly catalogue: Catalogue
  readonly timeZone: string
}) {
  const locale = useLocale()
  const words = useText().session
  const said = words.finished
  const { mass } = useUnits()
  const theme = useTheme()
  // The groups title and the figure read the same exercises the share cards do.
  const worked = {
    title: detail.title,
    exercises: detail.exercises.map((exercise) => ({
      movement_id: exercise.movement_id,
      work_sets: exercise.sets.filter((one) => one.kind !== 'warmup').length,
    })),
  }
  const musclesOf = new Map(catalogue.movements.map((one) => [one.id, one.muscles]))
  const main = worked.exercises.flatMap((exercise) =>
    exercise.movement_id ? (musclesOf.get(exercise.movement_id) ?? []).slice(0, 1) : [],
  )
  const lit = litSlugsFor(catalogue.muscles, main)
  const comparison = comparisonLine(detail.previous, timeZone, words)
  const change = detail.previous?.change_percent ?? null
  const kilos = volumeFigure(detail.total_volume_kg ?? 0, mass, locale)
  const figures: readonly (readonly [string, string, boolean])[] = [
    [durationLabel(detail.duration_seconds), said.duration, false],
    [String(detail.work_sets), said.sets, false],
    [kilos, said.volume(mass), false],
    [String(detail.record_count), said.records, true],
  ]

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: theme.color.background.surface, borderColor: theme.color.border.subtle },
      ]}
    >
      <Text role="eyebrow" size="xs" color="accent" uppercase numberOfLines={1}>
        {said.completed(detail.session_number)}
      </Text>
      <View style={styles.heroTop}>
        <View style={styles.heroText}>
          <Text role="poster" size="3xl" uppercase numberOfLines={2}>
            {groupsTitle(worked, catalogue, words)}
          </Text>
          <Text role="body" size="sm" color="secondary">
            {[
              detail.title ? said.routine(detail.title) : words.freeSession,
              whenRange(detail, timeZone, words),
            ].join(' · ')}
          </Text>
        </View>
        {lit.length > 0 ? (
          <View style={styles.figures} accessible={false}>
            {(['front', 'back'] as const).map((side) => (
              <BodyFigure
                key={side}
                side={side}
                gender="male"
                scale={0.22}
                lit={lit}
                inert={INERT_SLUGS}
                onPressSlug={() => undefined}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.figureRow, { borderTopColor: theme.color.border.subtle }]}>
        {figures.map(([value, label, accent], index) => (
          <View key={label} style={styles.figure}>
            <View style={styles.figureValue}>
              <Text role="poster" size="xl" color={accent ? 'accent' : 'primary'} numberOfLines={1}>
                {value}
              </Text>
              {/* The volume, third, carries the change against last time. */}
              {index === 2 && change !== null && change !== 0 ? (
                <Badge
                  label={`${change > 0 ? '+' : '−'}${String(Math.abs(change))}%`}
                  tone="accent"
                />
              ) : null}
            </View>
            <Text role="body" size="xs" color="muted">
              {label}
            </Text>
          </View>
        ))}
      </View>
      {comparison ? (
        <Text role="body" size="xs" color="muted">
          {comparison}
        </Text>
      ) : null}
    </View>
  )
}

function ExerciseCard({
  exercise,
  picture,
}: {
  readonly exercise: FinishedExecution['exercises'][number]
  readonly picture: string | null
}) {
  const locale = useLocale()
  const words = useText().session
  const { mass } = useUnits()
  const theme = useTheme()
  const best = bestSetLine(exercise.best_set, locale, mass, words)
  return (
    <View
      style={[
        styles.exercise,
        { backgroundColor: theme.color.background.surface, borderColor: theme.color.border.subtle },
      ]}
    >
      <View style={styles.exerciseHead}>
        <CoverTile size="xs">
          {picture ? <Image source={picture} style={styles.picture} contentFit="cover" /> : null}
        </CoverTile>
        <View style={styles.grow}>
          <Text role="control" size="md" numberOfLines={2}>
            {exercise.movement ?? words.exercise}
          </Text>
          {best ? (
            <Text role="body" size="sm" color="secondary">
              {best}
            </Text>
          ) : null}
        </View>
        {exercise.record ? (
          <Badge label={words.finished.record} tone="accent" variant="outline" icon="record" />
        ) : null}
      </View>
      {exercise.sets.map((one, index) => (
        <View
          key={one.set_order}
          style={[
            styles.set,
            one.best_ever ? { backgroundColor: theme.color.background.surfaceMuted } : null,
          ]}
        >
          <Text role="control" size="xs" color="muted" style={styles.setNumber}>
            {one.kind === 'warmup' ? words.warmupMark : String(index + 1)}
          </Text>
          <Text
            role="control"
            size="sm"
            color={one.best_ever ? 'primary' : 'secondary'}
            style={styles.grow}
          >
            {setLine(one, locale, mass, words)}
          </Text>
          {one.best_ever ? (
            <Text role="body" size="xs" color="primary">
              {words.finished.bestEver}
            </Text>
          ) : one.kind !== 'normal' ? (
            <Text role="body" size="xs" color="muted">
              {words.setKinds[one.kind].name}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

/** The menu's second step: what deleting takes along, then the decision (FIN-18c). */
function DeleteStep({
  name,
  detail,
  timeZone,
  onCancel,
  onDeleted,
}: {
  readonly name: string
  readonly detail: FinishedExecution
  readonly timeZone: string
  readonly onCancel: () => void
  readonly onDeleted: () => void
}) {
  const text = useText()
  const words = text.session
  const theme = useTheme()
  const flow = useMemo(() => createSpaceExecutionFlow(), [])
  const [preview, setPreview] = useState<InvalidationPreview | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    flow
      .readAnnulmentPreview(detail.executed_session_id, timeZone)
      .then((read) => active && setPreview(read))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [flow, detail.executed_session_id, timeZone])

  const confirm = () => {
    // A destructive action fires: felt on the press, before the network answers.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setBusy(true)
    setFailure(undefined)
    flow
      .annul(detail.executed_session_id)
      .then(onDeleted)
      .catch(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setBusy(false)
        setFailure(words.finished.annulFailed)
      })
  }

  return (
    <View style={styles.menu}>
      <Text role="body" size="md" color="secondary">
        {deletionLine(name, detail.started_at, timeZone, words)}
      </Text>
      <View style={[styles.consequences, { backgroundColor: theme.color.background.surfaceMuted }]}>
        <Text role="eyebrow" size="xs" color="muted" uppercase>
          {words.finished.alsoChanges}
        </Text>
        {preview ? (
          annulConsequences(preview, words).map((line, index) => (
            <Animated.View key={line.text} entering={LINE(index)}>
              <Note size="md" icon={line.icon}>
                {line.text}
              </Note>
            </Animated.View>
          ))
        ) : (
          <ActivityIndicator color={theme.color.icon.accent} />
        )}
      </View>
      {failure ? (
        <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}>
          <InlineAlert message={failure} />
        </Animated.View>
      ) : null}
      <Button label={words.finished.delete} variant="danger" loading={busy} onPress={confirm} />
      <Button label={text.common.cancel} variant="ghost" onPress={onCancel} disabled={busy} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  hero: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 12 },
  heroTop: { flexDirection: 'row', gap: 10 },
  heroText: { flex: 1, gap: 4 },
  figures: { flexDirection: 'row', gap: 2 },
  figureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  figure: { gap: 3 },
  figureValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  exercise: { borderRadius: 22, borderWidth: 1, padding: 12, gap: 4 },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  picture: { width: '100%', height: '100%' },
  grow: { flex: 1 },
  set: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  setNumber: { width: 18, textAlign: 'center' },
  foot: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, gap: 6 },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menu: { gap: 10, paddingBottom: 8 },
  steps: { overflow: 'hidden' },
  deleted: { alignItems: 'center', gap: 14, paddingVertical: 18 },
  doneMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consequences: { borderRadius: 16, padding: 14, gap: 10 },
})

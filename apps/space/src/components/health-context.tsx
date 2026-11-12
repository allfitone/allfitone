/**
 * «Dolor y limitaciones» (TECH-326, `HU-SP-014`, `HU-SP-028`, `HU-SP-022`): the list
 * (`PF-7`, `PF-7b`, `PF-E22`), adding and correcting (`PF-E19b`, `PF-E19d`, `PF-E21`), the
 * area (`PF-E19c`), the day (`PF-E19e`) and one claim with its deletion (`PF-E20`,
 * `PF-E20b`).
 *
 * **A screen each, like the rest of the profile.** The form stays mounted while the area
 * and the day are chosen on their own screens, which hand the choice back through
 * `chooseArea` and `chooseDay`; a route parameter cannot return a value.
 *
 * **Correcting changes the claim and keeps no versions** (ADR-052). The form starts from
 * the claim as it stands, and the detail reads it again whenever it shows.
 *
 * **Only a recovery has an end.** The form offers «Sé cuándo termina» for a recovery
 * alone; nobody knows when a pain will stop.
 *
 * There is no read of one claim, so the detail and the correction find theirs in the list:
 * a person keeps a handful, and the list is already what she just saw.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon, type IconName } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useTheme } from '@allfitone/react-native/theme'
import { WheelPicker } from '@allfitone/react-native/wheel-picker'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'

import {
  addDays,
  AREA_GROUPS,
  AREA_LABEL,
  asksForEnd,
  canSaveDraft,
  chooseArea,
  chooseDay,
  claimCaption,
  claimInput,
  claimTitle,
  daysBetween,
  deletionNote,
  draftOf,
  EMPTY_DRAFT,
  fullDayLine,
  dayLine,
  HEALTH_TYPES,
  healthSections,
  MAX_DESCRIPTION,
  relativeDayLine,
  saveFailure,
  SINCE_CHOICES,
  startOfDay,
  takeChosenArea,
  takeChosenDay,
  typeLabel,
  wheelOffsets,
  type HealthArea,
  type HealthClaim,
  type HealthClaimInput,
  type HealthDeletion,
  type HealthDraft,
  type HealthPage,
  type HealthType,
} from '../client/health-context'
import {
  correctHealthContext,
  declareHealthContext,
  deleteHealthContext,
  listHealthContext,
} from '../client/profile-transport'
import { selectionTick } from '../client/selection-tick'
import { EditHeader, EditScreen } from './edit-screen'
import { FormNote } from './fitness-profile-ui'

export interface HealthSources {
  readonly list: () => Promise<HealthPage>
  readonly declare: (input: HealthClaimInput) => Promise<HealthClaim>
  readonly correct: (id: string, input: HealthClaimInput) => Promise<HealthClaim>
  readonly remove: (id: string) => Promise<HealthDeletion>
}

export const LIVE_HEALTH: HealthSources = {
  list: listHealthContext,
  declare: declareHealthContext,
  correct: correctHealthContext,
  remove: deleteHealthContext,
}

const UNREADABLE = 'No pudimos leer tus registros. Revisa tu conexión e inténtalo otra vez.'
const PRIVACY_NOTE =
  'Solo lo ve un gimnasio con el que entrenes y al que le diste el permiso de salud.'

const TYPE_ICON: Record<HealthType, IconName> = {
  pain: 'burn',
  limitation: 'error',
  recovery: 'recovery',
}

function useClaims(sources: HealthSources) {
  const [claims, setClaims] = useState<readonly HealthClaim[] | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)
  useFocusEffect(
    useCallback(() => {
      let active = true
      sources
        .list()
        .then((page) => {
          if (!active) return
          setClaims(page.items)
          setUnreadable(false)
        })
        .catch(() => {
          if (active) setUnreadable(true)
        })
      return () => {
        active = false
      }
    }, [sources]),
  )
  return { claims, unreadable }
}

// ---------------------------------------------------------------- PF-7, PF-7b, PF-E22

export function HealthListScreen({ sources }: { readonly sources: HealthSources }) {
  const router = useRouter()
  const theme = useTheme()
  const { claims, unreadable } = useClaims(sources)
  const now = new Date()
  const sections = claims ? healthSections(claims, now) : undefined

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.listHeader}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.grow}>
          Dolor y limitaciones
        </Text>
        <IconButton
          icon="add"
          accessibilityLabel="Agregar"
          variant="solid"
          onPress={() => router.push('/me/health/new')}
        />
      </View>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.protection,
            {
              borderColor: theme.color.status.danger,
              backgroundColor: `${theme.color.status.danger}14`,
            },
          ]}
        >
          <View style={styles.inline}>
            <FoundationIcon name="locked" size="xs" color={theme.color.status.danger} decorative />
            <Text role="control" size="sm" color="danger">
              Lo más protegido de tu perfil
            </Text>
          </View>
          <Text role="body" size="xs" color="secondary">
            Solo lo ve quien tenga el permiso de salud. No es historia clínica: no pedimos
            diagnósticos ni documentos.
          </Text>
        </View>

        {unreadable ? <InlineAlert message={UNREADABLE} /> : null}

        {sections && claims?.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.color.border.subtle }]}>
            <View
              style={[styles.emptyIcon, { backgroundColor: theme.color.background.surfaceSubtle }]}
            >
              <FoundationIcon
                name="heart"
                size="md"
                color={theme.color.icon.secondary}
                decorative
              />
            </View>
            <Text role="control" size="lg">
              Nada por ahora
            </Text>
            <Text role="body" size="sm" color="secondary" align="center">
              Si algo te duele o te limita, cuéntalo aquí y tu entrenamiento lo tendrá en cuenta.
              Puedes hacerlo cuando quieras.
            </Text>
            <Button label="Agregar" onPress={() => router.push('/me/health/new')} />
          </View>
        ) : null}

        {sections ? (
          <>
            <ClaimSection title="Activo" claims={sections.active} now={now} />
            <ClaimSection title="En recuperación" claims={sections.healing} now={now} />
            <ClaimSection title="Ya terminó" claims={sections.ended} now={now} dimmed />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function ClaimSection({
  title,
  claims,
  now,
  dimmed,
}: {
  readonly title: string
  readonly claims: readonly HealthClaim[]
  readonly now: Date
  readonly dimmed?: boolean
}) {
  const theme = useTheme()
  const router = useRouter()
  if (claims.length === 0) return null
  return (
    <View style={styles.section}>
      <Text role="body" size="sm" color="secondary">
        {title}
      </Text>
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.color.background.surface,
            borderColor: theme.color.border.subtle,
          },
          dimmed && styles.dimmed,
        ]}
      >
        {claims.map((claim, index) => (
          <View key={claim.id}>
            {index > 0 ? (
              <View style={[styles.rule, { backgroundColor: theme.color.border.subtle }]} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${claimTitle(claim)}, ${typeLabel(claim.context_type)}. ${claimCaption(claim, now)}`}
              onPress={() => router.push(`/me/health/${claim.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View
                style={[styles.glyph, { backgroundColor: theme.color.background.surfaceMuted }]}
              >
                <FoundationIcon
                  name={dimmed ? 'success' : TYPE_ICON[claim.context_type]}
                  size="sm"
                  color={theme.color.icon.accent}
                  decorative
                />
              </View>
              <View style={styles.grow}>
                <View style={styles.inline}>
                  <Text role="control" size="md">
                    {claimTitle(claim)}
                  </Text>
                  {dimmed || !claim.body_area ? null : <TypeTag type={claim.context_type} />}
                </View>
                <Text role="body" size="xs" color="muted" numberOfLines={1}>
                  {claimCaption(claim, now)}
                </Text>
              </View>
              <FoundationIcon name="next" size="sm" color={theme.color.icon.secondary} decorative />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  )
}

function TypeTag({ type }: { readonly type: HealthType }) {
  const theme = useTheme()
  return (
    <View style={[styles.tag, { borderColor: theme.color.accent.tonalBorder }]}>
      <Text role="control" size="2xs" color="accent">
        {typeLabel(type)}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- PF-E19b, PF-E19d, PF-E21

export function HealthFormScreen({
  sources,
  claimId,
}: {
  readonly sources: HealthSources
  readonly claimId?: string
}) {
  const router = useRouter()
  const theme = useTheme()
  const [draft, setDraft] = useState<HealthDraft | undefined>(claimId ? undefined : EMPTY_DRAFT)
  const [knowsEnd, setKnowsEnd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)
  const now = new Date()

  useFocusEffect(
    useCallback(() => {
      let active = true
      if (claimId) {
        sources
          .list()
          .then((page) => {
            const found = page.items.find((one) => one.id === claimId)
            if (!active || !found) return
            setDraft((held) => held ?? draftOf(found))
            setKnowsEnd(
              (held) => held || (found.context_type === 'recovery' && found.valid_to !== null),
            )
          })
          .catch(() => {
            if (active) setUnreadable(true)
          })
      }
      const area = takeChosenArea()
      const day = takeChosenDay()
      if (area !== undefined || day) {
        setDraft((held) => {
          const base = held ?? EMPTY_DRAFT
          const withArea = area === undefined ? base : { ...base, area }
          if (!day) return withArea
          return day.kind === 'since'
            ? { ...withArea, since: 'other', sinceDay: day.day }
            : { ...withArea, until: day.day }
        })
        if (day?.kind === 'until') setKnowsEnd(true)
      }
      return () => {
        active = false
      }
    }, [claimId, sources]),
  )

  const shown = draft ?? EMPTY_DRAFT
  const effective: HealthDraft = asksForEnd(shown) && knowsEnd ? shown : { ...shown, until: null }
  const update = (change: Partial<HealthDraft>) => setDraft({ ...shown, ...change })

  const save = async () => {
    const input = claimInput(effective, new Date())
    if (!input) return
    setSaving(true)
    setFailure(undefined)
    try {
      if (claimId) await sources.correct(claimId, input)
      else await sources.declare(input)
      router.back()
    } catch (cause) {
      setFailure(saveFailure(cause))
    } finally {
      setSaving(false)
    }
  }

  const sinceLabel = (choice: (typeof SINCE_CHOICES)[number]) =>
    choice.choice === 'other' && shown.since === 'other' && shown.sinceDay
      ? dayLine(shown.sinceDay, now)
      : choice.label

  return (
    <EditScreen
      title={claimId ? 'Corregir' : 'Agregar'}
      subtitle={
        claimId
          ? 'Cambia lo que haga falta. Corrige este registro; si es algo nuevo, mejor agrégalo aparte.'
          : 'Cuéntalo con tus palabras. No es historia clínica: no pedimos diagnósticos ni documentos.'
      }
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      saveLabel={claimId ? 'Guardar corrección' : 'Guardar'}
      canSave={draft !== undefined && canSaveDraft(effective, now)}
      onSave={() => void save()}
    >
      <Field label="QUÉ ES">
        <View style={styles.types}>
          {HEALTH_TYPES.map(({ type, label, caption }) => {
            const on = shown.type === type
            return (
              <Pressable
                key={type}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${label}: ${caption}`}
                onPress={() => update({ type })}
                style={[
                  styles.typeCard,
                  {
                    borderColor: on ? theme.color.border.accent : theme.color.border.subtle,
                    backgroundColor: on
                      ? theme.color.accent.tonal
                      : theme.color.background.surfaceSubtle,
                  },
                ]}
              >
                <View
                  style={[
                    styles.typeIcon,
                    {
                      backgroundColor: on
                        ? theme.color.icon.accent
                        : theme.color.background.surface,
                    },
                  ]}
                >
                  <FoundationIcon
                    name={TYPE_ICON[type]}
                    size="sm"
                    color={on ? theme.color.accent.onAccent : theme.color.icon.secondary}
                    decorative
                  />
                </View>
                <Text
                  role="control"
                  size="xs"
                  color={on ? 'accent' : 'primary'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {label}
                </Text>
                <Text role="body" size="2xs" color="muted">
                  {caption}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Field>

      <Field label="ZONA" optional="· si aplica">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Zona: ${shown.area ? AREA_LABEL[shown.area] : 'ninguna'}. Cambiar`}
          onPress={() =>
            router.push({ pathname: '/me/health/zone', params: { current: shown.area ?? '' } })
          }
          style={[
            styles.pick,
            {
              borderColor: theme.color.border.subtle,
              backgroundColor: theme.color.background.surfaceSubtle,
            },
          ]}
        >
          <FoundationIcon name="person" size="sm" color={theme.color.icon.accent} decorative />
          <Text
            role="control"
            size="md"
            style={styles.grow}
            color={shown.area ? 'primary' : 'muted'}
          >
            {shown.area ? AREA_LABEL[shown.area] : 'Ninguna en particular'}
          </Text>
          <Text role="control" size="xs" color="accent">
            Cambiar
          </Text>
          <FoundationIcon name="next" size="xs" color={theme.color.icon.secondary} decorative />
        </Pressable>
      </Field>

      <Field label="CON TUS PALABRAS">
        <TextField
          label="Con tus palabras"
          hideLabel
          value={shown.description}
          onChangeText={(typed) => update({ description: typed })}
          multiline
          maxLength={MAX_DESCRIPTION}
          placeholder="Por ejemplo: la derecha, me duele al bajar en sentadilla."
        />
        <Text role="body" size="xs" color="muted">
          Dónde, cuándo aparece y qué lo empeora. Con eso basta.
        </Text>
      </Field>

      <Field label="DESDE CUÁNDO">
        <View style={styles.chips}>
          {SINCE_CHOICES.map((choice) => (
            <SinceChip
              key={choice.choice}
              label={sinceLabel(choice)}
              selected={shown.since === choice.choice}
              onPress={() => {
                if (choice.choice !== 'other') {
                  update({ since: choice.choice, sinceDay: null })
                  return
                }
                router.push({
                  pathname: '/me/health/date',
                  params: {
                    kind: 'since',
                    offset: String(daysBetween(now, shown.sinceDay ?? startOfDay(now))),
                  },
                })
              }}
            />
          ))}
        </View>
      </Field>

      {asksForEnd(shown) ? (
        <>
          <View style={styles.switchRow}>
            <Text role="control" size="md" style={styles.grow}>
              Sé cuándo termina
            </Text>
            <Switch
              value={knowsEnd}
              onValueChange={setKnowsEnd}
              accessibilityLabel="Sé cuándo termina"
              trackColor={{ false: theme.color.background.surface, true: theme.color.icon.accent }}
            />
          </View>
          {knowsEnd ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Hasta: ${shown.until ? fullDayLine(shown.until) : 'sin elegir'}. Cambiar`}
              onPress={() =>
                router.push({
                  pathname: '/me/health/date',
                  params: {
                    kind: 'until',
                    offset: String(shown.until ? Math.max(1, daysBetween(now, shown.until)) : 30),
                  },
                })
              }
              style={[
                styles.pick,
                {
                  borderColor: theme.color.border.subtle,
                  backgroundColor: theme.color.background.surfaceSubtle,
                },
              ]}
            >
              <FoundationIcon
                name="calendar"
                size="sm"
                color={theme.color.icon.accent}
                decorative
              />
              <Text role="body" size="sm" color="secondary">
                Hasta
              </Text>
              <Text
                role="control"
                size="md"
                align="right"
                style={styles.grow}
                color={shown.until ? 'primary' : 'muted'}
              >
                {shown.until ? fullDayLine(shown.until) : 'Elegir'}
              </Text>
              <FoundationIcon name="next" size="xs" color={theme.color.icon.secondary} decorative />
            </Pressable>
          ) : null}
        </>
      ) : null}

      <FormNote text={PRIVACY_NOTE} />
    </EditScreen>
  )
}

/** Four to a row, as the design draws them: the DS chip wraps a two-word label. */
function SinceChip({
  label,
  selected,
  onPress,
}: {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.sinceChip,
        {
          borderColor: selected ? theme.color.border.accent : theme.color.border.subtle,
          backgroundColor: selected
            ? theme.color.accent.tonal
            : theme.color.background.surfaceSubtle,
        },
      ]}
    >
      <Text
        role="control"
        size="xs"
        color={selected ? 'accent' : 'secondary'}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  )
}

function Field({
  label,
  optional,
  children,
}: {
  readonly label: string
  readonly optional?: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.field}>
      <View style={styles.inline}>
        <Text role="label" size="xs" color="secondary">
          {label}
        </Text>
        {optional ? (
          <Text role="body" size="xs" color="muted">
            {optional}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

// ---------------------------------------------------------------- PF-E19c

export function HealthAreaScreen({ current }: { readonly current: HealthArea | null }) {
  const router = useRouter()
  const theme = useTheme()
  const pick = (area: HealthArea | null) => {
    chooseArea(area)
    router.back()
  }
  return (
    <EditScreen
      title="Zona"
      subtitle="Dónde lo sientes. Derecha o izquierda va en tus palabras."
      failure={undefined}
      saving={false}
      onSave={undefined}
    >
      {AREA_GROUPS.map((group) => (
        <View key={group.title} style={styles.section}>
          <Text role="label" size="xs" color="secondary">
            {group.title.toUpperCase()}
          </Text>
          <View
            style={[
              styles.panel,
              {
                backgroundColor: theme.color.background.surface,
                borderColor: theme.color.border.subtle,
              },
            ]}
          >
            {group.areas.map((area, index) => {
              const on = current === area
              return (
                <View key={area}>
                  {index > 0 ? (
                    <View style={[styles.rule, { backgroundColor: theme.color.border.subtle }]} />
                  ) : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => pick(area)}
                    style={({ pressed }) => [styles.areaRow, pressed && styles.pressed]}
                  >
                    <Text
                      role="control"
                      size="md"
                      color={on ? 'accent' : 'primary'}
                      style={styles.grow}
                    >
                      {AREA_LABEL[area]}
                    </Text>
                    {on ? (
                      <FoundationIcon
                        name="check"
                        size="sm"
                        color={theme.color.icon.accent}
                        decorative
                      />
                    ) : null}
                  </Pressable>
                </View>
              )
            })}
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => pick(null)} style={styles.none}>
        <Text role="control" size="sm" color="accent">
          Ninguna en particular
        </Text>
      </Pressable>
    </EditScreen>
  )
}

// ---------------------------------------------------------------- PF-E19e

export function HealthDateScreen({
  kind,
  offset,
}: {
  readonly kind: 'since' | 'until'
  readonly offset: number
}) {
  const router = useRouter()
  const values = wheelOffsets(kind)
  const first = values[0] ?? 0
  const last = values.at(-1) ?? 0
  const [chosen, setChosen] = useState(Math.min(last, Math.max(first, offset)))
  const today = startOfDay(new Date())

  return (
    <EditScreen
      title={kind === 'since' ? 'Desde cuándo' : 'Hasta cuándo'}
      subtitle={
        kind === 'since'
          ? 'Desliza hasta el día en que empezó. No hace falta que sea exacto.'
          : 'Desliza hasta el día en que esperas terminar. Puedes cambiarlo después.'
      }
      failure={undefined}
      saving={false}
      saveLabel="Listo"
      onSave={() => {
        chooseDay(kind, addDays(today, chosen))
        router.back()
      }}
    >
      <View style={styles.wheel}>
        <WheelPicker
          values={values}
          value={chosen}
          onChange={(value) => {
            setChosen(value)
            selectionTick()
          }}
          formatValue={(value) => fullDayLine(addDays(today, value))}
          accessibilityLabel={kind === 'since' ? 'Desde cuándo' : 'Hasta cuándo'}
          accessibilityText={fullDayLine(addDays(today, chosen))}
        />
        <Text role="control" size="sm" color="accent" align="center">
          {relativeDayLine(chosen)}
        </Text>
      </View>
    </EditScreen>
  )
}

// ---------------------------------------------------------------- PF-E20, PF-E20b

export function HealthDetailScreen({
  sources,
  claimId,
}: {
  readonly sources: HealthSources
  readonly claimId: string
}) {
  const router = useRouter()
  const theme = useTheme()
  const { claims, unreadable } = useClaims(sources)
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [note, setNote] = useState<string | undefined>(undefined)
  const claim = claims?.find((one) => one.id === claimId)
  const now = new Date()

  const remove = async () => {
    setRemoving(true)
    try {
      const deletion = await sources.remove(claimId)
      setAsking(false)
      const kept = deletionNote(deletion, new Date())
      if (kept) setNote(kept)
      else router.back()
    } catch (cause) {
      setAsking(false)
      setNote(saveFailure(cause))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <EditHeader title={claim ? claimTitle(claim) : ''} />
      <ScrollView contentContainerStyle={styles.detail} showsVerticalScrollIndicator={false}>
        {unreadable ? <InlineAlert message={UNREADABLE} /> : null}
        {claims && !claim ? <InlineAlert message="Ese registro ya no está." /> : null}
        {claim ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.color.background.surface,
                borderColor: theme.color.border.subtle,
              },
            ]}
          >
            <View style={styles.inline}>
              <TypeTag type={claim.context_type} />
              {claim.body_area ? (
                <Text role="control" size="xs" color="secondary">
                  {AREA_LABEL[claim.body_area]}
                </Text>
              ) : null}
            </View>
            <Text role="control" size="lg">
              {claim.description}
            </Text>
            <View
              style={[
                styles.rule,
                styles.flushRule,
                { backgroundColor: theme.color.border.subtle },
              ]}
            />
            <DetailLine label="Desde" value={fullDayLine(new Date(claim.valid_from))} />
            {claim.context_type === 'recovery' && claim.valid_to ? (
              <DetailLine label="Hasta" value={fullDayLine(new Date(claim.valid_to))} />
            ) : null}
            <View
              style={[
                styles.rule,
                styles.flushRule,
                { backgroundColor: theme.color.border.subtle },
              ]}
            />
            <View style={[styles.origin, { backgroundColor: theme.color.background.surfaceMuted }]}>
              <Text role="control" size="xs" color="secondary">
                {claim.provenance === 'person_declared' ? 'Declarado por ti' : 'Observado'} ·{' '}
                {dayLine(new Date(claim.recorded_at), now)}
              </Text>
            </View>
          </View>
        ) : null}
        {note ? <InlineAlert message={note} /> : null}
        {claim ? <FormNote text={`Corregirlo cambia este registro. ${PRIVACY_NOTE}`} /> : null}
      </ScrollView>
      {claim && claim.provenance === 'person_declared' ? (
        <View style={styles.footer}>
          <Button label="Corregir" onPress={() => router.push(`/me/health/${claimId}/edit`)} />
          <Pressable
            accessibilityRole="button"
            onPress={() => setAsking(true)}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
          >
            <FoundationIcon name="remove" size="sm" color={theme.color.status.danger} decorative />
            <Text role="control" size="sm" color="danger">
              Eliminar este registro
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Sheet visible={asking} onDismiss={() => setAsking(false)} title="¿Eliminar este registro?">
        <View style={styles.sheet}>
          <Text role="body" size="sm" color="secondary" align="center">
            Se borra para siempre. Solo queda constancia de que borraste un dato de salud, nunca de
            lo que decía.
          </Text>
          <Button
            label="Eliminar"
            variant="danger"
            loading={removing}
            onPress={() => void remove()}
          />
          <Button label="Cancelar" variant="ghost" onPress={() => setAsking(false)} />
        </View>
      </Sheet>
    </Screen>
  )
}

function DetailLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.line}>
      <Text role="body" size="sm" color="secondary" style={styles.grow}>
        {label}
      </Text>
      <Text role="control" size="sm">
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.6 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  listContent: { gap: 18, paddingTop: 4, paddingBottom: 32 },
  protection: { gap: 6, borderWidth: 1, borderRadius: 18, padding: 14 },
  empty: {
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: 8 },
  panel: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  rule: { height: 1, marginHorizontal: 16 },
  flushRule: { marginHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  field: { gap: 8 },
  types: { flexDirection: 'row', gap: 8 },
  typeCard: { flex: 1, gap: 8, borderWidth: 1.5, borderRadius: 18, padding: 12 },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  chips: { flexDirection: 'row', gap: 6 },
  sinceChip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  none: { alignItems: 'center', paddingVertical: 8 },
  wheel: { gap: 18, paddingTop: 12 },
  detail: { gap: 16, paddingTop: 4, paddingBottom: 32 },
  card: { gap: 14, borderWidth: 1, borderRadius: 22, padding: 18 },
  line: { flexDirection: 'row', alignItems: 'center' },
  origin: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  footer: { gap: 4, paddingTop: 12, paddingBottom: 8 },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  sheet: { gap: 12, paddingBottom: 8 },
})

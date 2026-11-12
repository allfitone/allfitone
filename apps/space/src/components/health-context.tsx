/**
 * «Dolor y limitaciones» (TECH-326, `HU-SP-014`, `HU-SP-028`, `HU-SP-022`): the list
 * (`PF-7`, `PF-7b`, `PF-E22`), adding and correcting (`PF-E19b`, `PF-E19d`, `PF-E21`), the
 * area (`PF-E19c`), the day (`PF-E19e`) and one claim with its deletion (`PF-E20`,
 * `PF-E20b`).
 *
 * **Drawn as the designs, built from the design system.** The list is a `ContentGroup`
 * of `ContentRow`s with a glyph and a tag; the three types are option cards
 * (`SelectableTile` with an icon and a caption); the area and the end are field
 * `DisclosureButton`s; «Desde cuándo» is a row of compact `Chip`s; deleting starts at a
 * `quietDanger` button. Where the design system did not draw what the designs ask, it
 * grew the variant; nothing here is drawn by hand.
 *
 * **A screen each, like the rest of the profile.** The form stays mounted while the area
 * and the day are chosen on their own screens, which hand the choice back through
 * `chooseArea` and `chooseDay`; a route parameter cannot return a value.
 *
 * **Correcting changes the claim and keeps no versions** (ADR-052). The form starts from
 * the claim as it stands, and the detail reads it again whenever it shows.
 *
 * **Only a recovery has an end.** «Sé cuándo termina» is offered for a recovery alone,
 * and it is a `Switch`: turning it on shows the field for the end date at once.
 *
 * There is no read of one claim, so the detail and the correction find theirs in the list:
 * a person keeps a handful, and the list is already what she just saw.
 */

import { type BadgeTone } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { Chip } from '@allfitone/react-native/chip'
import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { DisclosureButton } from '@allfitone/react-native/disclosure-button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon, type IconName } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { RecordCard } from '@allfitone/react-native/record-card'
import { Screen } from '@allfitone/react-native/screen'
import { SelectableRow } from '@allfitone/react-native/selectable-row'
import { SelectableTile } from '@allfitone/react-native/selectable-tile'
import { Sheet } from '@allfitone/react-native/sheet'
import { Switch } from '@allfitone/react-native/switch'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useTheme } from '@allfitone/react-native/theme'
import { WheelPicker } from '@allfitone/react-native/wheel-picker'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

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
  dayLine,
  daysBetween,
  deletionNote,
  draftOf,
  EMPTY_DRAFT,
  fullDayLine,
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
  type SinceChoice,
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

/** Each kind keeps one colour, on its glyph and on its tag, as the designs draw it. */
const TYPE_TONE: Record<HealthType, BadgeTone> = {
  pain: 'warning',
  limitation: 'sport',
  recovery: 'success',
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
        <InlineAlert
          tone="danger"
          icon="locked"
          title="Lo más protegido de tu perfil"
          message="Solo lo ve quien tenga el permiso de salud. No es historia clínica: no pedimos diagnósticos ni documentos."
        />

        {unreadable ? <InlineAlert message={UNREADABLE} /> : null}

        {sections && claims?.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.color.border.subtle }]}>
            <FoundationIcon name="heart" size="md" color={theme.color.icon.secondary} decorative />
            <Text role="control" size="md">
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
            <ClaimSection title="Ya terminó" claims={sections.ended} now={now} ended />
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
  ended,
}: {
  readonly title: string
  readonly claims: readonly HealthClaim[]
  readonly now: Date
  readonly ended?: boolean
}) {
  const router = useRouter()
  if (claims.length === 0) return null
  return (
    <View style={styles.section}>
      <Text role="control" size="xs" color="secondary">
        {title}
      </Text>
      <ContentGroup style={ended ? styles.ended : undefined}>
        {claims.map((claim) => (
          <ContentRow
            key={claim.id}
            name={claimTitle(claim)}
            caption={claimCaption(claim, now)}
            icon={ended ? 'success' : TYPE_ICON[claim.context_type]}
            iconTone={ended ? 'neutral' : TYPE_TONE[claim.context_type]}
            tagTone={TYPE_TONE[claim.context_type]}
            {...(ended || !claim.body_area ? {} : { tag: typeLabel(claim.context_type) })}
            tone="plain"
            onPress={() => router.push(`/me/health/${claim.id}`)}
          />
        ))}
      </ContentGroup>
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

  const pickSince = (choice: SinceChoice) => {
    if (choice !== 'other') {
      update({ since: choice, sinceDay: null })
      return
    }
    router.push({
      pathname: '/me/health/date',
      params: {
        kind: 'since',
        offset: String(daysBetween(now, shown.sinceDay ?? startOfDay(now))),
      },
    })
  }

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
      <Field label="Qué es">
        <View style={styles.row}>
          {HEALTH_TYPES.map(({ type, label, caption }) => (
            <SelectableTile
              key={type}
              name={label}
              caption={caption}
              icon={TYPE_ICON[type]}
              choice="single"
              selected={shown.type === type}
              onPress={() => update({ type })}
            />
          ))}
        </View>
      </Field>

      <Field label="Zona" hint="· si aplica">
        <DisclosureButton
          variant="field"
          label="Zona"
          value={shown.area ? AREA_LABEL[shown.area] : 'Ninguna en particular'}
          icon="person"
          active={shown.area !== null}
          actionLabel="Cambiar"
          onPress={() =>
            router.push({ pathname: '/me/health/zone', params: { current: shown.area ?? '' } })
          }
        />
      </Field>

      <Field label="Con tus palabras">
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

      <Field label="Desde cuándo">
        <View style={styles.row}>
          {SINCE_CHOICES.map(({ choice, label }) => (
            <Chip
              key={choice}
              size="sm"
              grow
              label={
                choice === 'other' && shown.since === 'other' && shown.sinceDay
                  ? dayLine(shown.sinceDay, now)
                  : label
              }
              selected={shown.since === choice}
              onPress={() => pickSince(choice)}
            />
          ))}
        </View>
      </Field>

      {asksForEnd(shown) ? (
        <>
          <Switch label="Sé cuándo termina" value={knowsEnd} onChange={setKnowsEnd} />
          {knowsEnd ? (
            <DisclosureButton
              variant="field"
              label="Hasta"
              value={shown.until ? `Hasta el ${fullDayLine(shown.until)}` : 'Elige hasta cuándo'}
              icon="calendar"
              active={shown.until !== null}
              actionLabel="Cambiar"
              onPress={() =>
                router.push({
                  pathname: '/me/health/date',
                  params: {
                    kind: 'until',
                    offset: String(shown.until ? Math.max(1, daysBetween(now, shown.until)) : 30),
                  },
                })
              }
            />
          ) : null}
        </>
      ) : null}

      <FormNote text={PRIVACY_NOTE} />
    </EditScreen>
  )
}

/** The design system's field label, the micro label, over what it names. */
function Field({
  label,
  hint,
  children,
}: {
  readonly label: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.field}>
      <View style={styles.inline}>
        <Text role="label" size="xs" color="secondary" uppercase>
          {label}
        </Text>
        {hint ? (
          <Text role="body" size="xs" color="muted">
            {hint}
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
          <Text role="label" size="xs" color="secondary" uppercase>
            {group.title}
          </Text>
          <View>
            {group.areas.map((area) => (
              <SelectableRow
                key={area}
                name={AREA_LABEL[area]}
                selected={current === area}
                onPress={() => pick(area)}
              />
            ))}
          </View>
        </View>
      ))}
      <Button label="Ninguna en particular" variant="ghost" onPress={() => pick(null)} />
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
          <RecordCard
            kind={{ label: typeLabel(claim.context_type), tone: TYPE_TONE[claim.context_type] }}
            {...(claim.body_area ? { context: AREA_LABEL[claim.body_area] } : {})}
            body={claim.description}
            facts={[
              { label: 'Desde', value: fullDayLine(new Date(claim.valid_from)) },
              ...(claim.context_type === 'recovery' && claim.valid_to
                ? [{ label: 'Hasta', value: fullDayLine(new Date(claim.valid_to)) }]
                : []),
            ]}
            origin={`${claim.provenance === 'person_declared' ? 'Declarado por ti' : 'Observado'} · ${dayLine(new Date(claim.recorded_at), now)}`}
          />
        ) : null}
        {note ? <InlineAlert message={note} tone="info" /> : null}
        {claim ? <FormNote text={`Corregirlo cambia este registro. ${PRIVACY_NOTE}`} /> : null}
      </ScrollView>
      {claim && claim.provenance === 'person_declared' ? (
        <View style={styles.footer}>
          <Button label="Corregir" onPress={() => router.push(`/me/health/${claimId}/edit`)} />
          <Button
            label="Eliminar este registro"
            icon="remove"
            variant="quietDanger"
            onPress={() => setAsking(true)}
          />
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

const styles = StyleSheet.create({
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  ended: { opacity: 0.6 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  listContent: { gap: 18, paddingTop: 4, paddingBottom: 32 },
  empty: {
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
  },
  section: { gap: 8 },
  field: { gap: 8 },
  wheel: { gap: 18, paddingTop: 12 },
  detail: { gap: 16, paddingTop: 4, paddingBottom: 32 },
  footer: { gap: 4, paddingTop: 12, paddingBottom: 8 },
  sheet: { gap: 12, paddingBottom: 8 },
})

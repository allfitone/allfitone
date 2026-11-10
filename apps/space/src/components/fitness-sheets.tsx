/**
 * The edit sheets of «Perfil fitness» (TECH-43): the goal (`PF-E1`), the biological sex
 * with portraits (`PF-E2b`), how somebody trains (`PF-E3b`), and the two the pen.dev
 * document did not draw — the level and the zones — built from the goal sheet's own
 * pieces so they read as the same family.
 *
 * **A sheet holds its draft, not the profile.** It opens on what the profile says,
 * changes nothing until «Guardar», and a dismissal throws the draft away: the backdrop
 * and the system back are the same intent as the cross.
 *
 * **Saving reports, it does not decide.** The screen behind owns the write and the
 * reread, so a failure keeps the sheet open with its draft and says so inside it.
 */

import { Button } from '@allfitone/react-native/button'
import { Chip } from '@allfitone/react-native/chip'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { useState, type ReactNode } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import femalePortrait from '../../assets/images/sex-female.webp'
import malePortrait from '../../assets/images/sex-male.webp'
import { EXPERIENCE_LEVELS } from '../client/experience-form'
import {
  DURATION_CHOICES,
  GOAL_CHOICES,
  daysLine,
  provenanceLine,
  stepDays,
  valueLine,
  type ProfileEntry,
  type SessionDuration,
} from '../client/fitness-profile'
import { FOCUS_ZONES, WHOLE_BODY } from '../client/focus-form'
import type { BiologicalSex, FocusArea } from '../client/onboarding'
import { ChoiceRow, EditSheetHeader, FormNote } from './fitness-profile-ui'

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** What every sheet shares: open, close, save, and whether the last save failed. */
interface Editing<T> {
  readonly visible: boolean
  readonly current: T
  readonly saving: boolean
  readonly failure: string | undefined
  readonly onDismiss: () => void
  readonly onSave: (value: T) => void
}

function useDraft<T>(visible: boolean, current: T): [T, (value: T) => void] {
  const [draft, setDraft] = useState(current)
  const [open, setOpen] = useState(visible)
  // Every opening starts from what the profile says, never from an abandoned draft.
  if (open !== visible) {
    setOpen(visible)
    if (visible) setDraft(current)
  }
  return [draft, setDraft]
}

function EditSheet({
  visible,
  title,
  subtitle,
  failure,
  saving,
  canSave,
  onDismiss,
  onSave,
  children,
}: {
  readonly visible: boolean
  readonly title: string
  readonly subtitle: string
  readonly failure: string | undefined
  readonly saving: boolean
  readonly canSave: boolean
  readonly onDismiss: () => void
  readonly onSave: () => void
  readonly children: ReactNode
}) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} hideTitle>
      <View style={styles.sheet}>
        <EditSheetHeader title={title} subtitle={subtitle} onClose={onDismiss} />
        {children}
        {failure ? <InlineAlert message={failure} /> : null}
        <Button label="Guardar" loading={saving} disabled={!canSave} onPress={onSave} />
      </View>
    </Sheet>
  )
}

export function GoalSheet(props: Editing<string | undefined>) {
  const [draft, setDraft] = useDraft(props.visible, props.current)
  return (
    <EditSheet
      {...props}
      title="Tu objetivo"
      subtitle="Elige el que más se parece a lo que quieres lograr."
      canSave={draft !== undefined}
      onSave={() => draft !== undefined && props.onSave(draft)}
    >
      <View style={styles.list}>
        {GOAL_CHOICES.map((goal) => (
          <ChoiceRow
            key={goal.value}
            name={goal.name}
            detail={goal.detail}
            selected={draft === goal.value}
            onPress={() => setDraft(goal.value)}
          />
        ))}
      </View>
      <FormNote boxed text="Puedes cambiarlo cuando quieras." />
    </EditSheet>
  )
}

export function ExperienceSheet(props: Editing<string | undefined>) {
  const [draft, setDraft] = useDraft(props.visible, props.current)
  return (
    <EditSheet
      {...props}
      title="Tu experiencia"
      subtitle="No es una etiqueta fija: la cambias cuando cambie."
      canSave={draft !== undefined}
      onSave={() => draft !== undefined && props.onSave(draft)}
    >
      <View style={styles.list}>
        {EXPERIENCE_LEVELS.map((level) => (
          <ChoiceRow
            key={level.level}
            name={level.name}
            detail={level.description}
            selected={draft === level.level}
            onPress={() => setDraft(level.level)}
          />
        ))}
      </View>
    </EditSheet>
  )
}

export function FocusSheet(props: Editing<readonly FocusArea[]>) {
  const [draft, setDraft] = useDraft(props.visible, props.current)
  const whole = draft.includes(WHOLE_BODY)
  const toggle = (zone: FocusArea) =>
    setDraft(
      draft.includes(zone)
        ? draft.filter((one) => one !== zone)
        : [...draft.filter((one) => one !== WHOLE_BODY), zone],
    )
  return (
    <EditSheet
      {...props}
      title="Zonas de foco"
      subtitle="Lo que quieres trabajar más. No excluye el resto del cuerpo."
      canSave={draft.length > 0}
      onSave={() => props.onSave(draft)}
    >
      <View style={styles.chips}>
        {FOCUS_ZONES.map((zone) => (
          <Chip
            key={zone.zone}
            label={zone.name}
            selected={draft.includes(zone.zone)}
            onPress={() => toggle(zone.zone)}
          />
        ))}
      </View>
      <ChoiceRow
        name="Todo el cuerpo"
        detail="Sin énfasis: lo decide tu objetivo."
        selected={whole}
        multiple
        onPress={() => setDraft(whole ? [] : [WHOLE_BODY])}
      />
    </EditSheet>
  )
}

export interface Routine {
  readonly days: number | undefined
  readonly duration: SessionDuration | undefined
}

export function RoutineSheet(props: Editing<Routine>) {
  const theme = useTheme()
  const [draft, setDraft] = useDraft(props.visible, props.current)
  const days = draft.days
  return (
    <EditSheet
      {...props}
      title="Cómo entrenas"
      subtitle="Para que tu plan quepa en tu semana."
      canSave={draft.days !== undefined || draft.duration !== undefined}
      onSave={() => props.onSave(draft)}
    >
      <Text role="label" size="xs" color="secondary" uppercase>
        Días por semana
      </Text>
      <View style={styles.stepper}>
        <IconButton
          icon="subtract"
          variant="outline"
          shape="squircle"
          accessibilityLabel="Un día menos"
          disabled={days === 1}
          onPress={() => setDraft({ ...draft, days: stepDays(days, -1) })}
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
          <Text role="poster" size="5xl" color={days === undefined ? 'muted' : 'accent'}>
            {days === undefined ? '–' : String(days)}
          </Text>
          <Text role="label" size="sm" color="secondary" uppercase>
            {days === 1 ? 'día' : 'días'}
          </Text>
        </View>
        <IconButton
          icon="add"
          variant="outline"
          shape="squircle"
          accessibilityLabel="Un día más"
          disabled={days === 7}
          onPress={() => setDraft({ ...draft, days: stepDays(days, 1) })}
        />
      </View>
      <View style={styles.segments}>
        {DAYS.map((day) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={daysLine(day)}
            accessibilityState={{ selected: days === day }}
            onPress={() => setDraft({ ...draft, days: day })}
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
      <Text role="label" size="xs" color="secondary" uppercase>
        Tiempo por sesión
      </Text>
      <View style={styles.rings}>
        {DURATION_CHOICES.map((choice) => {
          const chosen = draft.duration === choice.value
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.line}
              accessibilityState={{ selected: chosen }}
              onPress={() => setDraft({ ...draft, duration: choice.value })}
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
                <Text role="poster" size="lg" color={chosen ? 'accent' : 'primary'}>
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
    </EditSheet>
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

// The label sits on the photo, so the photo fades to the sheet under it.
const SCRIM = ['#0A131A00', '#0A131AE6'] as const

const PORTRAITS: readonly { value: BiologicalSex; label: string; picture: number }[] = [
  { value: 'female', label: 'Femenino', picture: femalePortrait },
  { value: 'male', label: 'Masculino', picture: malePortrait },
]

export function SexSheet(props: Editing<BiologicalSex | null>) {
  const theme = useTheme()
  const [draft, setDraft] = useDraft(props.visible, props.current)
  return (
    <EditSheet
      {...props}
      title="Sexo biológico"
      subtitle="Para calcular cargas y estimaciones sobre un cuerpo parecido al tuyo. No cambia cómo te nombramos."
      canSave
      onSave={() => props.onSave(draft)}
    >
      <View style={styles.portraits}>
        {PORTRAITS.map((portrait) => {
          const chosen = draft === portrait.value
          return (
            <Pressable
              key={portrait.value}
              accessibilityRole="radio"
              accessibilityLabel={portrait.label}
              accessibilityState={{ selected: chosen }}
              onPress={() => setDraft(portrait.value)}
              style={[
                styles.portrait,
                { borderColor: chosen ? theme.color.border.accent : theme.color.border.subtle },
              ]}
            >
              <Image source={portrait.picture} style={styles.portraitImage} resizeMode="cover" />
              <LinearGradient colors={SCRIM} style={styles.scrim} />
              <Text
                role="display"
                size="xl"
                uppercase
                color={chosen ? 'accent' : 'primary'}
                style={styles.portraitLabel}
              >
                {portrait.label}
              </Text>
              {chosen ? (
                <View style={[styles.tick, { backgroundColor: theme.color.icon.accent }]}>
                  <FoundationIcon
                    name="check"
                    size="xs"
                    color={theme.color.accent.onAccent}
                    decorative
                  />
                </View>
              ) : null}
            </Pressable>
          )
        })}
      </View>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="Prefiero no responder"
        accessibilityState={{ selected: draft === null }}
        onPress={() => setDraft(null)}
        style={[
          styles.decline,
          {
            borderColor: draft === null ? theme.color.border.accent : theme.color.border.subtle,
          },
        ]}
      >
        <FoundationIcon
          name="subtract"
          size="sm"
          color={draft === null ? theme.color.icon.accent : theme.color.icon.secondary}
          decorative
        />
        <Text role="control" size="md" color={draft === null ? 'accent' : 'secondary'}>
          Prefiero no responder
        </Text>
      </Pressable>
      <FormNote text="Sin responder, todo funciona igual con estimaciones menos ajustadas. Cambiarlo no reescribe lo que ya registraste." />
    </EditSheet>
  )
}

const SHORT_DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })

/** The versions of one datum: the one shown and why, then the others, none hidden. */
export function VersionsSheet({
  entry,
  title,
  onDismiss,
}: {
  readonly entry: ProfileEntry | undefined
  readonly title: string
  readonly onDismiss: () => void
}) {
  const theme = useTheme()
  const shown = entry ? valueLine(entry.attribute_code, entry.values) : undefined
  const versions = entry
    ? [
        { ...entry, current: true },
        ...entry.alternatives.map((other) => ({ ...other, current: false })),
      ]
    : []
  return (
    <Sheet visible={entry !== undefined} onDismiss={onDismiss} title={title} hideTitle>
      <View style={styles.sheet}>
        <EditSheetHeader
          title={title}
          subtitle={
            entry?.selected_because === 'declared_by_you'
              ? `Mostramos «${shown ?? ''}» porque lo declaraste tú.`
              : `Mostramos «${shown ?? ''}» porque es la versión más reciente.`
          }
          onClose={onDismiss}
        />
        <View style={styles.list}>
          {versions.map((version, index) => (
            <View
              key={index}
              style={[
                styles.version,
                {
                  borderColor: version.current
                    ? theme.color.border.accent
                    : theme.color.border.subtle,
                  backgroundColor: theme.color.background.surfaceMuted,
                },
              ]}
            >
              <View style={styles.grow}>
                <Text role="control" size="md">
                  {(entry && valueLine(entry.attribute_code, version.values)) ?? '—'}
                </Text>
                <Text role="body" size="xs" color="secondary">
                  {`${provenanceLine(version)} · ${SHORT_DATE.format(new Date(version.valid_from))}`}
                </Text>
              </View>
              {version.current ? (
                <Text role="control" size="xs" color="accent">
                  Mostramos
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <FormNote text="Lo que observó tu coach nunca aparece como si lo hubieras dicho tú. Las demás versiones no se ocultan ni se borran." />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  sheet: { gap: 16, paddingBottom: 8 },
  list: { gap: 10 },
  grow: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
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
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { height: 8, borderRadius: 4, alignSelf: 'stretch' },
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
  portraits: { flexDirection: 'row', gap: 12 },
  portrait: {
    flex: 1,
    aspectRatio: 0.72,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  portraitImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  portraitLabel: { padding: 14 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  tick: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
  },
  version: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
})

/**
 * The screens that edit «Perfil fitness», one per datum (`PF-E13` to `PF-E17`), and the
 * one that lists the versions of a datum.
 *
 * **The same question is answered with the same piece as in the onboarding.** The goal's
 * stage, the body with its zones, the scale of levels and the portraits are shared
 * components; each screen here puts its own header, line and «Guardar» around them. The
 * screens do not depend on the onboarding's screens, so either can change its layout
 * without moving the other.
 *
 * **A draft is only what changed.** Each screen reads the profile when it opens and shows
 * what it says; a tap starts a draft, and «Guardar» stays off until the draft differs from
 * the profile. Saving goes back, and «Perfil fitness» reads the profile again on focus:
 * the server decides which version is shown, so nothing here guesses it.
 */

import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { goalsFor } from '../client/discipline-form'
import { PICK_A_LEVEL, type TrainingExperience } from '../client/experience-form'
import {
  declaredExperience,
  declaredFocus,
  declaredGoal,
  declaredRoutine,
  focusChanged,
  routineWrites,
  versionsOf,
  type Routine,
} from '../client/fitness-edit'
import type { FitnessProfile } from '../client/fitness-profile'
import {
  areasFor,
  bodyScale,
  isAnswered,
  toggleFocus,
  type FocusSelection,
} from '../client/focus-form'
import {
  bodyVariant,
  CARD_GAP,
  stageHeight,
  TRAINING_GOALS,
  type TrainingGoal,
} from '../client/goal-form'
import type { BiologicalSex, FocusArea } from '../client/onboarding'
import {
  correctBiologicalSex,
  declareClaim,
  declareFocusAreas,
  readFitnessProfile,
  type ClaimCode,
} from '../client/profile-transport'
import type { SexAnswer } from '../client/sex-form'
import { EditScreen } from './edit-screen'
import { ExperiencePicker } from './experience-picker'
import { FormNote } from './fitness-profile-ui'
import { FocusPicker } from './focus-picker'
import { GOAL_ARTWORK } from './goal-artwork'
import { GoalRow, GoalStage } from './goal-stage'
import { RoutinePicker } from './routine-picker'
import { SexPicker } from './sex-picker'

export interface FitnessEditSources {
  readonly readProfile: () => Promise<FitnessProfile>
  readonly declareClaim: (code: ClaimCode, value: string) => Promise<unknown>
  readonly declareFocusAreas: (areas: readonly FocusArea[]) => Promise<unknown>
  readonly correctBiologicalSex: (sex: BiologicalSex | null) => Promise<unknown>
}

export const LIVE_FITNESS: FitnessEditSources = {
  readProfile: readFitnessProfile,
  declareClaim,
  declareFocusAreas,
  correctBiologicalSex,
}

const UNREADABLE = 'No pudimos leer tu perfil. Revisa tu conexión e inténtalo otra vez.'
const SAVE_FAILED = 'No pudimos guardarlo. Inténtalo otra vez.'

/** Everything on the zones screen that is not the body: header, line, chips and button. */
const FOCUS_CHROME = 630

function useProfile(sources: FitnessEditSources) {
  const [profile, setProfile] = useState<FitnessProfile | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)
  useEffect(() => {
    let active = true
    sources
      .readProfile()
      .then((read) => active && setProfile(read))
      .catch(() => active && setUnreadable(true))
    return () => {
      active = false
    }
  }, [sources])
  return { profile, unreadable }
}

/** Writes, goes back on success, and keeps the draft with a sentence on failure. */
function useSave() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const save = async (write: () => Promise<unknown>) => {
    setSaving(true)
    setFailure(undefined)
    try {
      await write()
      router.back()
    } catch {
      setFailure(SAVE_FAILED)
      setSaving(false)
    }
  }
  return { saving, failure, save }
}

/** `PF-E13` · the goal, on the onboarding's stage. */
export function GoalEditScreen({ sources }: { readonly sources: FitnessEditSources }) {
  const { height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const { profile, unreadable } = useProfile(sources)
  const { saving, failure, save } = useSave()
  const [draft, setDraft] = useState<TrainingGoal | undefined>(undefined)
  const [rowWidth, setRowWidth] = useState(0)

  const held = declaredGoal(profile)
  const goal = draft ?? held
  const sex = profile?.biological_sex ?? null
  const offered = useMemo(() => goalsFor(TRAINING_GOALS), [])
  const gallery = useMemo(
    () =>
      offered.map((option) => ({
        key: option,
        bodies: GOAL_ARTWORK[option][bodyVariant(sex, option)],
      })),
    [offered, sex],
  )

  return (
    <EditScreen
      title="Tu objetivo"
      subtitle="Es la dirección que toma tu entrenamiento. Puedes cambiarlo cuando quieras."
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      canSave={goal !== undefined && goal !== held}
      onSave={() => goal && void save(() => sources.declareClaim('primary_training_goal', goal))}
    >
      <View onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        <GoalStage
          width={Math.max(0, rowWidth)}
          height={stageHeight(height)}
          entry={goal ? GOAL_ARTWORK[goal] : undefined}
          showing={goal}
          gallery={gallery}
          neutral={GOAL_ARTWORK.maintain[bodyVariant(sex, 'maintain')].before}
          reduceMotion={reduceMotion}
        />
        <View style={styles.goals}>
          {offered.map((option, index) => (
            <GoalRow
              key={option}
              name={GOAL_ARTWORK[option].name}
              why={GOAL_ARTWORK[option].why}
              chosen={option === goal}
              first={index === 0}
              pressable={profile !== undefined && !saving}
              onPress={() => setDraft(option)}
            />
          ))}
        </View>
      </View>
    </EditScreen>
  )
}

/** `PF-E14` · the zones, on the body front and back. */
export function FocusEditScreen({ sources }: { readonly sources: FitnessEditSources }) {
  const { height } = useWindowDimensions()
  const { profile, unreadable } = useProfile(sources)
  const { saving, failure, save } = useSave()
  const [draft, setDraft] = useState<FocusSelection | undefined>(undefined)

  const held = declaredFocus(profile)
  const selection = draft ?? held

  return (
    <EditScreen
      title="Zonas de foco"
      subtitle="Lo que quieres trabajar más. Es un énfasis: el resto del cuerpo sigue entrando."
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      canSave={isAnswered(selection) && focusChanged(held, selection)}
      onSave={() => void save(() => sources.declareFocusAreas(areasFor(selection)))}
    >
      <FocusPicker
        selection={selection}
        onChoose={(choice) => setDraft(toggleFocus(selection, choice))}
        declaredSex={profile?.biological_sex ?? null}
        scale={bodyScale(Math.max(0, height - FOCUS_CHROME))}
        pressable={profile !== undefined && !saving}
      />
    </EditScreen>
  )
}

/** `PF-E15` · the level, on the onboarding's scale. */
export function ExperienceEditScreen({ sources }: { readonly sources: FitnessEditSources }) {
  const { profile, unreadable } = useProfile(sources)
  const { saving, failure, save } = useSave()
  const [draft, setDraft] = useState<TrainingExperience | undefined>(undefined)

  const held = declaredExperience(profile)
  const level = draft ?? held

  return (
    <EditScreen
      title="Tu experiencia"
      subtitle={PICK_A_LEVEL}
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      canSave={level !== undefined && level !== held}
      onSave={() => level && void save(() => sources.declareClaim('training_experience', level))}
    >
      <View style={styles.track}>
        <ExperiencePicker
          level={level}
          onChoose={setDraft}
          pressable={profile !== undefined && !saving}
        />
      </View>
    </EditScreen>
  )
}

/** `PF-E16` · days per week and time per session, two claims on one screen. */
export function RoutineEditScreen({ sources }: { readonly sources: FitnessEditSources }) {
  const { profile, unreadable } = useProfile(sources)
  const { saving, failure, save } = useSave()
  const [draft, setDraft] = useState<Routine | undefined>(undefined)

  const held = declaredRoutine(profile)
  const routine = draft ?? held
  const writes = routineWrites(held, routine)

  return (
    <EditScreen
      title="Cómo entrenas"
      subtitle="Para que tu plan quepa en tu semana."
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      canSave={writes.length > 0}
      onSave={() =>
        void save(async () => {
          for (const write of writes) await sources.declareClaim(write.code, write.value)
        })
      }
    >
      <View style={styles.routine}>
        <RoutinePicker routine={routine} onChange={setDraft} />
      </View>
    </EditScreen>
  )
}

/** `PF-E17` · the biological sex, with the onboarding's portraits. */
export function SexEditScreen({ sources }: { readonly sources: FitnessEditSources }) {
  const { profile, unreadable } = useProfile(sources)
  const { saving, failure, save } = useSave()
  const [draft, setDraft] = useState<SexAnswer | undefined>(undefined)

  const held = profile ? profile.biological_sex : undefined
  // The profile cannot tell a decline from never answering, so neither is drawn as chosen.
  const answer = draft === undefined ? (held ?? undefined) : draft

  return (
    <EditScreen
      title="Sexo biológico"
      subtitle="Para calcular cargas y estimaciones sobre un cuerpo parecido al tuyo. No cambia cómo te nombramos."
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      canSave={answer !== undefined && answer !== held}
      onSave={() => answer !== undefined && void save(() => sources.correctBiologicalSex(answer))}
    >
      <View>
        <SexPicker
          answer={answer}
          onChoose={setDraft}
          pressable={profile !== undefined && !saving}
          declineNote="Todo funciona igual, con estimaciones menos ajustadas."
        />
      </View>
      <FormNote text="Cambiarlo no reescribe lo que ya registraste." />
    </EditScreen>
  )
}

/** The versions of one datum: the one shown and why, then the others, none hidden. */
export function VersionsScreen({
  sources,
  code,
}: {
  readonly sources: FitnessEditSources
  readonly code: string
}) {
  const theme = useTheme()
  const { profile, unreadable } = useProfile(sources)
  const versions = versionsOf(profile, code)

  return (
    <EditScreen
      title={versions?.title ?? 'Versiones'}
      subtitle={versions?.reason ?? ''}
      failure={unreadable ? UNREADABLE : undefined}
      saving={false}
      onSave={undefined}
    >
      <View style={styles.versions}>
        {versions?.versions.map((version, index) => (
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
                {version.line}
              </Text>
              <Text role="body" size="xs" color="secondary">
                {version.origin}
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
      {versions ? (
        <FormNote text="Lo que observó tu coach nunca aparece como si lo hubieras dicho tú. Las demás versiones no se ocultan ni se borran." />
      ) : null}
    </EditScreen>
  )
}

const styles = StyleSheet.create({
  goals: { marginTop: CARD_GAP },
  track: { gap: 14 },
  routine: { gap: 14 },
  versions: { gap: 10 },
  version: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  grow: { flex: 1, gap: 2 },
})

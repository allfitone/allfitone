/**
 * `PF-3b` · Perfil fitness (`HU-SP-023`, TECH-43): everything the platform knows about
 * how somebody trains, where each datum came from, and the way to correct it.
 *
 * **Every question is a row, answered or not**, so the days, the time, the place and the
 * equipment — which the onboarding never asked — are answered from here. Each row opens
 * its editor; «+1 versión» opens the others, because the profile shows one version per
 * datum and has to say which and why (`OP-IDN-013`).
 *
 * **The body is a series, not a claim.** Weight and height are the last record of
 * «Cuerpo» and open it; the biological sex is a column of the person and is corrected
 * here (`OP-IDN-064`).
 *
 * After a save the profile is read again rather than patched: the server decides which
 * version is shown, and guessing it here would show something it did not choose.
 */

import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { decimal, latestOf, tenths, type BodyRecord } from '../../src/client/body'
import { readBodyRecords } from '../../src/client/body-transport'
import {
  entryOf,
  fitnessSections,
  type Editor,
  type FitnessProfile,
  type ProfileEntry,
  type SessionDuration,
} from '../../src/client/fitness-profile'
import type { BiologicalSex, FocusArea } from '../../src/client/onboarding'
import {
  correctBiologicalSex,
  declareClaim,
  declareFocusAreas,
  readFitnessProfile,
  type ClaimCode,
} from '../../src/client/profile-transport'
import { FitnessDatum, FitnessGroup } from '../../src/components/fitness-profile-ui'
import {
  ExperienceSheet,
  FocusSheet,
  GoalSheet,
  RoutineSheet,
  SexSheet,
  VersionsSheet,
  type Routine,
} from '../../src/components/fitness-sheets'

const UNREADABLE = 'No pudimos leer tu perfil. Revisa tu conexión e inténtalo otra vez.'
const SAVE_FAILED = 'No pudimos guardarlo. Inténtalo otra vez.'
const SEX_NAME: Record<BiologicalSex, string> = { female: 'Femenino', male: 'Masculino' }

export type Open = Exclude<Editor, 'place'> | 'sex' | undefined

export interface FitnessSources {
  readonly readProfile: () => Promise<FitnessProfile>
  readonly readBody: () => Promise<BodyRecord[]>
  readonly declareClaim: (code: ClaimCode, value: string) => Promise<unknown>
  readonly declareFocusAreas: (areas: readonly FocusArea[]) => Promise<unknown>
  readonly correctBiologicalSex: (sex: BiologicalSex | null) => Promise<unknown>
}

const LIVE: FitnessSources = {
  readProfile: readFitnessProfile,
  readBody: readBodyRecords,
  declareClaim,
  declareFocusAreas,
  correctBiologicalSex,
}

export default function FitnessProfileRoute() {
  return <FitnessProfileScreen sources={LIVE} />
}

/** The screen given where its data comes from; the route passes the real sources. */
export function FitnessProfileScreen({
  sources,
  initiallyOpen,
}: {
  readonly sources: FitnessSources
  readonly initiallyOpen?: Open
}) {
  const router = useRouter()
  const theme = useTheme()
  const [profile, setProfile] = useState<FitnessProfile | undefined>(undefined)
  const [body, setBody] = useState<BodyRecord[]>([])
  const [unreadable, setUnreadable] = useState(false)
  const [open, setOpen] = useState<Open>(initiallyOpen)
  const [versions, setVersions] = useState<{ entry: ProfileEntry; title: string } | undefined>()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const reload = useCallback(async () => {
    const read = await sources.readProfile()
    setProfile(read)
    setUnreadable(false)
  }, [sources])

  useFocusEffect(
    useCallback(() => {
      let active = true
      sources
        .readProfile()
        .then((read) => {
          if (!active) return
          setProfile(read)
          setUnreadable(false)
        })
        .catch(() => active && setUnreadable(true))
      // The body rows are quieter without it, never an error of their own.
      sources
        .readBody()
        .then((read) => active && setBody(read))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [sources]),
  )

  const close = () => {
    setOpen(undefined)
    setFailure(undefined)
  }

  const save = async (write: () => Promise<unknown>) => {
    setSaving(true)
    setFailure(undefined)
    try {
      await write()
      await reload()
      setOpen(undefined)
    } catch {
      setFailure(SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  const sections = fitnessSections(profile)
  const value = (code: string) => entryOf(profile, code)?.values
  const routine: Routine = {
    days: value('training_days_per_week')?.[0]
      ? Number(value('training_days_per_week')?.[0])
      : undefined,
    duration: durationOf(value('session_duration')?.[0]),
  }
  const sex = profile?.biological_sex ?? null
  const weight = latestOf(body, 'body_weight')
  const height = latestOf(body, 'body_height')

  const edit = (editor: Editor) => {
    if (editor === 'place') router.push('/me/place')
    else setOpen(editor)
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header">
          Perfil fitness
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <FoundationIcon name="info" size="sm" color={theme.color.icon.accent} decorative />
          <Text role="body" size="sm" color="secondary" style={styles.grow}>
            Ves todo lo tuyo, también lo que ningún gimnasio puede ver. Cuando hay más de una
            versión de un dato, te decimos cuál mostramos.
          </Text>
        </View>

        {unreadable ? <InlineAlert message={UNREADABLE} /> : null}

        {profile
          ? sections.map((section) => (
              <FitnessGroup key={section.title} label={section.title}>
                {section.rows.map((row) => (
                  <FitnessDatum
                    key={row.code}
                    title={row.title}
                    value={row.value}
                    provenance={row.provenance}
                    versions={row.versions}
                    onPress={() => edit(row.editor)}
                    onVersions={() =>
                      row.entry && setVersions({ entry: row.entry, title: row.title })
                    }
                  />
                ))}
              </FitnessGroup>
            ))
          : null}

        {profile ? (
          <FitnessGroup label="Tu cuerpo">
            <FitnessDatum
              title="Sexo biológico"
              value={sex ? SEX_NAME[sex] : undefined}
              provenance="Declarado por ti · solo para cálculos"
              onPress={() => setOpen('sex')}
            />
            <FitnessDatum
              title="Peso"
              value={weight ? `${tenths(weight.value)} kg` : undefined}
              provenance="Declarado por ti"
              onPress={() => router.push('/body')}
            />
            <FitnessDatum
              title="Estatura"
              value={height ? `${decimal(height.value)} cm` : undefined}
              provenance="Declarado por ti"
              onPress={() => router.push('/body')}
            />
          </FitnessGroup>
        ) : null}
      </ScrollView>

      <GoalSheet
        visible={open === 'goal' && profile !== undefined}
        current={value('primary_training_goal')?.[0]}
        saving={saving}
        failure={failure}
        onDismiss={close}
        onSave={(goal) =>
          goal && void save(() => sources.declareClaim('primary_training_goal', goal))
        }
      />
      <ExperienceSheet
        visible={open === 'experience' && profile !== undefined}
        current={value('training_experience')?.[0]}
        saving={saving}
        failure={failure}
        onDismiss={close}
        onSave={(level) =>
          level && void save(() => sources.declareClaim('training_experience', level))
        }
      />
      <FocusSheet
        visible={open === 'focus' && profile !== undefined}
        current={focusOf(value('focus_areas'))}
        saving={saving}
        failure={failure}
        onDismiss={close}
        onSave={(areas) => void save(() => sources.declareFocusAreas(areas))}
      />
      <RoutineSheet
        visible={open === 'routine' && profile !== undefined}
        current={routine}
        saving={saving}
        failure={failure}
        onDismiss={close}
        onSave={(next) =>
          void save(async () => {
            // Two claims, two commands: each answer is its own datum with its own origin.
            if (next.days !== undefined && next.days !== routine.days) {
              await sources.declareClaim('training_days_per_week', String(next.days))
            }
            if (next.duration !== undefined && next.duration !== routine.duration) {
              await sources.declareClaim('session_duration', next.duration)
            }
          })
        }
      />
      <SexSheet
        visible={open === 'sex' && profile !== undefined}
        current={sex}
        saving={saving}
        failure={failure}
        onDismiss={close}
        onSave={(next) => void save(() => sources.correctBiologicalSex(next))}
      />
      <VersionsSheet
        entry={versions?.entry}
        title={versions?.title ?? ''}
        onDismiss={() => setVersions(undefined)}
      />
    </Screen>
  )
}

function durationOf(value: string | undefined): SessionDuration | undefined {
  const known: readonly SessionDuration[] = [
    'up_to_30_min',
    '30_to_45_min',
    '45_to_60_min',
    'over_60_min',
  ]
  return known.find((one) => one === value)
}

function focusOf(values: readonly string[] | undefined): readonly FocusArea[] {
  const known: readonly FocusArea[] = [
    'chest',
    'back',
    'shoulders',
    'arms',
    'abs',
    'glutes',
    'legs',
    'whole_body',
  ]
  return known.filter((one) => values?.includes(one) ?? false)
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 12 },
  content: { gap: 20, paddingTop: 4, paddingBottom: 40 },
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  grow: { flex: 1 },
})

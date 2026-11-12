/**
 * `PF-3b` · Perfil fitness (`HU-SP-023`, TECH-43): everything the platform knows about
 * how somebody trains, where each datum came from, and the way to correct it.
 *
 * **Every question is a row, answered or not**, so the days, the time, the place and the
 * equipment — which the onboarding never asked — are answered from here. Each row opens
 * its own screen; «+1 versión» opens the others, because the profile shows one version per
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
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter, type Href } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { decimal, latestOf, tenths, type BodyRecord } from '../../src/client/body'
import { readBodyRecords } from '../../src/client/body-transport'
import { fitnessSections, type Editor, type FitnessProfile } from '../../src/client/fitness-profile'
import type { BiologicalSex } from '../../src/client/onboarding'
import { readFitnessProfile } from '../../src/client/profile-transport'
import { FitnessDatum, FitnessGroup } from '../../src/components/fitness-profile-ui'

const UNREADABLE = 'No pudimos leer tu perfil. Revisa tu conexión e inténtalo otra vez.'
const SEX_NAME: Record<BiologicalSex, string> = { female: 'Femenino', male: 'Masculino' }

const EDITOR_ROUTE: Record<Editor, Href> = {
  goal: '/me/goal',
  focus: '/me/focus',
  experience: '/me/experience',
  routine: '/me/routine',
  place: '/me/place',
}

export interface FitnessSources {
  readonly readProfile: () => Promise<FitnessProfile>
  readonly readBody: () => Promise<BodyRecord[]>
}

const LIVE: FitnessSources = { readProfile: readFitnessProfile, readBody: readBodyRecords }

export default function FitnessProfileRoute() {
  return <FitnessProfileScreen sources={LIVE} />
}

/** The screen given where its data comes from; the route passes the real sources. */
export function FitnessProfileScreen({ sources }: { readonly sources: FitnessSources }) {
  const router = useRouter()
  const [profile, setProfile] = useState<FitnessProfile | undefined>(undefined)
  const [body, setBody] = useState<BodyRecord[]>([])
  const [unreadable, setUnreadable] = useState(false)
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

  const sections = fitnessSections(profile)
  const sex = profile?.biological_sex ?? null
  const weight = latestOf(body, 'body_weight')
  const height = latestOf(body, 'body_height')

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header">
          Perfil fitness
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                    onPress={() => router.push(EDITOR_ROUTE[row.editor])}
                    onVersions={() =>
                      router.push({ pathname: '/me/versions', params: { code: row.code } })
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
              onPress={() => router.push('/me/sex')}
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
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 12 },
  content: { gap: 20, paddingTop: 4, paddingBottom: 40 },
})

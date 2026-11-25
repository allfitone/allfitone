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
import { DatumRow } from '@allfitone/react-native/datum-row'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter, type Href } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { decimal, latestOf, massTenths, tenths, type BodyRecord } from '../../src/client/body'
import { readBodyRecords } from '../../src/client/body-transport'
import { fitnessSections, type Editor, type FitnessProfile } from '../../src/client/fitness-profile'
import { readFitnessProfile } from '../../src/client/profile-transport'
import { FitnessGroup } from '../../src/components/fitness-profile-ui'
import { useLocale, useText } from '../../src/i18n/use-text'
import { useUnits } from '../../src/units/use-units'

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
  const locale = useLocale()
  const { mass } = useUnits()
  const text = useText()
  const t = text.fitness
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

  const sections = fitnessSections(profile, t)
  const sex = profile?.biological_sex ?? null
  const weight = latestOf(body, 'body_weight')
  const height = latestOf(body, 'body_height')

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header">
          {t.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {unreadable ? <InlineAlert message={t.unreadable} /> : null}

        {profile
          ? sections.map((section) => (
              <FitnessGroup key={section.title} label={section.title}>
                {section.rows.map((row) => (
                  <DatumRow
                    key={row.code}
                    label={row.title}
                    {...(row.value === undefined ? {} : { value: row.value })}
                    {...(row.provenance === undefined ? {} : { origin: row.provenance })}
                    {...(row.versions === undefined
                      ? {}
                      : {
                          versions: {
                            label: row.versions,
                            onPress: () =>
                              router.push({ pathname: '/me/versions', params: { code: row.code } }),
                          },
                        })}
                    onPress={() => router.push(EDITOR_ROUTE[row.editor])}
                  />
                ))}
              </FitnessGroup>
            ))
          : null}

        {profile ? (
          <FitnessGroup label={t.sections.body}>
            <DatumRow
              label={t.rows.biologicalSex}
              {...(sex ? { value: t.sex[sex] } : {})}
              origin={t.sexOrigin}
              onPress={() => router.push('/me/sex')}
            />
            <DatumRow
              label={t.rows.weight}
              {...(weight
                ? { value: `${tenths(massTenths(weight.value, mass), locale)} ${mass}` }
                : {})}
              origin={t.provenance.person_declared}
              onPress={() => router.push('/body')}
            />
            <DatumRow
              label={t.rows.height}
              {...(height ? { value: `${decimal(height.value, locale)} cm` } : {})}
              origin={t.provenance.person_declared}
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

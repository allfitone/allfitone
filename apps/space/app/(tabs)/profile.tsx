/**
 * `PF-1` · Perfil — the index of the person's account, and `HU-SP-003`'s way out.
 *
 * The screen is a table of contents: who is signed in, the plan they are on, and then
 * the account in five groups — the person, their account and access, their gyms,
 * privacy, and plan and payments. The account sits right after the person because it is
 * where they change who they are and how they sign in. Each row carries the one fact that
 * tells somebody whether to open it.
 *
 * **Only what exists opens.** Most of these parts of the account are their own stories
 * and have no screen yet. They are listed so the shape of the account is visible, but
 * marked «Pronto» and not pressable: a chevron that leads nowhere is a broken promise.
 * Facts come only from what the API answers — the name from the training profile, the
 * plan and the gyms from `GET /pro` — and where there is no fact, the row says what it
 * holds instead of inventing one.
 *
 * **The confirmation is not ceremony.** `HU-SP-003` criterion 2 requires a warning
 * when a workout has not reached the server, because erasing the tokens takes it with
 * it. So the first press asks and the second forgets — and the flow, not this screen,
 * decides which is which.
 */

import { Badge } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import Constants from 'expo-constants'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { createSpaceExecutionFlow } from '../../src/client/execution-transport'
import { forgetExerciseLibrary } from '../../src/client/exercise-library'
import { foundingMemberLabel } from '../../src/client/fitness-profile'
import { readIdentity } from '../../src/client/profile-transport'
import { gymsOf, sourceLine, type ProStatus } from '../../src/client/pro'
import { createSpaceProFlow } from '../../src/client/pro-transport'
import { initialsOf, paymentsCaption, planCaption } from '../../src/client/profile'
import type { SignOutFlow } from '../../src/client/sign-out'
import { createSpaceSignOutFlow } from '../../src/client/sign-out-transport'
import { latestOf, tenths } from '../../src/client/body'
import { readBodyRecords } from '../../src/client/body-transport'
import { deviceTimezone } from '../../src/client/timezone'
import { PlanCard, ProfileGroup, ProfileRow, ProTeaser } from '../../src/components/profile-ui'
import { DOCK_HEIGHT } from '../../src/components/tab-bar'
import { useLocale, useText } from '../../src/i18n/use-text'

export interface ProfileSources {
  readonly readName: () => Promise<string>
  /** The badge already worded; undefined for somebody who holds no number. */
  readonly readFounding: () => Promise<string | undefined>
  readonly readPlan: () => Promise<ProStatus>
  /** The latest weight in kilos; undefined when none was ever recorded. */
  readonly readWeight: () => Promise<number | undefined>
  readonly signOut: SignOutFlow
}

export default function ProfileRoute() {
  const sources = useMemo<ProfileSources>(() => {
    const training = createSpaceExecutionFlow()
    const pro = createSpaceProFlow()
    return {
      readName: () =>
        training.readToday(deviceTimezone()).then((today) => today.profile.given_name),
      readFounding: () =>
        readIdentity().then((identity) => foundingMemberLabel(identity.founding_member_number)),
      readPlan: () => pro.read(),
      readWeight: () =>
        readBodyRecords().then((records) => {
          const latest = latestOf(records, 'body_weight')
          return latest?.value
        }),
      signOut: createSpaceSignOutFlow(),
    }
  }, [])
  return <ProfileScreen sources={sources} />
}

/** The screen itself, given where its facts come from: the route passes the real ones. */
export function ProfileScreen({ sources }: { readonly sources: ProfileSources }) {
  const router = useRouter()
  const theme = useTheme()
  const text = useText()
  const locale = useLocale()
  const t = text.profile
  const [name, setName] = useState('')
  const [founding, setFounding] = useState<string | undefined>(undefined)
  const [plan, setPlan] = useState<ProStatus | undefined>(undefined)
  const [weight, setWeight] = useState<number | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      let active = true
      // A fact that cannot load leaves its row quieter, not the screen in error.
      sources
        .readName()
        .then((read) => active && setName(read))
        .catch(() => undefined)
      sources
        .readFounding()
        .then((read) => active && setFounding(read))
        .catch(() => undefined)
      sources
        .readPlan()
        .then((read) => active && setPlan(read))
        .catch(() => undefined)
      sources
        .readWeight()
        .then((read) => active && setWeight(read))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [sources]),
  )

  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const leave = async (force: boolean) => {
    setBusy(true)
    setWarning(false)
    try {
      const outcome = await sources.signOut.signOut(force ? { force: true } : undefined)
      if (outcome.state === 'unsynced-workout') {
        setWarning(true)
        return
      }
      // Nothing personal is in it, but a cache that outlives the session it was read
      // under is a cache nobody can reason about.
      forgetExerciseLibrary()
      // Replaced, not pushed: there must be no way back into a signed-out session.
      router.replace('/welcome')
      if (outcome.state === 'signed-out-locally') setNotice(t.signedOutLocally)
    } finally {
      setBusy(false)
    }
  }

  const initials = initialsOf(name)
  const gyms = plan ? gymsOf(plan) : []
  const version = Constants.expoConfig?.version

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text role="control" size="2xl" accessibilityRole="header">
          {t.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {notice ? <InlineAlert message={notice} /> : null}

        <View style={styles.who}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: theme.color.accent.tonal,
                borderColor: theme.color.accent.tonalBorder,
              },
            ]}
          >
            {initials ? (
              <Text role="display" size="2xl">
                {initials}
              </Text>
            ) : (
              <FoundationIcon
                name="person"
                size="lg"
                color={theme.color.icon.secondary}
                decorative
              />
            )}
          </View>
          <View style={styles.grow}>
            {name ? (
              <Text role="control" size="lg">
                {name}
              </Text>
            ) : null}
            <Text role="body" size="xs" color="secondary">
              {t.fitnessIdActive}
            </Text>
            {founding ? (
              <View style={styles.founding}>
                <Badge label={founding} tone="accent" />
              </View>
            ) : null}
          </View>
        </View>

        {plan ? (
          <PlanCard
            pro={plan.is_pro}
            caption={sourceLine(plan, text.pro)}
            onPress={() => router.push('/pro')}
          />
        ) : null}
        {plan && !plan.is_pro ? <ProTeaser onPress={() => router.push('/pro/plans')} /> : null}

        <ProfileGroup label={t.groups.you}>
          <ProfileRow
            icon="progress"
            title={t.rows.progress.title}
            caption={t.rows.progress.caption}
            end="open"
            onPress={() => router.push('/progress')}
          />
          <ProfileRow
            icon="person"
            title={t.rows.body.title}
            caption={t.rows.body.caption}
            end="open"
            value={weight === undefined ? undefined : `${tenths(weight, locale)} kg`}
            onPress={() => router.push('/body')}
          />
          <ProfileRow
            icon="person"
            title={t.rows.fitness.title}
            caption={t.rows.fitness.caption}
            end="open"
            onPress={() => router.push('/me/fitness')}
          />
          <ProfileRow
            icon="heart"
            title={t.rows.health.title}
            caption={t.rows.health.caption}
            end="open"
            alert
            onPress={() => router.push('/me/health')}
          />
        </ProfileGroup>

        <ProfileGroup label={t.groups.account}>
          <ProfileRow
            icon="person"
            title={t.rows.identity.title}
            caption={t.rows.identity.caption}
            end="open"
            onPress={() => router.push('/me/identity')}
          />
          <ProfileRow
            icon="notification"
            title={t.rows.notifications.title}
            caption={t.rows.notifications.caption}
            end="soon"
          />
          <ProfileRow
            icon="settings"
            title={t.rows.preferences.title}
            caption={t.rows.preferences.caption}
            end="soon"
          />
          <ProfileRow
            icon="activity"
            title={t.rows.appleHealth.title}
            caption={t.rows.appleHealth.caption}
            end="soon"
          />
        </ProfileGroup>

        <ProfileGroup label={t.groups.gyms}>
          {gyms.length > 0 ? (
            gyms.map((gym) => (
              <ProfileRow
                key={gym.organization_id}
                icon="organization"
                title={gym.organization_name}
                caption={t.rows.gym.caption}
                end="open"
                onPress={() => router.push('/gyms')}
              />
            ))
          ) : (
            <ProfileRow
              icon="organization"
              title={t.rows.noGym.title}
              caption={t.rows.noGym.caption}
              end="none"
            />
          )}
          <ProfileRow
            icon="history"
            title={t.rows.pastRelationships.title}
            caption={t.rows.pastRelationships.caption}
            end="open"
            onPress={() => router.push('/gyms')}
          />
        </ProfileGroup>

        <ProfileGroup label={t.groups.privacy}>
          <ProfileRow
            icon="permissions"
            title={t.rows.sharing.title}
            caption={t.rows.sharing.caption}
            end="open"
            onPress={() => router.push('/sharing')}
          />
          <ProfileRow
            icon="locked"
            title={t.rows.hiddenSessions.title}
            caption={t.rows.hiddenSessions.caption}
            end="soon"
          />
          <ProfileRow
            icon="remove"
            title={t.rows.deleteData.title}
            caption={t.rows.deleteData.caption}
            end="soon"
          />
        </ProfileGroup>

        <ProfileGroup label={t.groups.plan}>
          <ProfileRow
            icon="favourite"
            title={t.rows.plan.title}
            caption={plan ? planCaption(plan, t) : undefined}
            end="open"
            onPress={() => router.push('/pro')}
          />
          <ProfileRow
            icon="frequency"
            title={t.rows.payments.title}
            caption={plan ? paymentsCaption(plan, t) : undefined}
            end="open"
            onPress={() => router.push('/pro/payments')}
          />
          {/* A gym plan is not Pro: the gym sets the price and charges it through its own
              gateway. Both are money, so they belong in the same group. */}
          <ProfileRow
            icon="organization"
            title={t.rows.gymPlans.title}
            caption={t.rows.gymPlans.caption}
            end="open"
            onPress={() => router.push('/subscriptions')}
          />
        </ProfileGroup>

        <Button
          label={t.signOut}
          variant="outlineDanger"
          loading={busy}
          disabled={busy}
          style={styles.leave}
          onPress={() => void leave(false)}
        />

        <Text role="body" size="2xs" color="muted" align="center">
          {version ? t.version(version) : 'Allfit Space'}
        </Text>
      </ScrollView>

      <Sheet visible={warning} onDismiss={() => setWarning(false)} title={t.unsynced.title}>
        <View style={styles.sheetBody}>
          <Text role="body" size="sm" color="secondary">
            {t.unsynced.body}
          </Text>
          <Button
            label={t.unsynced.back}
            onPress={() => {
              setWarning(false)
              router.replace('/today')
            }}
          />
          <Button
            label={t.unsynced.signOutAnyway}
            variant="ghost"
            onPress={() => void leave(true)}
          />
        </View>
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  // Today's sign-out pill is 52 tall; the DS md button is 44.
  leave: { minHeight: 52 },
  header: { paddingTop: 6, paddingBottom: 12 },
  content: { gap: 18, paddingTop: 4, paddingBottom: DOCK_HEIGHT + 40 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: 3 },
  founding: { alignSelf: 'flex-start', marginTop: 5 },
  sheetBody: { gap: 12 },
})

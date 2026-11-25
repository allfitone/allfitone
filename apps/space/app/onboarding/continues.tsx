/**
 * The end of the onboarding — HU-SP-099, carrying HU-SP-008's guarantee.
 *
 * This screen used to say the Fitness ID was not active yet and that the rest was
 * still being built, which was true and is not any more: pressing the button
 * **activates it**. That matters more than the copy. A screen that says "perfil
 * listo" while the row sits in `pending_activation` is lying about the one thing
 * it exists to report, and until now nothing in the app ever called
 * `identity.activate_person` — the function and its grant had been sitting there
 * since 22 August with no route and no client.
 *
 * Activation happens **on entering, not later**, which is criterion 2. There is no
 * separate confirmation step to forget, and the button is disabled once it has
 * succeeded so a second press cannot become a second command.
 *
 * The photograph is the person's own, decided in `welcomeVariant`. The username in
 * the eyebrow is criterion 1: what confirms somebody finished is their own
 * identity, not a generic message.
 *
 * The week **promises no sessions**, which is criterion 3. Nothing schedules
 * training yet, so the chips say when what follows begins and nothing more; today
 * is marked and the rest are only outlined.
 *
 * The back arrow stays, which is criterion 4: closing the onboarding does not
 * close the answers.
 *
 * Activating hands over to **Hoy**, which `HU-SP-100` built. Before it there was no
 * screen after this one and the button held here, saying the Fitness ID was active
 * and going nowhere. Coming back cold no longer lands here at all: the resume read
 * reports the attempt as `activated` and the entry decision goes straight to Hoy —
 * which is what `20260913180900_resume_after_activation.sql` was written for, since
 * before it an activated person read exactly like an account that never started and
 * was sent back to the eligibility gate.
 */

import { Button } from '@allfitone/react-native/button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { transparent, withAlpha } from '@allfitone/react-native/tokens'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Image, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { OnboardingBack } from '../../src/components/onboarding-header'
import { ApiError } from '../../src/client'
import { useText } from '../../src/i18n/use-text'
import { createSpaceInvitationFlow } from '../../src/client/gym-affiliation-transport'
import { createSpaceOnboardingFlow } from '../../src/client/onboarding-transport'
import { lastRevisitableStep, TODAY } from '../../src/client/onboarding-steps'
import {
  canActivate,
  completionFor,
  storeOf,
  welcomeVariant,
  type DeclaredIdentity,
} from '../../src/client/welcome-form'
import { weekFromToday } from '../../src/client/week'

import welcomeFemale from '../../assets/images/welcome/welcome-female.webp'
import welcomeMale from '../../assets/images/welcome/welcome-male.webp'

/** How far down the photograph reaches, as a share of the screen height. */
const PHOTO_SHARE = 0.58
/** The veil runs past the photograph so its close is on the canvas, not on an edge. */
const VEIL_SHARE = 0.66
/**
 * Where the veil turns solid, as a share of its own height: exactly the bottom of
 * the photograph. The design's last stop is at 1, which leaves the cut some seven
 * per cent transparent — invisible on the dark mock and a hard line across a lit leg.
 */
const VEIL_CLOSE = PHOTO_SHARE / VEIL_SHARE

type Failure = 'expired' | 'readFailed' | 'activateFailed'

export default function OnboardingContinues() {
  const router = useRouter()
  const theme = useTheme()
  const { height } = useWindowDimensions()
  // The photograph runs under the status bar, so the top inset is padding on the
  // copy rather than an edge on the screen.
  const insets = useSafeAreaInsets()
  const flow = useMemo(() => createSpaceOnboardingFlow(), [])
  const text = useText()
  const words = text.onboarding
  const invitations = useMemo(() => createSpaceInvitationFlow(), [])
  const back = lastRevisitableStep()

  const [username, setUsername] = useState<string | undefined>(undefined)
  const [identity, setIdentity] = useState<DeclaredIdentity | undefined>(undefined)
  const [sex, setSex] = useState<'male' | 'female' | null>(null)
  const [activating, setActivating] = useState(false)
  const [activated, setActivated] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [failure, setFailure] = useState<Failure | undefined>(undefined)

  useEffect(() => {
    let active = true

    flow
      .resume()
      .then((current) => {
        if (!active) return
        const declared = current.answers.identity.value
        if (declared) {
          setUsername(declared.username)
          setIdentity({ given_name: declared.given_name, family_name: declared.family_name })
        }
        setSex(current.answers.biological_sex.value ?? null)
        // Coming back to an attempt that is already activated: the command has run,
        // and offering the button again would offer to run it twice.
        if (current.attempt?.status === 'activated') setActivated(true)
      })
      .catch((cause: unknown) => {
        if (!active) return
        if (cause instanceof ApiError && cause.failure === 'unauthenticated') {
          setSessionExpired(true)
          setFailure('expired')
          return
        }
        setFailure('readFailed')
      })

    return () => {
      active = false
    }
  }, [flow])

  const start = async () => {
    if (!identity) return
    setActivating(true)
    setFailure(undefined)
    try {
      await flow.activate(completionFor(identity, storeOf(Platform.OS)))
      setActivated(true)
      // An invitation waiting on her address is shown once, before Hoy (INV-3).
      const pending = await invitations.listMine().catch(() => [])
      const first = pending[0]
      if (first) router.replace({ pathname: '/invitation/arrived', params: { id: first.id } })
      else router.replace(TODAY)
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.failure === 'unauthenticated') {
        setSessionExpired(true)
        setFailure('expired')
      } else {
        setFailure('activateFailed')
      }
    } finally {
      setActivating(false)
    }
  }

  const today = useMemo(() => new Date(), [])
  const week = useMemo(() => weekFromToday(today), [today])
  const canvas = theme.color.background.canvas

  const failures: Record<Failure, string> = {
    expired: words.continues.expired,
    readFailed: words.readFailed,
    activateFailed: words.continues.activateFailed,
  }

  return (
    <Screen edges={['bottom']} dots padded={false}>
      <Image
        source={welcomeVariant(sex) === 'female' ? welcomeFemale : welcomeMale}
        style={[styles.photo, { height: height * PHOTO_SHARE }]}
        resizeMode="cover"
        accessible={false}
      />

      {/* What lets the copy sit on the photograph: it lifts off the top so the status
          bar stays legible, stays clear through the figure, and closes to the canvas. */}
      <LinearGradient
        colors={[
          withAlpha(canvas, 0.45),
          transparent(canvas),
          transparent(canvas),
          withAlpha(canvas, 0.9),
          canvas,
          canvas,
        ]}
        locations={[0, 0.2, 0.42, 0.82, VEIL_CLOSE, 1]}
        style={[styles.veil, { height: height * VEIL_SHARE }]}
        pointerEvents="none"
      />

      <View style={[styles.frame, { paddingTop: insets.top }]}>
        {back ? <OnboardingBack to={back} /> : null}

        <View style={styles.content}>
          <Text role="eyebrow" size="xs" color="accent">
            {username ? words.continues.readyAs(username.toUpperCase()) : words.continues.ready}
          </Text>

          <Text role="display" size="5xl" uppercase accessibilityRole="header">
            {words.continues.title}
          </Text>

          <View style={styles.week}>
            <Text role="eyebrow" size="xs" color="muted">
              {words.continues.firstWeek}
            </Text>
            <View
              style={styles.days}
              accessibilityRole="text"
              accessibilityLabel={words.continues.firstWeekLabel}
            >
              {week.map((day, offset) => (
                <View
                  key={day.key}
                  style={[
                    styles.day,
                    day.today
                      ? { backgroundColor: theme.color.action.primary }
                      : { borderWidth: 1.5, borderColor: theme.color.border.subtle },
                  ]}
                >
                  {/* A word beside six letters: at the same size and tracking it
                      reads as the loudest thing on the row, which the marker is not. */}
                  <Text
                    role={day.today ? 'control' : 'label'}
                    size={day.today ? 'xs' : 'sm'}
                    color="muted"
                    style={day.today ? { color: theme.color.action.onPrimary } : null}
                  >
                    {day.today
                      ? words.continues.today
                      : words.continues.weekLetters.charAt((today.getDay() + offset) % 7)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {failure ? <InlineAlert message={failures[failure]} /> : null}
          {activated ? (
            <Text role="body" size="sm" color="secondary">
              {words.continues.activated}
            </Text>
          ) : null}

          <Button
            label={sessionExpired ? words.signIn : words.continues.start}
            loading={activating}
            disabled={!canActivate({ identity, activating, activated, sessionExpired })}
            onPress={sessionExpired ? () => router.replace('/sign-in') : start}
          />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  photo: { position: 'absolute', top: 0, left: 0, right: 0 },
  veil: { position: 'absolute', top: 0, left: 0, right: 0 },
  frame: { flex: 1, paddingHorizontal: 24, paddingBottom: 24, gap: 8 },
  // The copy hangs from the bottom, so a taller phone grows the photograph rather
  // than opening a gap under the title.
  content: { flex: 1, justifyContent: 'flex-end', gap: 20 },
  week: { gap: 11 },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
})

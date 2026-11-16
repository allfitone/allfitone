/**
 * Onboarding biological sex — HU-SP-096.
 *
 * The datum is written straight onto `identity.people`, not into the profile
 * claims catalogue. That catalogue exists for data that changes and that several
 * sources observe — weight, measurements, health context, each carrying its own
 * provenance and validity window. Biological sex is a single stable fact with one
 * possible source, so all of that machinery would sit unused.
 *
 * Three answers, and the third is not a value. Declining records nothing on the
 * person: an `unknown` label would force every later reader to tell "declined"
 * apart from "never asked", and no profile reader needs that. What it does record
 * is that the question was answered, on the attempt rather than on the person —
 * the person holds facts, the attempt holds how far the person got. Without that
 * mark a screen which skips itself once answered would ask a decliner again on
 * every cold start, and the onboarding could never advance past it.
 *
 * Nothing is preselected. The reference designs arrive with one card already
 * marked, which would write a declaration nobody made.
 *
 * `Screen` already applies `panelInset` on each side, so this screen adds no
 * horizontal padding of its own — adding it once cut the second card off at the
 * edge. The card width is measured from the row that holds them rather than
 * derived from the window, which is the only version that cannot disagree with
 * whatever the design system pads. See `sex-form.ts`.
 *
 * The portraits live in `sex-picker.tsx`, shared with the screen that corrects the
 * answer later from «Perfil fitness». They belong in the design system once a
 * choice-card component exists there.
 */

import { Button } from '@allfitone/react-native/button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { OnboardingHeader } from '../../src/components/onboarding-header'
import { ApiError } from '../../src/client'
import { createSpaceOnboardingFlow } from '../../src/client/onboarding-transport'
import { guardStep, nextRouteAfter } from '../../src/client/onboarding-steps'
import { canSubmitSex, type SexAnswer } from '../../src/client/sex-form'
import { SexPicker } from '../../src/components/sex-picker'

/** Keeps the button off the very bottom edge, the same amount on every step. */
const FOOTER_LIFT = 16

const EXPIRED = 'Tu sesión venció. Vuelve a entrar para guardar tu respuesta.'
const UNREACHABLE = 'No pudimos guardar tu respuesta. Inténtalo otra vez.'
const TAKEN_CONFLICT = 'No pudimos guardar tu respuesta. Inténtalo otra vez.'

export default function OnboardingBiologicalSex() {
  const router = useRouter()
  const flow = useMemo(() => createSpaceOnboardingFlow(), [])

  const [answer, setAnswer] = useState<SexAnswer | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true

    flow
      .resume()
      .then((current) => {
        if (!active) return
        // Only backwards: a missing prerequisite cannot be skipped, but an answer
        // already given is editable — that is what the back arrow is for.
        const owed = guardStep('/onboarding/sex', current)
        if (owed) {
          router.replace(owed)
          return
        }
        // Prefilled so going back shows what was answered rather than an empty
        // screen. Declining left no value, and that is a real state: answered with
        // nothing, which is exactly `null`.
        const sex = current.answers.biological_sex
        if (sex.answered) setAnswer(sex.value ?? null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        if (cause instanceof ApiError && cause.failure === 'unauthenticated') {
          setSessionExpired(true)
          setFailure(EXPIRED)
          return
        }
        setFailure(UNREACHABLE)
      })

    return () => {
      active = false
    }
  }, [flow, router])

  const pressable = !submitting && !sessionExpired
  const submittable = canSubmitSex({ answer, submitting, sessionExpired })

  const submit = async () => {
    if (answer === undefined) return
    setSubmitting(true)
    setFailure(undefined)
    try {
      await flow.declareBiologicalSex(answer)
      router.replace(nextRouteAfter('/onboarding/sex'))
    } catch (cause) {
      if (cause instanceof ApiError && cause.failure === 'conflict') {
        setFailure(TAKEN_CONFLICT)
        return
      }
      if (cause instanceof ApiError && cause.failure === 'unauthenticated') {
        setSessionExpired(true)
        setFailure(EXPIRED)
        return
      }
      setFailure(UNREACHABLE)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']} dots>
      <OnboardingHeader step="/onboarding/sex" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text role="display" size="4xl" uppercase accessibilityRole="header">
          {'Tu sexo\nbiológico'}
        </Text>
        <Text role="body" size="md" color="secondary" style={styles.lede}>
          Calibra tu gasto energético y tus rangos de referencia. Es lo único para lo que lo usamos.
        </Text>

        <SexPicker
          answer={answer}
          onChoose={setAnswer}
          pressable={pressable}
          declineNote="Puedes añadirlo cuando quieras desde tu perfil. Nada más cambia."
        />
      </ScrollView>

      {/* Outside the scroll so the button sits in the same place on every step of
          the onboarding, whatever the content above it does. */}
      <View style={styles.footer}>
        {failure ? (
          <View style={styles.alert}>
            <InlineAlert message={failure} />
          </View>
        ) : null}

        <Button
          label="Continuar"
          disabled={!submittable}
          loading={submitting}
          onPress={() => {
            void submit()
          }}
          style={styles.submit}
        />

        {/* Without this the screen says "sign in again" and offers no way to. */}
        {sessionExpired ? (
          <Button
            label="Iniciar sesión"
            variant="secondary"
            onPress={() => router.replace('/sign-in')}
          />
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  footer: { paddingTop: 4, paddingBottom: FOOTER_LIFT },
  content: { flexGrow: 1, paddingTop: 18, paddingBottom: 26 },
  lede: { marginTop: 11 },
  alert: { marginTop: 14 },
  submit: { marginTop: 20 },
})

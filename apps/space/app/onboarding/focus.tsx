/**
 * What do you want to focus on — HU-SP-097.
 *
 * Front and back at once, no toggle. A muscle map with a side switch makes the
 * person hunt for the face their zone lives on before they can even see it, and
 * half the zones here span both — arms light the biceps in front and the triceps
 * behind. Two instances of the map cost one screen of width and remove the hunt.
 *
 * No frame around them. A bordered panel put the bodies in a box and left them
 * swimming in it; the figures sit straight on the canvas instead.
 *
 * Tapping a muscle on the figure and tapping its chip are the same control, which
 * is criterion 1: the list is a real alternative to the figure, not decoration.
 * Someone who cannot or will not aim at a small shape gets the same answer from a
 * 44 pt chip.
 *
 * Both bodies draw their outline. An earlier version turned it off on the grounds
 * that the library ships one for the man and none for the woman; that was wrong —
 * `SvgFemaleWrapper` ships both faces — and without it the silhouette was open and
 * the muscles read as loose pieces. Why the figure is composed rather than
 * configured, and what each part of the painting is for, is in `body-figure.tsx`.
 *
 * Nothing arrives selected, and continuing requires an answer — "whole body" is
 * how someone says "no emphasis" without leaving the question open. Criterion 3 of
 * the story was amended to match. Every rule about what a selection means lives in
 * `focus-form.ts`.
 *
 * It saves through `OP-IDN-046`, which exists because the emphasis is the first
 * profile attribute that holds several values at once: `OP-IDN-004` seals the live
 * claim of the same attribute before inserting, so three zones through that route
 * would have kept one and lost two in silence. The command carries the whole set,
 * so deselecting a zone is expressed by its absence.
 */

import { Button } from '@allfitone/react-native/button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'

import { FocusPicker } from '../../src/components/focus-picker'
import { OnboardingHeader } from '../../src/components/onboarding-header'
import { ApiError } from '../../src/client'
import { createSpaceOnboardingFlow } from '../../src/client/onboarding-transport'
import { guardStep, nextRouteAfter } from '../../src/client/onboarding-steps'
import {
  areasFor,
  bodyScale,
  canSubmitFocus,
  NOTHING_CHOSEN,
  selectionFromAreas,
  toggleFocus,
  type FocusChoice,
  type FocusSelection,
} from '../../src/client/focus-form'

const EXPIRED = 'Tu sesión venció. Vuelve a entrar para guardar tu respuesta.'
// Two failures, two sentences: one happens before the person has done anything,
// the other loses work they just did.
const READ_FAILED = 'No pudimos leer tus respuestas. Inténtalo otra vez.'
const SAVE_FAILED = 'No pudimos guardar tu respuesta. Inténtalo otra vez.'

/** Keeps the button off the very bottom edge, the same amount on every step. */
const FOOTER_LIFT = 16

/** Everything above the map: header, title, lede, chips, hint and button. */
const CHROME_HEIGHT = 600

export default function OnboardingFocus() {
  const router = useRouter()
  const { height } = useWindowDimensions()
  const flow = useMemo(() => createSpaceOnboardingFlow(), [])

  const [selection, setSelection] = useState<FocusSelection>(NOTHING_CHOSEN)
  const [declaredSex, setDeclaredSex] = useState<'male' | 'female' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const scale = bodyScale(Math.max(0, height - CHROME_HEIGHT))

  useEffect(() => {
    let active = true

    flow
      .resume()
      .then((current) => {
        if (!active) return
        // Only backwards: a missing prerequisite cannot be skipped, but an answer
        // already given is editable, which is what the back arrow is for.
        const owed = guardStep('/onboarding/focus', current)
        if (owed) {
          router.replace(owed)
          return
        }
        setDeclaredSex(current.answers.biological_sex.value ?? null)
        setSelection(selectionFromAreas(current.answers.focus_areas.value))
      })
      .catch((cause: unknown) => {
        if (!active) return
        if (cause instanceof ApiError && cause.failure === 'unauthenticated') {
          setSessionExpired(true)
          setFailure(EXPIRED)
          return
        }
        setFailure(READ_FAILED)
      })

    return () => {
      active = false
    }
  }, [flow, router])

  const pressable = !submitting && !sessionExpired
  const submittable = canSubmitFocus({ selection, submitting, sessionExpired })

  const submit = async () => {
    setSubmitting(true)
    setFailure(undefined)
    try {
      // The whole set, not the change: a zone the person turned off is withdrawn
      // by not being here.
      await flow.declareFocusAreas(areasFor(selection))
      router.replace(nextRouteAfter('/onboarding/focus'))
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.failure === 'unauthenticated') {
        setSessionExpired(true)
        setFailure(EXPIRED)
      } else {
        setFailure(SAVE_FAILED)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const choose = useCallback(
    (choice: FocusChoice) => setSelection((current) => toggleFocus(current, choice)),
    [],
  )

  return (
    <Screen edges={['top', 'bottom']} dots>
      <OnboardingHeader step="/onboarding/focus" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text role="display" size="4xl" uppercase accessibilityRole="header">
          ¿En qué te{'\n'}quieres centrar?
        </Text>
        <Text role="body" size="md" color="secondary" style={styles.lede}>
          Señala lo que más te importa. Es un énfasis: el resto del cuerpo sigue entrando.
        </Text>

        <FocusPicker
          selection={selection}
          onChoose={choose}
          declaredSex={declaredSex}
          scale={scale}
          pressable={pressable}
        />
      </ScrollView>

      {/* Outside the scroll so the button sits in the same place on every step of
          the onboarding, whatever the content above it does. */}
      <View style={styles.footer}>
        {failure ? <InlineAlert message={failure} /> : null}

        <Button
          label="Continuar"
          disabled={!submittable}
          loading={submitting}
          onPress={submit}
          style={styles.submit}
        />

        {sessionExpired ? (
          <Button
            label="Iniciar sesión"
            variant="secondary"
            onPress={() => router.replace('/sign-in')}
            style={styles.signIn}
          />
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 4 },
  footer: { paddingTop: 4, paddingBottom: FOOTER_LIFT },
  lede: { marginTop: 9 },
  submit: { marginTop: 10 },
  signIn: { marginTop: 10 },
})

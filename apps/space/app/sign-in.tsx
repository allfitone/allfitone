/**
 * Sign-in screen.
 *
 * The failure message is the whole point of this screen. HU-SP-002 criterion 2
 * requires that a failed attempt never say whether the address or the password
 * was wrong: a message that distinguishes them turns the form into an oracle for
 * which addresses are registered. So one message covers both, and both fields
 * are marked — marking only the password would leak the same fact visually.
 *
 * The keyboard adjusts the scroll inset instead of resizing the container. A
 * `KeyboardAvoidingView` shrinks the available height, so anything centred or
 * spaced with `flex` recomputes and the whole screen visibly reflows on every
 * focus change. Changing only the inset leaves the layout untouched and simply
 * scrolls the focused field into view, which keeps the content centred without
 * the jump. Android needs `softwareKeyboardLayoutMode: "pan"` for the same
 * reason: the default resizes the window.
 *
 * Only two outcomes are distinguished, and deliberately so. A refused credential
 * and an unknown address both arrive as `unauthenticated`, because the API
 * answers them identically; the one case worth separating is an unreachable API,
 * where telling somebody their password is wrong would be a lie.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ApiError, signIn, unreachable } from '../src/client'
import { startPersonSession } from '../src/client/person-start-transport'
import { storeSession } from '../src/client/session'
import { createSpaceOnboardingFlow } from '../src/client/onboarding-transport'
import { routeAfterAuthentication } from '../src/client/resume-route'
import { PasswordResetSheet } from '../src/components/password-reset-sheet'
import { useText } from '../src/i18n/use-text'

export default function SignIn() {
  const router = useRouter()
  const text = useText()
  const words = text.access.signInScreen

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<'wrong' | 'unreachable' | undefined>(undefined)
  const [resetting, setResetting] = useState(false)

  const failed = failure === 'wrong'
  const canSubmit = email.length > 0 && password.length > 0 && !submitting

  const submit = async () => {
    setSubmitting(true)
    setFailure(undefined)
    try {
      const trimmed = email.trim()
      const session = await signIn(trimmed, password)
      await storeSession({ ...session, email: trimmed })
      startPersonSession()
      router.replace(await routeAfterAuthentication(() => createSpaceOnboardingFlow().resume()))
    } catch (cause) {
      setFailure(cause instanceof ApiError && unreachable(cause) ? 'unreachable' : 'wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']} dots>
      {/* Outside the scroll view: the content below is centred, and a back
          control that drifts to the middle of the screen with it is unfindable. */}
      <IconButton
        icon="back"
        variant="plain"
        accessibilityLabel={text.common.back}
        onPress={() => router.back()}
        style={styles.back}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <Text role="display" size="4xl" uppercase accessibilityRole="header" style={styles.title}>
          {words.title}
        </Text>

        <View style={styles.form}>
          <TextField
            label={text.access.email}
            value={email}
            onChangeText={setEmail}
            placeholder={text.access.emailPlaceholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            returnKeyType="next"
            {...(failed ? { error: '' } : {})}
          />

          <TextField
            label={text.access.password}
            value={password}
            onChangeText={setPassword}
            placeholder={words.passwordPlaceholder}
            autoCapitalize="none"
            autoComplete="current-password"
            secureTextEntry
            textContentType="password"
            returnKeyType="go"
            {...(failed ? { error: '' } : {})}
          />

          {failure ? (
            <InlineAlert message={failure === 'wrong' ? words.failure : text.access.unreachable} />
          ) : null}

          <Button
            label={words.submit}
            disabled={!canSubmit}
            loading={submitting}
            onPress={() => {
              void submit()
            }}
            style={styles.submit}
          />

          <View style={styles.link}>
            <Text role="body" size="sm" color="secondary">
              {words.forgot}
            </Text>
            <Button
              label={words.reset}
              variant="ghost"
              size="sm"
              accessibilityLabel={words.resetLabel}
              onPress={() => setResetting(true)}
            />
          </View>
        </View>
      </ScrollView>

      {/* Anchored to the bottom rather than trailing the form. Inside the
          centred block its own margin would push the fields up instead of
          moving the link down. */}
      <View style={styles.link}>
        <Text role="body" size="sm" color="secondary">
          {words.noAccount}
        </Text>
        <Button
          label={words.create}
          variant="ghost"
          size="sm"
          accessibilityLabel={words.createLabel}
          onPress={() => router.replace('/create-account')}
        />
      </View>
      <PasswordResetSheet visible={resetting} onDismiss={() => setResetting(false)} email={email} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  back: {
    marginLeft: -12,
  },
  title: {
    marginTop: 0,
  },
  form: {
    gap: 14,
    marginTop: 24,
  },
  submit: {
    marginTop: 6,
  },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

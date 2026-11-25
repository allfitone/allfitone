/**
 * Account creation.
 *
 * The promise sits above the form because HU-SP-001 is where the product makes
 * its case: registration needs no invitation, no gym and no trainer, and saying
 * so at the moment someone is deciding whether to type an address is worth more
 * than saying it later.
 *
 * Submitting always moves to verification. The API answers identically whether
 * or not the address was taken, so there is no "already registered" branch to
 * write — not because the screen is lax, but because the response admits no
 * other behaviour. That is HU-SP-001 criterion 3 arriving here as an absence.
 *
 * KNOWN GAP — the password travels to the next screen as a route parameter,
 * because verification signs in once the address is confirmed. Expo Router keeps
 * params in navigation state, so the value can surface in a state dump. It never
 * leaves the device and never lands in storage. An opaque handle was tried and
 * removed: the provider invalidates it the moment the code is emailed, so the
 * two cannot coexist. Closing this needs the API to hold the credential for the
 * few minutes verification takes, which is a contract change.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { RequirementList } from '@allfitone/react-native/requirement-list'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'

import { ApiError, register } from '../src/client'
import { LEGAL_URLS } from '../src/client/legal'
import { isSignUpPassword, signUpRequirements } from '../src/client/password-form'
import type { Dictionary } from '../src/i18n'
import { useText } from '../src/i18n/use-text'

/**
 * Only the password case is described precisely. The others are deliberately
 * vague: the API cannot tell us whether the address was taken, and inventing a
 * more specific message would either be a guess or a disclosure.
 */
function messageFor(cause: unknown, text: Dictionary['access']): string {
  if (!(cause instanceof ApiError)) return text.createAccount.generic
  switch (cause.failure) {
    case 'validation-failed':
      // Reached only when the password passed our rules and the provider still
      // refused it, which now means it resembles something already breached
      // rather than that it is short.
      return text.createAccount.weakPassword
    case 'unavailable':
    case 'rate-limited':
      return text.unreachable
    default:
      return text.createAccount.checkFields
  }
}

export default function CreateAccount() {
  const router = useRouter()
  const text = useText()
  const words = text.access.createAccount
  const rules = text.password.rules

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const canSubmit = email.includes('@') && isSignUpPassword(password) && !submitting

  const submit = async () => {
    setSubmitting(true)
    setFailure(undefined)
    const address = email.trim()
    try {
      await register(address, password)
      router.push({ pathname: '/verify-email', params: { email: address, password } })
    } catch (cause) {
      setFailure(messageFor(cause, text.access))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']} dots>
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
        <Text role="display" size="4xl" uppercase accessibilityRole="header">
          {words.title}
        </Text>
        <Text role="body" size="md" color="secondary" style={styles.lede}>
          {words.lede}
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
            editable={!submitting}
          />

          <TextField
            label={text.access.password}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry={!shown}
            textContentType="newPassword"
            returnKeyType="go"
            editable={!submitting}
            trailing={{
              label: shown ? words.hide : words.show,
              accessibilityLabel: words.toggleLabel(shown),
              onPress: () => setShown((was) => !was),
            }}
          />
          <RequirementList requirements={signUpRequirements(password, rules)} />

          {failure ? <InlineAlert message={failure} /> : null}

          <Button
            label={words.submit}
            disabled={!canSubmit}
            loading={submitting}
            onPress={() => {
              void submit()
            }}
            style={styles.submit}
          />

          <Text role="body" size="sm" color="muted" align="center" style={styles.legal}>
            {words.legal.before}{' '}
            <Text
              role="body"
              size="sm"
              color="accent"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
            >
              {words.legal.terms}
            </Text>{' '}
            {words.legal.between}{' '}
            <Text
              role="body"
              size="sm"
              color="accent"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
            >
              {words.legal.privacy}
            </Text>
            {words.legal.after}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.link}>
        <Text role="body" size="sm" color="secondary">
          {text.access.haveAccount}
        </Text>
        <Button
          label={text.access.signIn}
          variant="ghost"
          size="sm"
          accessibilityLabel={text.access.signInLabel}
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  back: {
    marginLeft: -12,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  lede: {
    marginTop: 12,
  },
  form: {
    gap: 14,
    marginTop: 28,
  },
  submit: {
    marginTop: 6,
  },
  legal: {
    marginTop: 4,
  },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

/**
 * Password recovery, as a sheet over sign-in rather than as screens.
 *
 * The person is on sign-in when they realise they have forgotten the password,
 * and sign-in is exactly where they need to be once the new one is set. Routing
 * this would have meant choosing a destination the flow already had, so the sheet
 * keeps the screen behind it and closing is the return.
 *
 * Two states in one sheet. The confirmation is not a second place — nothing
 * changed about where the person is, only about what they are waiting for.
 *
 * The address arrives already filled from sign-in. Somebody who just typed it and
 * got the password wrong should not be asked for it again.
 *
 * There is no third state. The new password is set on the provider's page, which
 * never hands us its URL, so the app's part ends when the mail is sent.
 */

import { Button } from '@allfitone/react-native/button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { requestPasswordReset } from '../client'
import { createPasswordResetFlow } from '../client/password-reset'
import { useText } from '../i18n/use-text'

export function PasswordResetSheet({
  visible,
  onDismiss,
  email,
}: {
  readonly visible: boolean
  readonly onDismiss: () => void
  readonly email: string
}) {
  const text = useText().access
  const flow = useMemo(() => createPasswordResetFlow({ request: requestPasswordReset }), [])

  const [address, setAddress] = useState(email)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  // Reopening starts over: a sheet that reappeared on its confirmation would be
  // reporting a send that belongs to the previous time it was opened.
  useEffect(() => {
    if (visible) {
      setAddress(email)
      setSent(false)
      setFailure(undefined)
    }
  }, [visible, email])

  const submit = async () => {
    setSubmitting(true)
    setFailure(undefined)
    const outcome = await flow.submit(address)
    setSubmitting(false)
    if (outcome === 'sent') setSent(true)
    else setFailure(outcome === 'invalid' ? text.reset.invalid : text.unreachable)
  }

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={sent ? text.reset.sentTitle : text.reset.title}
    >
      {sent ? (
        <View style={styles.stack}>
          <Text role="body" size="sm" color="secondary">
            {text.reset.check}{' '}
            <Text role="control" size="sm" color="primary">
              {address.trim()}
            </Text>{' '}
            {text.reset.openIt}
          </Text>

          <InlineAlert
            tone="info"
            title={text.reset.onChangeTitle}
            message={text.reset.onChangeBody}
          />

          <Button label={text.reset.understood} onPress={onDismiss} />
        </View>
      ) : (
        <View style={styles.stack}>
          <Text role="body" size="sm" color="secondary">
            {text.reset.intro}
          </Text>

          <TextField
            label={text.email}
            value={address}
            onChangeText={setAddress}
            placeholder={text.emailPlaceholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            editable={!submitting}
          />

          {failure ? <InlineAlert message={failure} /> : null}

          <Button
            label={text.reset.send}
            loading={submitting}
            disabled={submitting}
            onPress={() => {
              void submit()
            }}
          />
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
})

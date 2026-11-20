/**
 * `PF-E18` · Contraseña, with `PF-E18b` and `PF-E18c` (TECH-325, `OP-IDN-066`, `HU-SP-005`).
 *
 * The current password first, because the change needs it (criterion 1), then the new
 * one with its four rules lighting as it grows. «Cambiar contraseña» waits for all of
 * them. A wrong current password and a new one WorkOS refuses land on their own field;
 * waiting and a lost connection say so above the button.
 *
 * Done, the screen says so in place rather than going back: the other sessions close in
 * the background and this one stays (criterion 2), which is worth reading once.
 *
 * **Both fields are the design system's own**: «Mostrar» is the field's `trailing` word,
 * its error sits under it, and the four rules are a `RequirementList`.
 */

import { Button } from '@allfitone/react-native/button'
import { Screen } from '@allfitone/react-native/screen'
import { RequirementList } from '@allfitone/react-native/requirement-list'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import {
  canChangePassword,
  passwordChecks,
  passwordFailure,
  PASSWORD_RULES,
  type PasswordFailure,
} from '../client/password-form'
import { changePassword } from '../client/profile-transport'
import { EditHeader, EditScreen } from './edit-screen'
import { Ring } from './email-change-progress'
import { Note } from '@allfitone/react-native/note'

export interface PasswordSources {
  readonly changePassword: (current: string, next: string) => Promise<void>
}

export const LIVE_PASSWORD: PasswordSources = { changePassword }

export function PasswordEditScreen({ sources }: { readonly sources: PasswordSources }) {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<PasswordFailure | undefined>(undefined)
  const [done, setDone] = useState(false)
  const checks = passwordChecks(current, next)

  const change = async () => {
    setSaving(true)
    setFailure(undefined)
    try {
      await sources.changePassword(current, next)
      setDone(true)
    } catch (cause) {
      setFailure(passwordFailure(cause))
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EditHeader title="Contraseña" />
        <View style={styles.grow}>
          <ScrollView contentContainerStyle={styles.done} showsVerticalScrollIndicator={false}>
            <Ring done />
            <View style={styles.words} accessibilityLiveRegion="polite">
              <Text role="display" size="3xl" align="center" accessibilityRole="header">
                TU CONTRASEÑA CAMBIÓ
              </Text>
              <Text role="body" size="sm" color="secondary" align="center">
                La próxima vez que entres, usa la nueva. Cerramos tus sesiones en otros teléfonos y
                te avisamos por correo.
              </Text>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Button label="Listo" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <EditScreen
      title="Contraseña"
      subtitle="Para cambiarla necesitamos la actual. Así nadie más puede hacerlo desde tu teléfono."
      failure={failure && !failure.field ? failure.message : undefined}
      saving={saving}
      saveLabel="Cambiar contraseña"
      canSave={canChangePassword(current, next)}
      onSave={() => void change()}
    >
      <PasswordField
        label="Contraseña actual"
        value={current}
        onChange={(typed) => {
          setCurrent(typed)
          if (failure?.field === 'current') setFailure(undefined)
        }}
        autoComplete="current-password"
        error={failure?.field === 'current' ? failure.message : undefined}
      />
      <PasswordField
        label="Contraseña nueva"
        value={next}
        onChange={(typed) => {
          setNext(typed)
          if (failure?.field === 'next') setFailure(undefined)
        }}
        autoComplete="new-password"
        error={failure?.field === 'next' ? failure.message : undefined}
      />
      <RequirementList
        requirements={PASSWORD_RULES.map(({ rule, label }) => ({ label, met: checks[rule] }))}
      />
      <Note>
        Al cambiarla cerramos tus sesiones en otros teléfonos. En este sigues dentro, y te avisamos
        por correo.
      </Note>
    </EditScreen>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (typed: string) => void
  readonly autoComplete: 'current-password' | 'new-password'
  readonly error: string | undefined
}) {
  const [shown, setShown] = useState(false)
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChange}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
      {...(error === undefined ? {} : { error })}
      trailing={{
        label: shown ? 'Ocultar' : 'Mostrar',
        accessibilityLabel: `${shown ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`,
        onPress: () => setShown((was) => !was),
      }}
    />
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  done: { alignItems: 'center', gap: 22, paddingTop: 36, paddingBottom: 32 },
  words: { gap: 10, maxWidth: 320 },
  footer: { paddingTop: 12, paddingBottom: 8 },
})

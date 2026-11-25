/**
 * `NT-4` · ¿Te avisamos en el teléfono? — the ask before the phone's own prompt.
 * HU-SP-078, ADR-054, `OP-IDN-072`.
 *
 * The system prompt can be shown once; a refusal there is final until she goes to the
 * phone's settings. So the app explains first what push carries — and that it never
 * carries her data — and shows the prompt only when she presses «Activar avisos».
 * «Ahora no» asks nothing and closes.
 *
 * **A build that cannot get a push token says so before anything is pressed.** Without
 * an EAS project id there is no token to ask for; the screen tells her push is not here
 * yet, keeps «Activar avisos» off and leaves the rest of the app as it was. Everything
 * still reaches her in «Avisos» and by email.
 */

import { Button } from '@allfitone/react-native/button'
import { HeroMark } from '@allfitone/react-native/hero-mark'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert, type InlineAlertTone } from '@allfitone/react-native/inline-alert'
import { Note, NoteGroup } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { PushOutcome } from '../../src/client/push'
import { spacePush } from '../../src/client/push-transport'
import { useText } from '../../src/i18n/use-text'

export default function PushPermission() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const t = useText().notices.push
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<PushOutcome | undefined>(
    spacePush.supported ? undefined : 'unavailable',
  )

  const activate = async () => {
    setBusy(true)
    try {
      const answer = await spacePush.enable()
      if (answer === 'registered') {
        router.back()
        return
      }
      setOutcome(answer)
    } finally {
      setBusy(false)
    }
  }

  const alert: { message: string; tone: InlineAlertTone } | undefined =
    outcome === 'unavailable'
      ? { message: t.unavailable, tone: 'info' }
      : outcome === 'denied'
        ? { message: t.denied, tone: 'warning' }
        : outcome === 'failed'
          ? { message: t.failed, tone: 'danger' }
          : undefined

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="close" accessibilityLabel={t.close} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HeroMark icon="notification" />
        <View style={styles.heading}>
          <Text role="control" size="2xl" align="center" accessibilityRole="header">
            {t.title}
          </Text>
          <Text role="body" size="sm" color="secondary" align="center">
            {t.subtitle}
          </Text>
        </View>

        <NoteGroup>
          <Note size="md" icon="time" accent>
            {t.reasons.rest}
          </Note>
          <Note size="md" icon="organization" accent>
            {t.reasons.gym}
          </Note>
          <Note size="md" icon="permissions" accent>
            {t.reasons.security}
          </Note>
        </NoteGroup>

        <Text role="body" size="xs" color="muted" align="center">
          {t.footnote}
        </Text>

        {alert ? <InlineAlert message={alert.message} tone={alert.tone} /> : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={t.activate}
          loading={busy}
          disabled={busy || outcome === 'unavailable' || outcome === 'denied'}
          onPress={() => void activate()}
        />
        <Button label={t.notNow} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  content: { paddingHorizontal: 24, gap: 22, paddingTop: 24 },
  heading: { gap: 8 },
  actions: { paddingHorizontal: 24, gap: 12, paddingTop: 12 },
})

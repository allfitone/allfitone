/**
 * `PF-13` · Avisos — which channel carries each kind of notice. HU-SP-078, ADR-054,
 * `OP-IDN-023`/`OP-IDN-024`.
 *
 * Six kinds by push and email on the design system's `SwitchTable`, without SMS
 * (ADR-050). The server says which pairs can move: security stays on, email waits for a
 * verified address, push for a phone of hers registered for it. Turning a channel off
 * never stops anything — every notice is still in «Avisos» — and no gym sees or changes
 * any of this.
 *
 * **A switch moves at once and comes back if the save fails.** Each press sends the whole
 * set with that one pair changed; the answer replaces what is drawn. A refusal draws the
 * set as it was and says why. While one save travels the table takes no other press, so
 * two changes never race each other's whole set.
 *
 * Push needs this phone first. Until a phone of hers is registered the push column is
 * off whole, and a row under the table opens `NT-4` to ask the phone — or to say this
 * build cannot receive push yet. Coming back, the set is read again so the column lights.
 */

import { ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { SwitchTable } from '@allfitone/react-native/switch-table'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  canChange,
  channelChoices,
  channelTable,
  isCategory,
  pushAvailable,
  withChoice,
  type Channel,
  type ChannelPreference,
} from '../../src/client/notification-channels'
import { preferenceFailure } from '../../src/client/preferences'
import { channelsApi } from '../../src/client/preferences-transport'
import { useText } from '../../src/i18n/use-text'

export default function NotificationChannels() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const text = useText()
  const t = text.preferences.channels
  const [held, setHeld] = useState<readonly ChannelPreference[] | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      let active = true
      channelsApi
        .read()
        .then((read) => {
          if (!active) return
          setHeld(read)
          setFailure(undefined)
        })
        .catch(() => active && setFailure(t.unreadable))
      return () => {
        active = false
      }
    }, [t.unreadable]),
  )

  const change = async (rowKey: string, channel: Channel, enabled: boolean) => {
    if (!held || saving || !isCategory(rowKey) || !canChange(held, rowKey, channel)) return
    const before = held
    setSaving(true)
    setFailure(undefined)
    setHeld(withChoice(before, rowKey, channel, enabled))
    try {
      setHeld(await channelsApi.save(channelChoices(before, rowKey, channel, enabled)))
    } catch (cause) {
      setHeld(before)
      setFailure(preferenceFailure(cause, text.preferences))
    } finally {
      setSaving(false)
    }
  }

  const table = held ? channelTable(held, t) : undefined

  return (
    <Screen edges={['top']} padded={false}>
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

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text role="body" size="sm" color="secondary">
          {t.intro}
        </Text>

        {failure ? <InlineAlert message={failure} /> : null}

        {table ? (
          <SwitchTable
            columns={table.columns}
            rows={table.rows}
            onChange={(rowKey, channel, value) => void change(rowKey, channel, value)}
            testID="channels"
          />
        ) : null}

        {held && !pushAvailable(held) ? (
          <ContentRow
            icon="notification"
            tone="outlined"
            name={t.enablePush.title}
            caption={t.enablePush.caption}
            trailing={{ kind: 'chevron' }}
            onPress={() => router.push('/notices/push')}
          />
        ) : null}

        <Note>{t.note}</Note>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 18,
  },
  content: { paddingHorizontal: 24, gap: 18 },
})

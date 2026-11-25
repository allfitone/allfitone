/**
 * `PF-9` · Historia de una relación — HU-SP-019, HU-SP-095.
 *
 * What happened between her and the gym, newest first, as she would say it. The record
 * is append-only, and a reason the gym declares on ending it is never shown here.
 *
 * Ending it is hers to do (OP-REL-007). It freezes what the gym could see up to today and
 * stops anything new reaching them, so it asks first in a sheet.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { ContentRow } from '@allfitone/react-native/content-row'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { historyLine } from '../../src/client/gym-affiliation'
import {
  gyms,
  type HistoryPage,
  type MyRelationship,
} from '../../src/client/gym-affiliation-transport'
import { shortDate } from '../../src/client/pro'
import { GymMark, RowCard } from '../../src/components/gym-ui'
import type { IconName } from '@allfitone/icons'
import { useLocale, useText } from '../../src/i18n/use-text'

const EVENT_ICON: Record<string, IconName> = {
  relationship_started: 'check',
  holder_assigned: 'person',
  holder_ended: 'person',
  substitution_proposed: 'people',
  substitution_accepted: 'people',
  substitution_ended: 'people',
  consent_decided: 'permissions',
  relationship_ended: 'close',
  grant_revoked: 'locked',
}

export default function RelationshipHistory() {
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const text = useText()
  const locale = useLocale()
  const words = text.gyms.relationship
  const { relationshipId } = useLocalSearchParams<{ relationshipId: string }>()
  const [relationship, setRelationship] = useState<MyRelationship | undefined>()
  const [events, setEvents] = useState<HistoryPage['data']>([])
  const [asking, setAsking] = useState(false)
  const [ending, setEnding] = useState(false)
  const [failure, setFailure] = useState<'loadFailed' | 'endFailed' | undefined>(undefined)

  const load = useCallback(async () => {
    const [page, history] = await Promise.all([gyms.list(), gyms.history(relationshipId)])
    setRelationship(page.data.find((item) => item.relationship_id === relationshipId))
    setEvents(history.data)
  }, [relationshipId])

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setFailure('loadFailed'))
    }, [load]),
  )

  const end = async () => {
    setEnding(true)
    setFailure(undefined)
    try {
      await gyms.end(relationshipId)
      setAsking(false)
      await load()
    } catch {
      setAsking(false)
      setFailure('endFailed')
    } finally {
      setEnding(false)
    }
  }

  const name = relationship?.organization_name ?? ''
  const active = relationship?.status === 'active'

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header" numberOfLines={1}>
          {name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {failure ? <InlineAlert message={words[failure]} /> : null}
        {relationship ? (
          <View style={styles.summary}>
            <GymMark name={name} />
            <View style={styles.grow}>
              <Text role="control" size="lg">
                {active
                  ? words.activeSince(shortDate(relationship.started_at, locale))
                  : words.endedOn(
                      shortDate(relationship.ended_at ?? relationship.started_at, locale),
                    )}
              </Text>
              <Text role="body" size="xs" color="muted">
                {active
                  ? relationship.holder_name
                    ? words.yourCoach(relationship.holder_name)
                    : text.gyms.noCoach
                  : words.seesNothingNew}
              </Text>
            </View>
          </View>
        ) : null}

        {events.length > 0 ? (
          <View style={styles.section}>
            <Text role="control" size="sm" color="muted">
              {words.whatHappened}
            </Text>
            <RowCard>
              {events.map((event, index) => (
                <ContentRow
                  key={`${event.type}-${event.source_id}-${String(index)}`}
                  icon={EVENT_ICON[event.type] ?? 'history'}
                  iconTone="quiet"
                  name={historyLine(event)}
                  caption={shortDate(event.occurred_at, locale)}
                />
              ))}
            </RowCard>
          </View>
        ) : null}

        <Note>{words.note}</Note>
      </ScrollView>

      {active ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 14, backgroundColor: theme.color.background.canvas },
          ]}
        >
          <Button label={words.end} variant="danger" onPress={() => setAsking(true)} />
        </View>
      ) : null}

      <Sheet visible={asking} onDismiss={() => setAsking(false)} title={words.endWith(name)}>
        <View style={styles.sheet}>
          <Text role="body" size="sm" color="secondary">
            {words.endBody}
          </Text>
          <Button label={words.end} variant="danger" loading={ending} onPress={() => void end()} />
          <Button label={words.stay} variant="secondary" onPress={() => setAsking(false)} />
        </View>
      </Sheet>
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
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  section: { gap: 8 },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  sheet: { gap: 12 },
})

/**
 * `NT-1` · Avisos, and `NT-2` · Estás al día — HU-SP-091, ADR-054.
 *
 * Every notice kept for her, whatever her channels say, newest first. What waits on her
 * decision is grouped first under «Esperan tu decisión», and the rest under «Para que
 * sepas»; the segmented control keeps only the first. Each row opens where it is
 * resolved, and opening it marks it read (`OP-IDN-075`): reading decides nothing, so an
 * invitation read but not answered still waits.
 *
 * The gear opens `PF-13`, where she chooses the channel for each kind. With nothing kept
 * at all the screen is `NT-2`, which says what will arrive here. The line at the foot is
 * the promise of HU-SP-091 criterion 4: a notice never carries her data.
 */

import { Button } from '@allfitone/react-native/button'
import { ContentGroup } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { SegmentedControl } from '@allfitone/react-native/segmented-control'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  appendNotices,
  groupNotices,
  noticeDestination,
  replaceNotice,
  type Notice,
  type NoticeFilter,
} from '../../src/client/notices'
import { noticesApi } from '../../src/client/notices-transport'
import { deviceTimezone } from '../../src/client/timezone'
import { GroupLabel, HeroMark, NoticeRow } from '../../src/components/notices-ui'
import { useText } from '../../src/i18n/use-text'

interface Held {
  readonly items: readonly Notice[]
  readonly cursor: string | null
}

export default function Notices() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const text = useText()
  const t = text.notices
  const timeZone = useMemo(() => deviceTimezone(), [])
  const [filter, setFilter] = useState<NoticeFilter>('all')
  const [held, setHeld] = useState<Held | undefined>(undefined)
  /** Kept apart from the list so the control keeps its count while a filter loads. */
  const [awaiting, setAwaiting] = useState<number | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /** Which listing is current: an answer to an older one is dropped, not drawn. */
  const asked = useRef(0)

  const load = useCallback(
    (which: NoticeFilter) => {
      const ask = ++asked.current
      noticesApi
        .list(which)
        .then((page) => {
          if (ask !== asked.current) return
          setFailure(undefined)
          setHeld({ items: page.items, cursor: page.next_cursor })
          setAwaiting(page.awaiting_count)
        })
        .catch(() => {
          if (ask === asked.current) setFailure(t.unreadable)
        })
    },
    [t.unreadable],
  )

  // Coming back from where a notice was resolved, it may no longer await.
  useFocusEffect(
    useCallback(() => {
      load(filter)
    }, [filter, load]),
  )

  const more = () => {
    if (!held?.cursor) return
    const ask = asked.current
    setLoadingMore(true)
    noticesApi
      .list(filter, held.cursor)
      .then((page) => {
        if (ask !== asked.current) return
        setHeld((before) =>
          before
            ? { items: appendNotices(before.items, page.items), cursor: page.next_cursor }
            : before,
        )
        setAwaiting(page.awaiting_count)
      })
      .catch(() => setFailure(t.unreadable))
      .finally(() => setLoadingMore(false))
  }

  const open = (notice: Notice) => {
    if (notice.read_at === null) {
      // Marked in the background: a failure only leaves it unread until next time.
      noticesApi
        .markRead(notice.id)
        .then((read) =>
          setHeld((before) =>
            before ? { ...before, items: replaceNotice(before.items, read) } : before,
          ),
        )
        .catch(() => undefined)
    }
    const destination = noticeDestination(notice)
    if (destination) router.push(destination)
  }

  const now = new Date()
  const groups = held ? groupNotices(held.items) : undefined
  const nothing = held !== undefined && held.items.length === 0
  const row = (notice: Notice) => (
    <NoticeRow
      key={notice.id}
      notice={notice}
      now={now}
      timeZone={timeZone}
      onPress={() => open(notice)}
    />
  )

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.grow}>
          {t.title}
        </Text>
        <IconButton
          icon="settings"
          accessibilityLabel={t.channels}
          onPress={() => router.push('/me/notifications')}
        />
      </View>

      {nothing && filter === 'all' ? (
        <View style={[styles.empty, { paddingBottom: insets.bottom + 24 }]}>
          {failure ? <InlineAlert message={failure} /> : null}
          <View style={styles.emptyBody}>
            <HeroMark icon="notification" />
            <Text role="control" size="xl" align="center">
              {t.empty.title}
            </Text>
            <Text role="body" size="sm" color="secondary" align="center">
              {t.empty.body}
            </Text>
          </View>
          <Note icon="locked">{t.privacy}</Note>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <SegmentedControl
            items={[
              { value: 'all', label: t.filter.all },
              { value: 'awaiting', label: t.filter.awaiting(awaiting ?? 0) },
            ]}
            value={filter}
            onChange={(next) => {
              setFilter(next === 'awaiting' ? 'awaiting' : 'all')
              setHeld(undefined)
            }}
            accessibilityLabel={t.filter.label}
          />

          {failure ? <InlineAlert message={failure} /> : null}

          {nothing ? (
            <Text role="body" size="sm" color="muted" align="center">
              {t.empty.awaiting}
            </Text>
          ) : null}

          {groups && groups.awaiting.length > 0 ? (
            <View style={styles.group}>
              <GroupLabel label={t.groups.awaiting} count={awaiting} />
              <ContentGroup>{groups.awaiting.map(row)}</ContentGroup>
            </View>
          ) : null}

          {groups && groups.informational.length > 0 ? (
            <View style={styles.group}>
              <GroupLabel label={t.groups.informational} />
              <ContentGroup>{groups.informational.map(row)}</ContentGroup>
            </View>
          ) : null}

          {held?.cursor ? (
            <Button
              label={t.more}
              variant="secondary"
              size="sm"
              loading={loadingMore}
              disabled={loadingMore}
              onPress={more}
            />
          ) : null}

          {held && !nothing ? <Note icon="locked">{t.privacy}</Note> : null}
        </ScrollView>
      )}
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
  grow: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 22 },
  group: { gap: 10 },
  empty: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  emptyBody: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 12 },
})

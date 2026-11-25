/**
 * The pieces «Avisos» is built from: the bell on Hoy, a notice's row, the mark at the
 * top of `NT-2` and `NT-4`, and a group's label with its count.
 *
 * **A notice's row is the design system's `ContentRow`.** `NT-1` draws more than it
 * offers today — an unread dot, «Vence en» in the warning ink and a «Decidir» button at
 * the end — so the row says the same with what exists: the tinted glyph per kind, the
 * time line lit in the accent while unread, «Vence en» inside that line, and the action
 * word as a tonal badge on a row that is itself the target. The gap is reported, not
 * hand-built around.
 *
 * **The bell's dot and the large mark are drawn here from theme tokens**, because the
 * design system has neither an icon button with a dot nor an empty-state mark. Both are
 * reported as gaps; each is a few lines that go when the component exists.
 */

import { ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon, type IconName } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  bellHasDot,
  noticeLabel,
  noticeLook,
  noticeMeta,
  noticeWords,
  type Notice,
} from '../client/notices'
import { noticesApi } from '../client/notices-transport'
import { useText } from '../i18n/use-text'

/** The bell on Hoy: opens «Avisos», with a dot while something awaits her decision. */
export function NoticesBell() {
  const router = useRouter()
  const theme = useTheme()
  const text = useText()
  const [awaiting, setAwaiting] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let active = true
      // A bell that cannot ask stays without its dot; the inbox says why when opened.
      noticesApi
        .list('awaiting')
        .then((page) => active && setAwaiting(page.awaiting_count))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  return (
    <View>
      <IconButton
        icon="notification"
        accessibilityLabel={text.notices.bell(awaiting)}
        onPress={() => router.push('/notices')}
      />
      {bellHasDot({ awaiting_count: awaiting }) ? (
        <View
          pointerEvents="none"
          style={[
            styles.dot,
            {
              backgroundColor: theme.color.icon.accent,
              borderColor: theme.color.background.canvas,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

/** One notice on the design system's row: its words, when, and what pressing does. */
export function NoticeRow({
  notice,
  now,
  timeZone,
  onPress,
}: {
  readonly notice: Notice
  readonly now: Date
  readonly timeZone: string
  readonly onPress: () => void
}) {
  const text = useText()
  const look = noticeLook(notice.kind)
  const words = noticeWords(notice, text.notices)
  const meta = noticeMeta(notice, now, timeZone, text.notices, text.common.months)
  const unread = notice.read_at === null
  return (
    <ContentRow
      icon={look.icon}
      iconTone={look.tone}
      name={words.title}
      caption={words.line}
      note={meta}
      noteTone={unread ? 'accent' : 'quiet'}
      trailing={
        words.action
          ? {
              kind: 'badge',
              label: words.action,
              tone: 'accent',
              variant: 'tonal',
              uppercase: false,
            }
          : { kind: 'chevron' }
      }
      accessibilityLabel={noticeLabel(words, meta, unread, text.notices)}
      onPress={onPress}
    />
  )
}

/** A group's name and, when it counts something, the count in the accent. */
export function GroupLabel({
  label,
  count,
}: {
  readonly label: string
  readonly count?: number | undefined
}) {
  return (
    <View style={styles.groupLabel}>
      <Text role="control" size="sm" color="muted" accessibilityRole="header">
        {label}
      </Text>
      {count === undefined ? null : (
        <Text role="control" size="sm" color="accent">
          {String(count)}
        </Text>
      )}
    </View>
  )
}

/** The large mark on a tonal tile that opens `NT-2` and `NT-4`. */
export function HeroMark({ icon }: { readonly icon: IconName }) {
  const theme = useTheme()
  return (
    <View
      style={[
        styles.mark,
        {
          backgroundColor: theme.color.accent.tonal,
          borderColor: theme.color.accent.tonalBorder,
        },
      ]}
    >
      <FoundationIcon name={icon} size="lg" color={theme.color.icon.accent} decorative />
    </View>
  )
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  groupLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mark: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
})

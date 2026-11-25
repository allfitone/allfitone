/**
 * The pieces «Avisos» is built from: the bell on Hoy, a notice's row and a group's label
 * with its count.
 *
 * **A notice's row is the design system's `ContentRow`** as the notice row it offers:
 * the tinted glyph per kind, the accent dot and «Sin leer» while unread, the time quiet
 * beside «Vence en» in warning, and «Ver», «Decidir» or «Revisar» as the neutral pill.
 * An opening row never reads its note, so the deadline travels in its label.
 *
 * **The bell is the design system's `IconButton` with its `dot`.** The dot is drawn only,
 * so the label says what awaits. The group's label stays here: the design system has no
 * section header that carries a count.
 */

import { ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  bellHasDot,
  noticeLabel,
  noticeLook,
  noticeMeta,
  noticeNote,
  noticeWords,
  type Notice,
} from '../client/notices'
import { noticesApi } from '../client/notices-transport'
import { useText } from '../i18n/use-text'

/** The bell on Hoy: opens «Avisos», with a dot while something awaits her decision. */
export function NoticesBell() {
  const router = useRouter()
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
    <IconButton
      icon="notification"
      dot={bellHasDot({ awaiting_count: awaiting })}
      accessibilityLabel={text.notices.bell(awaiting)}
      onPress={() => router.push('/notices')}
    />
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
  const months = text.common.months
  const unread = notice.read_at === null
  return (
    <ContentRow
      icon={look.icon}
      iconTone={look.tone}
      name={words.title}
      caption={words.line}
      note={noticeNote(notice, now, timeZone, text.notices, months)}
      {...(unread ? { unread: text.notices.unread } : {})}
      trailing={
        words.action
          ? { kind: 'button', label: words.action, variant: 'secondary', onPress }
          : { kind: 'none' }
      }
      accessibilityLabel={noticeLabel(
        words,
        noticeMeta(notice, now, timeZone, text.notices, months),
      )}
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

const styles = StyleSheet.create({
  groupLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})

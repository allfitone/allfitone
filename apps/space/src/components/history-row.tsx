/**
 * A finished session as the history shows it (H-2 on Hoy, H-6 on its own screen).
 *
 * One component for both because the two must never disagree about what a session
 * looks like: the row on Hoy is the same row the full history scrolls through. It is
 * the design system's `ContentRow`, with the date as its end and the name as a poster.
 *
 * **The thumbnail is the routine's cover**, the photograph Hoy and the share card show
 * for it, so a session looks the same wherever it appears. A trophy sits on its corner
 * when the session set a record. A free session has no routine and shows the bolt the
 * free-training offer uses, so the two read as the same thing.
 *
 * **Ready for what has no data yet.** A session hidden from a gym and a coach's note
 * (ADR-037) take a `tag` beside the name and an `extra` line in muted ink; nothing sends
 * them today, and when something does, the row already knows where they go.
 */

import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { FoundationIcon, type IconName } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { dayParts, historyDetail, recordsLine, type HistoryItem } from '../client/history'

export interface HistoryTag {
  readonly label: string
  readonly icon?: IconName
}

/** The box a week's sessions sit in: the design system's grouped card, which rules them. */
export function HistoryPanel({ children }: { readonly children: ReactNode }) {
  return <ContentGroup>{children}</ContentGroup>
}

/** «SEMANA PASADA» on the left and, when it says something, «2 de 3» on the right. */
export function HistoryGroupHeader({
  label,
  tally,
  tallyAccent = false,
}: {
  readonly label: string
  readonly tally?: string
  readonly tallyAccent?: boolean
}) {
  return (
    <View style={styles.groupHeader} accessibilityRole="header">
      <Text role="eyebrow" size="xs" color="muted" uppercase>
        {label}
      </Text>
      {tally ? (
        <Text role="control" size="xs" color={tallyAccent ? 'accent' : 'secondary'}>
          {tally}
        </Text>
      ) : null}
    </View>
  )
}

export function HistoryRow({
  item,
  tag,
  extra,
  onPress,
}: {
  readonly item: HistoryItem
  readonly tag?: HistoryTag
  readonly extra?: string
  /** Opens the session's detail (FIN-18). */
  readonly onPress?: () => void
}) {
  const theme = useTheme()
  const { weekday, day } = dayParts(item.trained_on)
  const records = recordsLine(item.record_count)
  const name = item.title ?? (item.is_free ? 'Entreno libre' : 'Sesión')
  const detail = historyDetail(item)
  const below = records ?? extra

  return (
    <ContentRow
      name={name}
      nameStyle="poster"
      caption={detail}
      {...(below === undefined ? {} : { note: below, noteTone: records ? 'accent' : 'quiet' })}
      {...(tag === undefined ? {} : { tag: tag.label, tagTone: 'neutral' })}
      preview={
        <View style={[styles.thumb, { backgroundColor: theme.color.background.surfaceMuted }]}>
          {item.thumbnail_url ? (
            <Image source={item.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <FoundationIcon
              name={item.is_free ? 'freestyle' : 'training'}
              customSize={22}
              color={theme.color.icon.accent}
              decorative
            />
          )}
        </View>
      }
      {...(item.record_count > 0 ? { previewMark: 'record' as const } : {})}
      trailing={{ kind: 'date', weekday, day }}
      accessibilityLabel={[name, detail, below, `${weekday} ${day}`].filter(Boolean).join(', ')}
      {...(onPress === undefined ? {} : { onPress })}
    />
  )
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  thumb: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
})

/**
 * `NT-6` · Correcciones — HU-SP-062.
 *
 * Every correction a professional proposed to her: the ones waiting on her first, soonest
 * to expire on top, then the ones that ended. A proposal cancelled because the
 * relationship ended stays here as cancelled (criterion 2): nothing disappears from her
 * own record of who asked to change what. Each row opens «Corrección propuesta» (`NT-5`).
 */

import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  correctionSections,
  proposalCaption,
  proposalTitle,
  setOf,
  statusBadge,
  statusOf,
  type CorrectionProposal,
} from '../../src/client/corrections'
import { corrections } from '../../src/client/corrections-transport'
import type { FinishedExecution } from '../../src/client/execution'
import { deviceTimezone } from '../../src/client/timezone'
import { SectionLabel } from '../../src/components/pro-ui'
import { useText } from '../../src/i18n/use-text'

interface Read {
  readonly proposals: readonly CorrectionProposal[]
  readonly sessions: ReadonlyMap<string, FinishedExecution>
  readonly at: Date
}

export default function CorrectionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const text = useText()
  const t = text.corrections
  const timeZone = deviceTimezone()
  const [read, setRead] = useState<Read | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)

  // Read again on every return: a decision taken on NT-5 moves its row to «Decididas».
  useFocusEffect(
    useCallback(() => {
      let active = true
      corrections
        .list()
        .then(async (proposals) => {
          const sessions = await corrections.sessions(
            proposals.map((one) => one.execution_id),
            timeZone,
          )
          if (!active) return
          setRead({ proposals, sessions, at: new Date() })
          setUnreadable(false)
        })
        .catch(() => active && setUnreadable(true))
      return () => {
        active = false
      }
    }, [timeZone]),
  )

  const sections = read ? correctionSections(read.proposals, read.at) : undefined

  const row = (proposal: CorrectionProposal, now: Date) => {
    const badge = statusBadge(statusOf(proposal, now), t)
    const number = setOf(read?.sessions.get(proposal.execution_id), proposal.set_order)?.number
    return (
      <ContentRow
        key={proposal.id}
        name={proposalTitle(proposal, number, t)}
        caption={proposalCaption(proposal, now, timeZone, t, text.common.months)}
        trailing={{
          kind: 'badge',
          label: badge.label,
          tone: badge.tone,
          variant: 'tonal',
          uppercase: false,
          dot: true,
        }}
        onPress={() =>
          router.push({
            pathname: '/corrections/[proposalId]',
            params: { proposalId: proposal.id },
          })
        }
      />
    )
  }

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
        {unreadable ? <InlineAlert message={t.unreadable} /> : null}

        {read && sections ? (
          <>
            {sections.pending.length > 0 ? (
              <View style={styles.section}>
                <SectionLabel>{t.sections.pending}</SectionLabel>
                <ContentGroup>{sections.pending.map((one) => row(one, read.at))}</ContentGroup>
              </View>
            ) : null}

            {sections.decided.length > 0 ? (
              <View style={styles.section}>
                <SectionLabel>{t.sections.decided}</SectionLabel>
                <ContentGroup>{sections.decided.map((one) => row(one, read.at))}</ContentGroup>
              </View>
            ) : null}

            {read.proposals.length === 0 ? (
              <Text role="body" size="sm" color="secondary">
                {t.empty}
              </Text>
            ) : null}

            <Note>{t.cancelledStays}</Note>
          </>
        ) : null}
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
  section: { gap: 8 },
})

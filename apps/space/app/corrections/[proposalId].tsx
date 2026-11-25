/**
 * `NT-5` · Corrección propuesta — HU-SP-063.
 *
 * One correction a professional proposes to a set of hers: who proposes it, what she
 * logged against what they propose, and why. **Nothing changes until she accepts**
 * (criterion 1), and the screen says so before she decides; accepting keeps her original
 * with who proposed it and why (criterion 2), and the datum stays hers (criterion 3).
 *
 * Silence is never acceptance (criterion 4): a proposal past its thirty days, cancelled
 * or already decided shows what became of it where the buttons were (criterion 5). If
 * the server answers that it moved on while she looked, it is read again and shown as
 * it now is. Reached from «Correcciones», from the session it points at, and from a
 * notice in the inbox, all by its id.
 */

import { Badge } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Monogram } from '@allfitone/react-native/monogram'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { CommandHeaders } from '@allfitone/contracts/commands'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  comparison,
  contextLine,
  decisionFailure,
  decisionMovedOn,
  expiryLabel,
  findProposal,
  outcomeLine,
  proposedWhen,
  setOf,
  statusBadge,
  statusOf,
  type CorrectionDecision,
  type CorrectionProposal,
} from '../../src/client/corrections'
import { corrections } from '../../src/client/corrections-transport'
import type { FinishedExecution } from '../../src/client/execution'
import { deviceTimezone } from '../../src/client/timezone'
import { useLocale, useText } from '../../src/i18n/use-text'
import { useUnits } from '../../src/units/use-units'

export default function CorrectionProposalScreen() {
  const { proposalId } = useLocalSearchParams<{ proposalId: string }>()
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const text = useText()
  const t = text.corrections
  const locale = useLocale()
  const units = useUnits()
  const timeZone = deviceTimezone()

  const [proposal, setProposal] = useState<CorrectionProposal | undefined>(undefined)
  const [detail, setDetail] = useState<FinishedExecution | undefined>(undefined)
  const [now, setNow] = useState(() => new Date())
  const [gone, setGone] = useState(false)
  const [unreadable, setUnreadable] = useState(false)
  const [deciding, setDeciding] = useState<CorrectionDecision | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // The headers of a press still unanswered: pressing again replays it, never decides twice.
  const sent = useRef<Partial<Record<CorrectionDecision, CommandHeaders>>>({})

  const load = useCallback(async () => {
    const found = findProposal(await corrections.list(), proposalId)
    setNow(new Date())
    setUnreadable(false)
    if (!found) {
      setGone(true)
      return
    }
    setProposal(found)
    const sessions = await corrections.sessions([found.execution_id], timeZone)
    setDetail(sessions.get(found.execution_id))
  }, [proposalId, timeZone])

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setUnreadable(true))
    }, [load]),
  )

  const decide = async (decision: CorrectionDecision) => {
    const command = (sent.current[decision] ??= corrections.command())
    setDeciding(decision)
    setFailure(undefined)
    try {
      const decided = await corrections.decide(proposalId, decision, command)
      sent.current = {}
      setNow(new Date())
      setProposal(decided)
    } catch (cause) {
      setFailure(decisionFailure(cause, t))
      if (decisionMovedOn(cause)) {
        sent.current = {}
        await load().catch(() => undefined)
      }
    } finally {
      setDeciding(undefined)
    }
  }

  const status = proposal ? statusOf(proposal, now) : undefined
  const open = status === 'pending'
  const badge =
    proposal && status
      ? open
        ? { label: expiryLabel(proposal, now, timeZone, t), tone: 'warning' as const }
        : statusBadge(status, t)
      : undefined
  const outcome = proposal ? outcomeLine(proposal, now, timeZone, t, text.common.months) : undefined
  const values = proposal
    ? comparison(proposal, setOf(detail, proposal.set_order)?.set, units, locale, t)
    : undefined

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header">
          {t.proposal.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 170 }]}
        showsVerticalScrollIndicator={false}
      >
        {unreadable ? <InlineAlert message={t.unreadable} /> : null}
        {gone ? (
          <Text role="body" size="sm" color="secondary">
            {t.proposal.gone}
          </Text>
        ) : null}
        {!proposal && !gone && !unreadable ? (
          <Text role="body" size="sm" color="muted">
            {t.proposal.opening}
          </Text>
        ) : null}

        {proposal && values && badge ? (
          <>
            <View style={styles.who}>
              <Monogram name={proposal.proposer_name} tone="sport" />
              <View style={styles.grow}>
                <Text role="control" size="lg">
                  {t.proposal.proposes(proposal.proposer_name)}
                </Text>
                <Text role="body" size="xs" color="muted">
                  {`${t.proposal.coachAt(proposal.organization_name)} · ${proposedWhen(proposal, now, timeZone, t, text.common.months)}`}
                </Text>
                <Badge
                  label={badge.label}
                  tone={badge.tone}
                  variant="tonal"
                  uppercase={false}
                  dot
                  style={styles.badge}
                />
              </View>
            </View>

            <ContentGroup>
              <View style={styles.block}>
                <Text role="body" size="xs" color="secondary">
                  {contextLine(proposal, detail, timeZone, t, text.common.months)}
                </Text>
              </View>
              <ContentRow
                name={t.proposal.registered}
                value={values.registered}
                valueSize="md"
                valueTone="muted"
              />
              <ContentRow
                icon="forward"
                name={t.proposal.proposed}
                value={values.proposed}
                valueSize="md"
              />
              <View style={styles.block}>
                <Text role="control" size="xs" color="muted">
                  {t.proposal.why}
                </Text>
                <Text role="body" size="sm">
                  {t.proposal.quoted(proposal.reason)}
                </Text>
              </View>
            </ContentGroup>

            <ContentGroup>
              <Note size="md" icon="locked" style={styles.note}>
                {t.proposal.nothingChanges}
              </Note>
              <Note size="md" icon="history" style={styles.note}>
                {t.proposal.originalKept}
              </Note>
            </ContentGroup>
          </>
        ) : null}
      </ScrollView>

      {proposal ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 14, backgroundColor: theme.color.background.canvas },
          ]}
        >
          {failure ? <InlineAlert message={failure} /> : null}
          {open ? (
            <View style={styles.answers}>
              <Button
                label={t.proposal.reject}
                variant="secondary"
                loading={deciding === 'reject'}
                disabled={deciding !== undefined}
                onPress={() => void decide('reject')}
                style={styles.half}
              />
              <Button
                label={t.proposal.accept}
                loading={deciding === 'accept'}
                disabled={deciding !== undefined}
                onPress={() => void decide('accept')}
                style={styles.half}
              />
            </View>
          ) : outcome ? (
            <InlineAlert message={outcome} tone={status === 'accepted' ? 'success' : 'info'} />
          ) : null}
        </View>
      ) : null}
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
  content: { paddingHorizontal: 24, gap: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 2 },
  badge: { alignSelf: 'flex-start', marginTop: 4 },
  block: { paddingVertical: 14, gap: 4 },
  note: { paddingVertical: 12 },
  answers: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 10,
  },
})

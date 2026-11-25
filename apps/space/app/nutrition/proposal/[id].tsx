/**
 * Una meta que propone un profesional (N-3b, HU-SP-072, HU-SP-074, ADR-027).
 *
 * Who proposes it and why, then each nutrient now against what is proposed: the goal kept
 * as an outline, the proposal filled in. Nobody decides for the person: accepting makes
 * it the active goal and keeps the current one in the history; rejecting changes nothing.
 */

import { Button } from '@allfitone/react-native/button'
import { ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { withAlpha } from '@allfitone/react-native/tokens'
import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import {
  compareTarget,
  goalValue,
  NUTRIENTS,
  unchangedTarget,
  type GoalTarget,
  type GoalVersion,
} from '../../../src/client/nutrition'
import { createSpaceNutritionFlow } from '../../../src/client/nutrition-transport'
import { macroColor } from '../../../src/components/nutrition-ui'
import { useLocale, useText } from '../../../src/i18n/use-text'

const percent = (share: number): `${number}%` => `${share * 100}%`
/** Where a target sits on its track, from the larger of the two values. */
function span(target: GoalTarget, top: number): { readonly left: number; readonly width: number } {
  const lowest = target.mode === 'maximum' ? 0 : (target.minimum ?? target.exact ?? 0)
  const highest = target.mode === 'minimum' ? top : (target.maximum ?? target.exact ?? 0)
  const left = Math.min(0.97, lowest / top)
  return { left, width: Math.max(0.03, Math.min(1 - left, (highest - lowest) / top)) }
}

export default function ProposalScreen() {
  const locale = useLocale()
  const { common, nutrition: text } = useText()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const theme = useTheme()
  const flow = useMemo(() => createSpaceNutritionFlow(), [])
  const [proposal, setProposal] = useState<GoalVersion | undefined>(undefined)
  const [active, setActive] = useState<GoalVersion | null>(null)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<'accepted' | 'rejected' | undefined>(undefined)

  useEffect(() => {
    let alive = true
    flow
      .readGoals()
      .then((goals) => {
        if (!alive) return
        setProposal(goals.proposals.find((one) => one.id === id))
        setActive(goals.active)
        if (!goals.proposals.some((one) => one.id === id)) setFailure(text.proposal.readFailed)
      })
      .catch(() => alive && setFailure(text.proposal.readFailed))
    return () => {
      alive = false
    }
  }, [flow, id, text])

  const decide = (decision: 'accepted' | 'rejected') => {
    if (!proposal) return
    setBusy(decision)
    setFailure(undefined)
    flow
      .decideGoal(proposal.id, decision)
      .then(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        router.back()
      })
      .catch(() => setFailure(text.proposal.decideFailed))
      .finally(() => setBusy(undefined))
  }

  if (!proposal) {
    return (
      <Screen edges={['top']}>
        <View style={styles.waiting}>
          {failure ? (
            <InlineAlert message={failure} />
          ) : (
            <ActivityIndicator color={theme.color.icon.accent} />
          )}
        </View>
      </Screen>
    )
  }

  const author = proposal.author as GoalVersion['author'] & {
    display_name?: string
    organization_name?: string | null
  }
  const name = author.display_name ?? text.food.yourProfessional
  const initials = name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const current = (code: GoalTarget['nutrient_code']) =>
    active?.targets.find((one) => one.nutrient_code === code)
  const proposed = (code: GoalTarget['nutrient_code']) =>
    proposal.targets.find((one) => one.nutrient_code === code)
  const shown = NUTRIENTS.filter((code) => current(code) || proposed(code))
  const decided = proposal.status !== 'proposed'
  const since = active ? new Date(active.created_at) : null

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel={common.back} onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.grow}>
          {text.proposal.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: withAlpha(theme.color.icon.accent, 0.08),
              borderColor: withAlpha(theme.color.icon.accent, 1 / 3),
            },
          ]}
        >
          <View style={styles.author}>
            <View style={[styles.avatar, { backgroundColor: theme.color.icon.accent }]}>
              <Text role="control" size="md" color="inverse">
                {initials}
              </Text>
            </View>
            <View style={styles.grow}>
              <Text role="control" size="md">
                {text.food.proposes(name)}
              </Text>
              {author.organization_name ? (
                <Text role="body" size="xs" color="secondary">
                  {text.proposal.from(author.organization_name)}
                </Text>
              ) : null}
            </View>
          </View>
          {proposal.rationale ? (
            <Text role="body" size="md">
              {text.quoted(proposal.rationale)}
            </Text>
          ) : null}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendNow, { borderColor: theme.color.text.secondary }]} />
            <Text role="body" size="xs" color="secondary">
              {text.proposal.now}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendProposed, { backgroundColor: theme.color.icon.accent }]} />
            <Text role="body" size="xs" color="secondary">
              {text.proposal.proposed}
            </Text>
          </View>
        </View>

        {shown.map((code) => {
          const now = current(code)
          const next = proposed(code)
          const top = Math.max(
            1,
            ...[now, next].flatMap((target) => (target ? [goalValue(target) * 1.3] : [])),
          )
          const unchanged = unchangedTarget(now, next)
          return (
            <View key={code} style={styles.nutrient}>
              <View style={styles.nutrientHead}>
                <Text role="control" size="md">
                  {text.nutrients[code]}
                </Text>
                <Text role="control" size="sm" color={unchanged ? 'muted' : 'primary'}>
                  {compareTarget(now, next, locale)}
                </Text>
              </View>
              <View
                style={[styles.track, { backgroundColor: theme.color.background.surfaceMuted }]}
              >
                {next ? (
                  <View
                    style={[
                      styles.proposedBar,
                      {
                        left: percent(span(next, top).left),
                        width: percent(span(next, top).width),
                        backgroundColor: unchanged
                          ? `${macroColor(theme, code)}66`
                          : theme.color.icon.accent,
                      },
                    ]}
                  />
                ) : null}
                {now ? (
                  <View
                    style={[
                      styles.nowBar,
                      {
                        left: percent(span(now, top).left),
                        width: percent(span(now, top).width),
                        borderColor: theme.color.text.secondary,
                      },
                    ]}
                  />
                ) : null}
              </View>
            </View>
          )
        })}

        {failure ? <InlineAlert message={failure} /> : null}

        {decided ? (
          <Text role="body" size="sm" color="muted" align="center">
            {proposal.status === 'active' ? text.proposal.accepted : text.proposal.decided}
          </Text>
        ) : (
          <>
            <View style={styles.actions}>
              <View style={styles.reject}>
                <Button
                  label={text.proposal.reject}
                  variant="secondary"
                  loading={busy === 'rejected'}
                  disabled={busy !== undefined}
                  onPress={() => decide('rejected')}
                />
              </View>
              <View style={styles.grow}>
                <Button
                  label={text.proposal.accept}
                  loading={busy === 'accepted'}
                  disabled={busy !== undefined}
                  onPress={() => decide('accepted')}
                />
              </View>
            </View>
            <Text role="body" size="xs" color="muted" align="center">
              {text.proposal.note}
            </Text>
          </>
        )}

        {active && since ? (
          <ContentRow
            icon="history"
            iconTone="quiet"
            name={active.origin === 'self' ? text.proposal.ownGoal : text.proposal.acceptedGoal}
            caption={text.proposal.since(
              since.getDate(),
              common.months[since.getMonth()] ?? '',
              active.version_number,
            )}
          />
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 2 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  card: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 12 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendNow: { width: 22, height: 10, borderRadius: 5, borderWidth: 1.5 },
  legendProposed: { width: 22, height: 10, borderRadius: 5 },
  nutrient: { gap: 10 },
  nutrientHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
  },
  track: { height: 8, borderRadius: 4 },
  proposedBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  nowBar: { position: 'absolute', top: -5, bottom: -5, borderRadius: 9, borderWidth: 1.5 },
  actions: { flexDirection: 'row', gap: 12, paddingTop: 8 },
  reject: { width: 140 },
})

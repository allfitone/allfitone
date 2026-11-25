/**
 * `Planes de gimnasio` — `OP-PAY-013` and `OP-PAY-015`.
 *
 * What she pays each gym, and the two things she can do about it: look at what a gym she
 * trains at offers, and cancel one she has.
 *
 * **A pause is explained, not just labelled.** "En pausa" on its own is read as having
 * lost everything, so a paused plan says what did not happen: nothing was deleted, the
 * history is intact and the permissions still stand. That sentence is the reason this
 * screen is worth having at all — without it somebody whose gym suspended them has no way
 * to find out they have not lost their data.
 *
 * **Cancelling ends the money and nothing else.** The confirmation says so before it
 * says anything else: her Fitness ID, her history and the permissions she granted are
 * untouched, and cutting the gym's access is a separate decision. Implying otherwise would
 * be telling her something false about her own data.
 *
 * **No card ever reaches this screen.** Allfit does not hold one. Paying happens at the
 * gym's own gateway, which is why subscribing hands back a price and a provider and not a
 * form.
 *
 * **This is not Allfit Pro.** Pro is the platform plan, bought in a store, and it lives
 * under `/pro`. Both are money she spends, so the profile lists them side by side — but
 * cancelling here ends what the gym charges and touches Pro not at all.
 */

import { Button } from '@allfitone/react-native/button'
import { ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ApiError } from '../../src/client/api-error'
import {
  cancelRefusalMessage,
  cancellationExplanation,
  formatPrice,
  pausedExplanation,
  payableRelationships,
  periodLabel,
  statusLabel,
  type MyRelationship,
  type Subscription,
} from '../../src/client/subscriptions'
import { createSpaceSubscriptionFlow } from '../../src/client/subscriptions-transport'
import { useLocale, useText } from '../../src/i18n/use-text'

type Failure = { readonly kind: 'read' } | { readonly kind: 'cancel'; readonly failure: string }

export default function SubscriptionsScreen() {
  const locale = useLocale()
  const text = useText()
  const words = text.plans.gym
  const router = useRouter()
  const theme = useTheme()
  const flow = useMemo(() => createSpaceSubscriptionFlow(), [])

  const [subscriptions, setSubscriptions] = useState<readonly Subscription[]>([])
  const [relationships, setRelationships] = useState<readonly MyRelationship[]>([])
  const [failure, setFailure] = useState<Failure | undefined>(undefined)
  const [cancelling, setCancelling] = useState<Subscription | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let active = true
      Promise.all([flow.readMySubscriptions(), flow.readMyRelationships()])
        .then(([mine, gyms]) => {
          if (!active) return
          setSubscriptions(mine)
          setRelationships(gyms)
          setFailure(undefined)
          setLoaded(true)
        })
        .catch(() => {
          if (!active) return
          setFailure({ kind: 'read' })
          setLoaded(true)
        })
      return () => {
        active = false
      }
    }, [flow]),
  )

  const offerable = payableRelationships(relationships, subscriptions)

  async function confirmCancellation(subscription: Subscription): Promise<void> {
    setBusy(true)
    try {
      await flow.cancel(subscription.subscription_id)
      setSubscriptions((current) =>
        current.filter((one) => one.subscription_id !== subscription.subscription_id),
      )
      setCancelling(undefined)
      setFailure(undefined)
    } catch (cause) {
      setFailure({
        kind: 'cancel',
        failure: cause instanceof ApiError ? cause.failure : 'unavailable',
      })
      setCancelling(undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header" style={styles.grow}>
          {words.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {failure ? (
          <InlineAlert
            message={
              failure.kind === 'read'
                ? words.readFailed
                : cancelRefusalMessage(failure.failure, words)
            }
          />
        ) : null}

        {subscriptions.map((subscription) => (
          <View
            key={subscription.subscription_id}
            style={[
              styles.card,
              {
                backgroundColor: theme.color.background.surface,
                borderColor: theme.color.border.subtle,
              },
            ]}
            testID={`subscription-${subscription.subscription_id}`}
          >
            <Text role="eyebrow" size="2xs" color="muted" uppercase>
              {statusLabel(subscription.status, words)}
            </Text>
            <Text role="control" size="lg">
              {subscription.organization_name}
            </Text>
            <Text role="body" size="sm" color="secondary">
              {subscription.plan_name} ·{' '}
              {formatPrice(subscription.amount_minor, subscription.currency_code, locale)}{' '}
              {periodLabel(subscription.billing_period, words)}
            </Text>

            {/* The sentence this screen exists for. Without it, "En pausa" is read as
                having lost the data she shared. */}
            {subscription.status === 'suspended' ? (
              <View style={styles.paused}>
                <Text role="body" size="sm" color="secondary">
                  {pausedExplanation(subscription.organization_name, words)}
                </Text>
              </View>
            ) : null}

            <Button
              label={words.cancelThis}
              variant="ghost"
              onPress={() => setCancelling(subscription)}
            />
          </View>
        ))}

        {loaded && subscriptions.length === 0 && !failure ? (
          <View style={styles.empty}>
            <Text role="control" size="lg">
              {words.noneTitle}
            </Text>
            <Text role="body" size="sm" color="muted">
              {words.noneBody}
            </Text>
          </View>
        ) : null}

        {offerable.length > 0 ? (
          <View style={styles.section}>
            <Text role="eyebrow" size="2xs" color="muted" uppercase>
              {words.whereYouTrain}
            </Text>
            {offerable.map((gym) => (
              <ContentRow
                key={gym.relationship_id}
                tone="outlined"
                size="sm"
                trailing={{ kind: 'chevron', glyph: 'forward' }}
                name={gym.organization_name}
                accessibilityLabel={words.seePlans(gym.organization_name)}
                onPress={() => router.push(`/subscriptions/${gym.organization_id}`)}
              />
            ))}
          </View>
        ) : null}

        <Text role="body" size="sm" color="muted" style={styles.note}>
          {words.gatewayNote}
        </Text>
      </ScrollView>

      <Sheet
        visible={cancelling !== undefined}
        onDismiss={() => {
          if (busy) return
          setCancelling(undefined)
        }}
        title={cancelling ? words.cancelTitle(cancelling.organization_name) : ''}
      >
        <View style={styles.sheetBody}>
          <Text role="body" size="sm" color="secondary">
            {cancelling ? cancellationExplanation(cancelling.organization_name, words) : ''}
          </Text>
          <Button
            label={words.confirmCancel}
            loading={busy}
            onPress={() => {
              if (cancelling) void confirmCancellation(cancelling)
            }}
          />
          <Button
            label={words.leaveIt}
            variant="ghost"
            onPress={() => {
              if (busy) return
              setCancelling(undefined)
            }}
          />
        </View>
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  grow: { flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 48 },
  card: { gap: 6, borderWidth: 1, borderRadius: 16, padding: 16 },
  paused: { paddingTop: 4 },
  empty: { gap: 6 },
  section: { gap: 8 },
  note: { textAlign: 'center' },
  sheetBody: { gap: 12 },
})

/**
 * The plans one gym offers, and subscribing to one — `OP-PAY-011` and `OP-PAY-012`.
 *
 * **This is not a catalogue of gyms.** Only somebody who already trains here sees
 * anything, and the list comes from the organization she arrived from; there is no search
 * and no discovery, which is a deferred decision rather than a missing screen.
 *
 * **Subscribing grants nobody access to anything.** It is the paying bond and only that —
 * permissions are decided when a relationship is accepted, and nothing here touches them.
 * The confirmation says so, because somebody about to pay a gym that already trains them
 * has no reason to assume the two are separate.
 *
 * **The card is handed to the gym, not to Allfit.** What this screen gets back is the
 * price and which provider, so the next step can be opened against the gym's own gateway.
 * No card field exists here and none ever will.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ApiError } from '../../src/client/api-error'
import {
  formatPrice,
  periodLabel,
  subscribeRefusalFor,
  subscribeRefusalMessage,
  type SubscribeRefusal,
  type MyRelationship,
  type PlanOffer,
} from '../../src/client/subscriptions'
import { createSpaceSubscriptionFlow } from '../../src/client/subscriptions-transport'
import { useLocale, useText } from '../../src/i18n/use-text'

type Failure =
  { readonly kind: 'read' } | { readonly kind: 'subscribe'; readonly refusal: SubscribeRefusal }

export default function OrganizationPlansScreen() {
  const locale = useLocale()
  const text = useText()
  const words = text.plans.gym
  const router = useRouter()
  const theme = useTheme()
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>()
  const flow = useMemo(() => createSpaceSubscriptionFlow(), [])

  const [plans, setPlans] = useState<readonly PlanOffer[]>([])
  const [gym, setGym] = useState<MyRelationship | undefined>(undefined)
  const [failure, setFailure] = useState<Failure | undefined>(undefined)
  const [chosen, setChosen] = useState<PlanOffer | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (!organizationId) return
      let active = true
      /*
       * The gym's name comes from her own relationships rather than from the plan list,
       * which carries no organization. Reading it here keeps the heading honest: a screen
       * titled "Planes" with no gym named is a screen somebody can land on by accident and
       * subscribe from.
       */
      Promise.all([flow.readPlans(organizationId), flow.readMyRelationships()])
        .then(([offers, gyms]) => {
          if (!active) return
          setPlans(offers)
          setGym(gyms.find((one) => one.organization_id === organizationId))
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
    }, [flow, organizationId]),
  )

  const gymName = gym?.organization_name ?? words.offers.yourGym

  async function confirmSubscription(plan: PlanOffer): Promise<void> {
    setBusy(true)
    try {
      await flow.subscribe(plan.plan_version_id)
      setChosen(undefined)
      setFailure(undefined)
      // Back to her plans, where the new one is listed and can be cancelled. Paying
      // happens at the gym's gateway, which is a step this slice does not open yet.
      router.replace('/subscriptions')
    } catch (cause) {
      const failed = cause instanceof ApiError ? cause.failure : 'unavailable'
      setFailure({ kind: 'subscribe', refusal: subscribeRefusalFor(failed) })
      setChosen(undefined)
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
          {gymName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {failure ? (
          <InlineAlert
            message={
              failure.kind === 'read'
                ? words.offers.readFailed
                : subscribeRefusalMessage(failure.refusal, gymName, words)
            }
          />
        ) : null}

        {plans.map((plan) => (
          <View
            key={plan.plan_version_id}
            style={[
              styles.card,
              {
                backgroundColor: theme.color.background.surface,
                borderColor: theme.color.border.subtle,
              },
            ]}
            testID={`plan-${plan.plan_version_id}`}
          >
            <Text role="control" size="lg">
              {plan.plan_name}
            </Text>
            <Text role="display" size="xl">
              {formatPrice(plan.amount_minor, plan.currency_code, locale)}
            </Text>
            <Text role="body" size="sm" color="muted">
              {periodLabel(plan.billing_period, words)}
            </Text>
            <Button label={words.offers.subscribe} onPress={() => setChosen(plan)} />
          </View>
        ))}

        {loaded && plans.length === 0 && !failure ? (
          <View style={styles.empty}>
            <Text role="control" size="lg">
              {words.offers.noneTitle}
            </Text>
            <Text role="body" size="sm" color="muted">
              {words.offers.noneBody}
            </Text>
          </View>
        ) : null}

        <Text role="body" size="sm" color="muted" style={styles.note}>
          {words.offers.gatewayNote}
        </Text>
      </ScrollView>

      <Sheet
        visible={chosen !== undefined}
        onDismiss={() => {
          if (busy) return
          setChosen(undefined)
        }}
        title={chosen ? words.offers.confirmTitle(chosen.plan_name) : ''}
      >
        <View style={styles.sheetBody}>
          <Text role="body" size="sm" color="secondary">
            {chosen
              ? words.offers.confirmBody(
                  formatPrice(chosen.amount_minor, chosen.currency_code, locale),
                  periodLabel(chosen.billing_period, words),
                  gymName,
                )
              : ''}
          </Text>
          {/* The thing nobody would assume: paying is not permission. */}
          <Text role="body" size="sm" color="secondary">
            {words.offers.notPermission}
          </Text>
          <Button
            label={words.offers.confirm}
            loading={busy}
            onPress={() => {
              if (chosen) void confirmSubscription(chosen)
            }}
          />
          <Button
            label={words.offers.back}
            variant="ghost"
            onPress={() => {
              if (busy) return
              setChosen(undefined)
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
  card: { gap: 4, borderWidth: 1, borderRadius: 16, padding: 16 },
  empty: { gap: 6 },
  note: { textAlign: 'center' },
  sheetBody: { gap: 12 },
})

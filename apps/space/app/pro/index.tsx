/**
 * `PRO-A1`, `PRO-A2`, `PRO-A3` · Tu plan — `HU-SP-086`, `HU-SP-087`, `HU-SP-088`.
 *
 * One screen for the three ways a person stands: Pro through a gym, Pro they pay for, or
 * the free plan. What decides is the API's `effective_source`; the membership card says
 * it, and the rest of the screen only answers what that means: what is included, where
 * the payments are, how to leave.
 *
 * **Cancelling happens in the store** (`PRO-C`). Apple and Google allow nothing else, so
 * the sheet says what stays the same, keeps «Mantener Pro» as the main act, and opens the
 * store's own subscriptions.
 */

import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import invitePhoto from '../../assets/images/pro-invite.webp'
import {
  billingOf,
  gymsOf,
  lastPaid,
  money,
  renewalLine,
  shortDate,
  sourceLine,
  storeName,
  subscriptionOf,
  type ProFlow,
  type ProPayments,
  type ProPlanCatalogue,
  type ProStatus,
  type SubscriptionSource,
} from '../../src/client/pro'
import { manageSubscription } from '../../src/client/pro-store'
import { createSpaceProFlow } from '../../src/client/pro-transport'
import { useLocale, useText } from '../../src/i18n/use-text'
import {
  FeatureList,
  LinkPanel,
  MembershipCard,
  SectionLabel,
  type CardFact,
  type PanelLink,
} from '../../src/components/pro-ui'

// Dark under the words, clear by three quarters, where the athlete stands.
const INVITE_VEIL = ['#05090FF7', '#05090FB8', '#05090F00'] as const
const INVITE_VEIL_STOPS = [0, 0.42, 0.78] as const

export default function ProPlanRoute() {
  const flow = useMemo(() => createSpaceProFlow(), [])
  return <ProPlan flow={flow} />
}

/** The screen itself, given its flow: the route passes the real one. */
export function ProPlan({ flow }: { readonly flow: ProFlow }) {
  const router = useRouter()
  const text = useText()
  const locale = useLocale()
  const words = text.plans.plan
  const insets = useSafeAreaInsets()
  const [status, setStatus] = useState<ProStatus | undefined>(undefined)
  const [payments, setPayments] = useState<ProPayments | undefined>(undefined)
  const [catalogue, setCatalogue] = useState<ProPlanCatalogue | undefined>(undefined)
  const [failure, setFailure] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let active = true
      Promise.all([flow.read(), flow.payments(), flow.plans()])
        .then(([read, paid, plans]) => {
          if (!active) return
          setStatus(read)
          setPayments(paid)
          setCatalogue(plans)
          setFailure(false)
        })
        .catch(() => active && setFailure(true))
      return () => {
        active = false
      }
    }, [flow]),
  )

  const subscription = status ? subscriptionOf(status) : undefined
  const [gym] = status ? gymsOf(status) : []
  const charges = payments?.payments ?? []
  const paid = lastPaid(charges)

  const facts: CardFact[] = []
  if (status?.effective_source === 'subscription' && subscription) {
    facts.push({
      label: subscription.auto_renews ? words.renewal : words.expiry,
      value: shortDate(subscription.current_period_end, locale),
    })
    const amount = paid ? money(paid.amount_minor, paid.currency_code, locale) : undefined
    if (amount) {
      const billing = billingOf(catalogue, subscription.version_id, text.plans)
      facts.push({ label: billing.fee, value: `${amount}${billing.per}` })
    }
  } else if (status?.effective_source === 'organization' && gym) {
    facts.push(
      { label: words.gym, value: gym.organization_name },
      { label: words.inApp, value: words.payNothing },
    )
  }

  const links: PanelLink[] = []
  links.push({
    icon: 'overview',
    title: words.eachPlan,
    caption: words.sideBySide,
    onPress: () => router.push('/pro/plans'),
  })
  if (subscription || charges.length > 0) {
    links.push({
      icon: 'history',
      title: words.payments,
      caption: paid
        ? words.chargesLast(charges.length, shortDate(paid.occurred_at, locale))
        : words.charges(charges.length),
      onPress: () => router.push('/pro/payments'),
    })
  }
  if (subscription) {
    links.push({
      icon: 'external',
      title: words.manageIn(subscription.store === 'google_play' ? 'Google Play' : 'App Store'),
      caption: words.changeOrCancel,
      onPress: () => void manageSubscription(undefined),
    })
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
          {words.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {failure ? <InlineAlert message={words.unavailable} /> : null}

        {status ? (
          <>
            <MembershipCard
              pro={status.is_pro}
              source={sourceLine(status, text.pro)}
              facts={facts}
            />

            {status.effective_source === 'organization' && gym ? (
              <Note size="md" icon="info">
                {words.whileAtGym(gym.organization_name)}
              </Note>
            ) : null}

            {subscription && subscription.status !== 'active' ? (
              <InlineAlert message={renewalLine(subscription, text.plans, locale)} tone="warning" />
            ) : null}

            {!status.is_pro ? <ProInvitation onPress={() => router.push('/pro/plans')} /> : null}

            <View style={styles.section}>
              <SectionLabel>{words.includes}</SectionLabel>
              <FeatureList
                features={status.features}
                pro={status.is_pro}
                waiting={text.plans.waitingForFeatures}
              />
            </View>

            {links.length > 0 ? <LinkPanel links={links} /> : null}

            {!status.is_pro ? (
              <Note size="md" icon="organization">
                {words.gymInvites}
              </Note>
            ) : null}

            {subscription ? (
              <Button
                label={words.cancel}
                variant="quietDanger"
                onPress={() => setCancelling(true)}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {subscription ? (
        <CancelSheet
          visible={cancelling}
          subscription={subscription}
          onDismiss={() => setCancelling(false)}
        />
      ) : null}
    </Screen>
  )
}

/** `PRO-A3`'s invitation: the paywall's athlete, cropped wide and mirrored to the light side. */
function ProInvitation({ onPress }: { readonly onPress: () => void }) {
  const theme = useTheme()
  const words = useText().plans.plan
  // Measured, because an absolutely filled image is drawn at its own size on iOS.
  const [size, setSize] = useState({ width: 0, height: 0 })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.meetPro}
      onPress={onPress}
      onLayout={(event) =>
        setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
      }
      style={[styles.invite, { borderColor: theme.color.accent.tonalBorder }]}
    >
      <Image
        source={invitePhoto}
        style={[styles.invitePhoto, size]}
        resizeMode="cover"
        accessible={false}
      />
      <LinearGradient
        colors={INVITE_VEIL}
        locations={INVITE_VEIL_STOPS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inviteCopy}>
        <View style={styles.seal}>
          <FoundationIcon name="favourite" size="sm" color={theme.color.icon.accent} decorative />
          <Text role="control" size="xs" color="accent">
            Allfit Pro
          </Text>
        </View>
        <Text role="display" size="2xl" uppercase>
          {words.inviteTitle}
        </Text>
      </View>
      <View style={styles.inviteButton}>
        <Button label={words.meet} size="sm" onPress={onPress} />
      </View>
    </Pressable>
  )
}

function CancelSheet({
  visible,
  subscription,
  onDismiss,
}: {
  readonly visible: boolean
  readonly subscription: SubscriptionSource
  readonly onDismiss: () => void
}) {
  const theme = useTheme()
  const locale = useLocale()
  const words = useText().plans.cancelSheet
  const store = storeName(subscription.store)
  const keeps = [
    ['history', words.keepsHistory],
    ['people', words.keepsPermissions],
    ['organization', words.keepsGym],
  ] as const
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={words.title}>
      <View style={styles.sheet}>
        <View
          style={[
            styles.until,
            {
              backgroundColor: theme.color.accent.tonal,
              borderColor: theme.color.accent.tonalBorder,
            },
          ]}
        >
          <FoundationIcon name="calendar" size="sm" color={theme.color.icon.accent} decorative />
          <Text role="control" size="xs" color="accent">
            {words.until(shortDate(subscription.current_period_end, locale))}
          </Text>
        </View>
        {keeps.map(([icon, line]) => (
          <Note key={line} size="md" icon={icon}>
            {line}
          </Note>
        ))}
        <Text role="body" size="xs" color="muted">
          {words.paidWith(store)}
        </Text>
        <Button label={words.keep} onPress={onDismiss} />
        <Button
          label={words.cancelIn(subscription.store === 'google_play' ? 'Google Play' : 'App Store')}
          variant="secondary"
          onPress={() => {
            onDismiss()
            void manageSubscription(undefined)
          }}
        />
      </View>
    </Sheet>
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
  content: { paddingHorizontal: 24, gap: 26 },
  section: { gap: 4 },
  seal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invite: {
    minHeight: 196,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 20,
    gap: 12,
    justifyContent: 'flex-end',
  },
  invitePhoto: { position: 'absolute', top: 0, left: 0 },
  inviteCopy: { gap: 4, maxWidth: 270 },
  inviteButton: { alignSelf: 'flex-start' },
  sheet: { gap: 16 },
  until: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
})

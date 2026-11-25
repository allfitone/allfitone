/**
 * `PRO-D` · Tus pagos — what the person has paid for Pro, the latest first.
 *
 * The total paid leads, in the same numerals as every other figure in the app; each
 * charge follows with its result. Allfit never holds the card, so receipts and the
 * payment method stay where the person paid: their Apple or Google Play account.
 */

import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { IconName } from '@allfitone/icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  billingOf,
  money,
  renewalLine,
  shortDate,
  storeName,
  subscriptionOf,
  type ProFlow,
  type ProPayments,
  type ProPlanCatalogue,
  type ProStatus,
} from '../../src/client/pro'
import { createSpaceProFlow } from '../../src/client/pro-transport'
import { SectionLabel } from '../../src/components/pro-ui'
import { useLocale, useText } from '../../src/i18n/use-text'

export default function ProPaymentsRoute() {
  const flow = useMemo(() => createSpaceProFlow(), [])
  return <ProPaymentsScreen flow={flow} />
}

/** The screen itself, given its flow: the route passes the real one. */
export function ProPaymentsScreen({ flow }: { readonly flow: ProFlow }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const text = useText()
  const locale = useLocale()
  const words = text.plans.payments
  const [payments, setPayments] = useState<ProPayments | undefined>(undefined)
  const [status, setStatus] = useState<ProStatus | undefined>(undefined)
  const [catalogue, setCatalogue] = useState<ProPlanCatalogue | undefined>(undefined)
  const [failure, setFailure] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let active = true
      Promise.all([flow.payments(), flow.read(), flow.plans()])
        .then(([paid, read, plans]) => {
          if (!active) return
          setPayments(paid)
          setStatus(read)
          setCatalogue(plans)
        })
        .catch(() => active && setFailure(true))
      return () => {
        active = false
      }
    }, [flow]),
  )

  const list = payments?.payments ?? []
  const succeeded = list.filter((payment) => payment.result === 'succeeded')
  const [latest] = succeeded
  const first = succeeded[succeeded.length - 1]
  const subscription = status ? subscriptionOf(status) : undefined
  // The fee of the latest charge that went through: what the person pays each period.
  const fee = latest ? money(latest.amount_minor, latest.currency_code, locale) : undefined
  const billing = subscription
    ? billingOf(catalogue, subscription.version_id, text.plans)
    : undefined
  const store = subscription?.store ?? latest?.store

  const chips: (readonly [IconName, string])[] = []
  if (store) chips.push(['external', words.through(storeName(store))])
  if (subscription) chips.push(['frequency', renewalLine(subscription, text.plans, locale)])

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

        {payments && list.length === 0 ? (
          <Note size="md" icon="history">
            {words.none}
          </Note>
        ) : null}

        {fee ? (
          <View style={styles.summary}>
            <SectionLabel>{billing?.fee ?? words.lastCharge}</SectionLabel>
            <View style={styles.totalRow}>
              <Text role="data" size="6xl">
                {fee}
              </Text>
              {billing?.per ? (
                <Text role="body" size="md" color="secondary">
                  {billing.per}
                </Text>
              ) : null}
            </View>
            {first ? (
              <Text role="body" size="sm" color="secondary">
                {words.since(shortDate(first.occurred_at, locale))}
              </Text>
            ) : null}
            <View style={styles.chips}>
              {chips.map(([icon, chip]) => (
                <View
                  key={chip}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: theme.color.background.surface,
                      borderColor: theme.color.border.subtle,
                    },
                  ]}
                >
                  <FoundationIcon
                    name={icon}
                    size="xs"
                    color={theme.color.icon.secondary}
                    decorative
                  />
                  <Text role="control" size="xs" color="secondary">
                    {chip}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {list.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{words.charges}</SectionLabel>
            <ContentGroup>
              {list.map((payment) => {
                const paid = payment.result === 'succeeded'
                return (
                  <ContentRow
                    key={payment.id}
                    icon={paid ? 'check' : 'close'}
                    iconTone={paid ? 'success' : 'danger'}
                    iconShape="round"
                    name={shortDate(payment.occurred_at, locale)}
                    caption={paid ? words.paid : words.failed(storeName(payment.store))}
                    {...(paid ? {} : { captionTone: 'danger' as const })}
                    value={money(payment.amount_minor, payment.currency_code, locale) ?? '—'}
                    valueFace="data"
                    valueTone={paid ? 'primary' : 'muted'}
                    valueSize="md"
                  />
                )
              })}
            </ContentGroup>
          </View>
        ) : null}

        <Note size="md" icon="locked">
          {words.receipts(store ? storeName(store) : words.theStore)}
        </Note>
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
  content: { paddingHorizontal: 24, gap: 26 },
  summary: { gap: 6 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  section: { gap: 10 },
})

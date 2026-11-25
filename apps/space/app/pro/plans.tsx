/**
 * `PRO-E` · Gratis y Pro — `HU-SP-084`, `HU-SP-085`.
 *
 * The one place inside the app where Pro is bought, and where the two plans are put side
 * by side. Everything it says about a plan comes from the catalogue (`GET /pro/plans`):
 * the cards tell what Pro opens and the table reads each plan's declared functions, so
 * changing a limit in Backoffice changes this screen without a release. The price is the
 * store's, localized, and it stays frozen while the person remains subscribed.
 *
 * **`PRO-E3`.** Whoever already has Pro through a gym is told so and the button does not
 * charge them (`HU-SP-085` criterion 6); whoever already pays sees it as theirs. The
 * renewal, «Restaurar compras», the terms and the privacy policy are always under the
 * button, as the stores ask of a subscription.
 */

import { Badge } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Scrim, Veil } from '@allfitone/react-native/gradient'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Image, Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import hero from '../../assets/images/plans/compare-hero.webp'
import cover0 from '../../assets/images/plans/cover-0.webp'
import cover1 from '../../assets/images/plans/cover-1.webp'
import cover2 from '../../assets/images/plans/cover-2.webp'
import cover3 from '../../assets/images/plans/cover-3.webp'
import meal from '../../assets/images/plans/meal-scan.webp'
import { comparisonRows } from '../../src/client/plan'
import {
  freePlanOf,
  gymsOf,
  productFor,
  proPlanOf,
  subscriptionOf,
  type ProFlow,
  type ProPlanCatalogue,
  type ProStatus,
} from '../../src/client/pro'
import { LEGAL_URLS } from '../../src/client/legal'
import { deviceStore, loadOffer, type StoreOffer } from '../../src/client/pro-store'
import { createSpaceProFlow } from '../../src/client/pro-transport'
import { ComparisonTable, UnlockCarousel } from '../../src/components/plan-comparison'
import { useProPurchase } from '../../src/components/use-pro-purchase'
import { useText } from '../../src/i18n/use-text'

const HERO_HEIGHT = 430
const FOOTER_HEIGHT = 176
const COVERS = [cover0, cover1, cover2, cover3]

export default function ProPlansRoute() {
  const flow = useMemo(() => createSpaceProFlow(), [])
  return <ProPlans flow={flow} offerFor={loadOffer} />
}

/** The screen itself, given its flow and how the store describes a product. */
export function ProPlans({
  flow,
  offerFor,
}: {
  readonly flow: ProFlow
  readonly offerFor: (productId: string) => Promise<StoreOffer | undefined>
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const text = useText()
  const words = text.plans.compare
  const [status, setStatus] = useState<ProStatus | undefined>(undefined)
  const [catalogue, setCatalogue] = useState<ProPlanCatalogue | undefined>(undefined)
  const [offer, setOffer] = useState<StoreOffer | undefined>(undefined)
  const [failure, setFailure] = useState<'unavailable' | 'notOnSale' | undefined>(undefined)
  const [footer, setFooter] = useState(0)
  const purchase = useProPurchase(flow, () => router.replace('/pro'))

  useFocusEffect(
    useCallback(() => {
      let active = true
      Promise.all([flow.read(), flow.plans()])
        .then(async ([read, plans]) => {
          if (!active) return
          setStatus(read)
          setCatalogue(plans)
          const pro = proPlanOf(plans)
          const product = pro ? productFor(pro, deviceStore) : undefined
          const found = product ? await offerFor(product).catch(() => undefined) : undefined
          if (!active) return
          setOffer(found)
          setFailure(found ? undefined : 'notOnSale')
        })
        .catch(() => active && setFailure('unavailable'))
      return () => {
        active = false
      }
    }, [flow, offerFor]),
  )

  const pro = catalogue ? proPlanOf(catalogue) : undefined
  const free = catalogue ? freePlanOf(catalogue) : undefined
  const rows = comparisonRows(free?.features ?? [], pro?.features ?? [], text.plans)
  const period = pro?.billing_period ?? null
  const paying = status ? subscriptionOf(status) : undefined
  const [gym] = status && status.effective_source === 'organization' ? gymsOf(status) : []
  const canBuy = Boolean(offer && status && !paying && !gym)
  const label = paying
    ? words.alreadyPro
    : gym
      ? words.proWithGym(gym.organization_name)
      : offer
        ? words.becomeProAt(`${offer.displayPrice}${period ? (words.per[period] ?? '') : ''}`)
        : words.becomePro
  const note = paying
    ? words.renewsAlone
    : gym
      ? words.whileWithGym
      : words.renewsUntil(
          period ? (words.renews[period] ?? '') : '',
          words.store[deviceStore] ?? words.theStore,
        )

  return (
    <Screen edges={[]} padded={false} ambient={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: FOOTER_HEIGHT + insets.bottom + 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { height: HERO_HEIGHT + insets.top }]}>
          <Image
            source={hero}
            style={[styles.photo, { width, height: HERO_HEIGHT + insets.top }]}
            resizeMode="cover"
            accessible={false}
          />
          <Scrim height={HERO_HEIGHT + insets.top} coverage={1} onset={0.25} />
          <View style={styles.heroCopy}>
            {/* Solid, not tonal: a tonal seal disappears into the photo behind it. */}
            <Badge label={words.seal} tone="accent" style={styles.seal} />
            <View accessible accessibilityRole="header" accessibilityLabel={words.headline}>
              {words.headlineLines.map((line, index) => (
                <Animated.View
                  key={line}
                  entering={FadeInDown.delay(120 + index * 120)
                    .duration(520)
                    .reduceMotion(ReduceMotion.System)}
                >
                  <Text
                    role="display"
                    size="6xl"
                    color={index === 2 ? 'accent' : index === 1 ? 'muted' : 'primary'}
                    style={styles.title}
                  >
                    {line}
                  </Text>
                </Animated.View>
              ))}
            </View>
            <Text role="body" size="md" color="secondary">
              {words.lede}
            </Text>
          </View>
        </View>

        {failure ? (
          <View style={styles.padded}>
            <InlineAlert
              message={words[failure]}
              tone={failure === 'notOnSale' ? 'info' : 'danger'}
            />
          </View>
        ) : null}
        {purchase.failure ? (
          <View style={styles.padded}>
            <InlineAlert message={purchase.failure} />
          </View>
        ) : null}

        <UnlockCarousel plan="pro" meal={meal} covers={COVERS} />

        <View style={[styles.padded, styles.sections]}>
          {catalogue ? <ComparisonTable rows={rows} selected="pro" /> : null}

          <InlineAlert
            tone="success"
            icon="permissions"
            iconSize="md"
            title={words.dataFreeTitle}
            message={words.dataFreeBody}
          />

          {gym ? null : (
            <Note size="md" icon="organization" boxed>
              {words.gymIncludes}
            </Note>
          )}
        </View>
      </ScrollView>

      <IconButton
        icon="close"
        accessibilityLabel={words.close}
        onPress={() => router.back()}
        style={[styles.close, { top: insets.top + 6 }]}
      />

      <View
        onLayout={(event) => setFooter(event.nativeEvent.layout.height)}
        style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}
      >
        <Veil edge="bottom" extent={footer} hold={0.78} background="canvas" />
        <Button
          label={label}
          loading={purchase.busy}
          disabled={!canBuy && !paying}
          onPress={() => {
            if (paying) {
              router.replace('/pro')
              return
            }
            if (offer && status && canBuy) void purchase.subscribe(offer, status.account_token)
          }}
        />
        <Text role="body" size="xs" color="muted" align="center">
          {note}
        </Text>
        <View style={styles.links}>
          <Button
            label={words.restore}
            variant="ghost"
            size="sm"
            disabled={purchase.busy}
            onPress={() => void purchase.restore()}
          />
          <Button
            label={words.terms}
            variant="ghost"
            size="sm"
            onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
          />
          <Button
            label={words.privacy}
            variant="ghost"
            size="sm"
            onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
          />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'flex-end' },
  photo: { position: 'absolute', top: 0, left: 0 },
  heroCopy: { paddingHorizontal: 24, paddingBottom: 20, gap: 12 },
  title: { lineHeight: 52 },
  seal: { alignSelf: 'flex-start' },
  padded: { paddingHorizontal: 24, marginBottom: 20 },
  sections: { gap: 22, marginTop: 30, marginBottom: 0 },
  close: { position: 'absolute', left: 24 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 10,
  },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
})

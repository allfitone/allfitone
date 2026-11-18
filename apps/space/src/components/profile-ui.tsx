/**
 * The pieces the profile tab (`PF-1`) is built from: a labelled group of rows, the row,
 * and the plan card at the top.
 *
 * Every row has the same three parts — a glyph in a quiet square, a title with the one
 * fact under it, and what is at the end. The end says what the row does: a chevron opens
 * something, «Activo» states a fact, and «Pronto» marks a part of the account that is
 * not built yet. A row that cannot open anything never pretends it can.
 */

import type { IconName } from '@allfitone/icons'
import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { GlassPanel } from '@allfitone/react-native/glass'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import teaserPhoto from '../../assets/images/pro-invite.webp'
import { profileRowLook, type ProfileRowEnd } from '../client/profile'
import { SectionLabel } from './pro-ui'

const SHINE_WIDTH = 90
const PRO_CARD = ['#0E3B45', '#08141C'] as const
const FREE_CARD = ['#13222B', '#0A131A'] as const

/** A section of the profile: its name, then its rows on the design system's grouped card. */
export function ProfileGroup({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.group}>
      <SectionLabel>{label}</SectionLabel>
      <ContentGroup>{children}</ContentGroup>
    </View>
  )
}

export type RowEnd = ProfileRowEnd

/** A profile row: the design system's row, told by `profileRowLook` how to end. */
export function ProfileRow({
  icon,
  title,
  caption,
  end,
  alert,
  value,
  onPress,
}: {
  readonly icon: IconName
  readonly title: string
  readonly caption?: string | undefined
  readonly end: RowEnd
  /** Tints the glyph: for the one row about pain, which is health data. */
  readonly alert?: boolean
  /** The row's latest figure, before the chevron: «70,2 kg», «+18 %». It lights the glyph. */
  readonly value?: string | undefined
  readonly onPress?: (() => void) | undefined
}) {
  const look = profileRowLook({ end, opens: onPress !== undefined, value, alert })
  return (
    <ContentRow
      name={title}
      icon={icon}
      trailing={look.trailing}
      {...(caption ? { caption } : {})}
      {...(value ? { value } : {})}
      {...(look.iconTone ? { iconTone: look.iconTone } : {})}
      {...(look.opens && onPress ? { onPress } : {})}
    />
  )
}

/** The plan at the top of the profile, the one row drawn as a card. */
export function PlanCard({
  pro,
  caption,
  onPress,
}: {
  readonly pro: boolean
  readonly caption: string
  readonly onPress: () => void
}) {
  const theme = useTheme()
  const title = pro ? 'Allfit Pro' : 'Plan gratis'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: pro ? theme.color.accent.tonalBorder : theme.color.border.subtle },
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={pro ? PRO_CARD : FREE_CARD}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.seal,
          {
            backgroundColor: theme.color.background.canvas,
            borderColor: pro ? theme.color.accent.tonalBorder : theme.color.border.subtle,
          },
        ]}
      >
        <FoundationIcon
          name={pro ? 'favourite' : 'person'}
          size="md"
          color={pro ? theme.color.icon.accent : theme.color.icon.secondary}
          decorative
        />
      </View>
      <View style={styles.grow}>
        <Text role="control" size="md">
          {title}
        </Text>
        <Text role="control" size="xs" color={pro ? 'accent' : 'muted'}>
          {caption}
        </Text>
      </View>
      <FoundationIcon
        name="next"
        size="sm"
        color={pro ? theme.color.icon.accent : theme.color.icon.secondary}
        decorative
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  teaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 92,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  teaserPhoto: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '62%' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SHINE_WIDTH },
  teaserGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
  },
  teaserSeal: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  group: { gap: 8 },
  grow: { flex: 1, gap: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
  },
  seal: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
})

const TEASER_VEIL = ['#05090FFA', '#05090FD9', '#05090F33'] as const
const TEASER_VEIL_STOPS = [0, 0.5, 1] as const
/** Every few seconds, never on a loop the eye cannot leave. */
const SHINE_EVERY_MS = 4200

/**
 * On a free plan, under the plan card: the one door to what Pro opens. A photograph and
 * a soft light that crosses it now and then, so it is noticed; no colour fill, no badge
 * shouting, so it is not an advert. Still when the phone asks for reduced motion.
 */
export function ProTeaser({ onPress }: { readonly onPress: () => void }) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const [width, setWidth] = useState(0)
  const shine = useSharedValue(0)

  useEffect(() => {
    if (reduced || width === 0) return
    shine.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }),
          withDelay(SHINE_EVERY_MS, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    )
  }, [reduced, width, shine])

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -SHINE_WIDTH + shine.get() * (width + SHINE_WIDTH * 2) }],
  }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Allfit Pro. Tu historial completo, tu progreso y la IA. Comparar Gratis y Pro"
      onPress={onPress}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={({ pressed }) => [
        styles.teaser,
        { borderColor: theme.color.accent.tonalBorder },
        pressed && styles.pressed,
      ]}
    >
      <Image
        source={teaserPhoto}
        style={styles.teaserPhoto}
        contentFit="cover"
        contentPosition="right"
      />
      <LinearGradient
        colors={TEASER_VEIL}
        locations={TEASER_VEIL_STOPS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" style={[styles.shine, sweep]}>
        <LinearGradient
          colors={[
            `${theme.color.icon.accent}00`,
            `${theme.color.icon.accent}2E`,
            `${theme.color.icon.accent}00`,
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.grow}>
        <View style={styles.teaserSeal}>
          <FoundationIcon name="favourite" size="xs" color={theme.color.icon.accent} decorative />
          <Text role="control" size="2xs" color="accent" uppercase tracking={0.12}>
            Allfit Pro
          </Text>
        </View>
        <Text role="control" size="md">
          Lleva tu progreso más lejos
        </Text>
        <Text role="body" size="xs" color="secondary">
          Todo tu historial, tus medidas y la IA
        </Text>
      </View>
      {/* Frosted glass, not a fill: over the photograph a cyan block read as a sticker. */}
      <GlassPanel radius="action" material="chip" style={styles.teaserGo}>
        <Text role="control" size="xs" color="accent">
          Ver Pro
        </Text>
        <FoundationIcon name="next" size="xs" color={theme.color.icon.accent} decorative />
      </GlassPanel>
    </Pressable>
  )
}

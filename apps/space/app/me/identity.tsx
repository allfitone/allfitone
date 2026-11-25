/**
 * `PF-2f` · Identidad y acceso (`HU-SP-009`, TECH-43, TECH-44): the Fitness ID, how the
 * person is called, how Allfit reaches them and how they sign in.
 *
 * **Each thing in its own place** (criterion 2): no permissions and no gyms here, and the
 * email, the phone and the password live here rather than in rows of their own in Perfil.
 * The name and the username are corrected each on its own screen (`HU-SP-098` criterion
 * 6, `OP-IDN-063`): changing one never asks for the other, and the keyboard never pushes a
 * sheet over what it edits.
 *
 * **The phone is a contact value** (ADR-050): V1 sends no SMS, so it is saved at once,
 * with no verification state to show. **The email changes with a code** (`HU-SP-076`,
 * `HU-SP-077`): while one is awaited the row says «Verificación pendiente» and leads to
 * the code; while WorkOS takes the address it says so and leads nowhere. Changing the
 * password (`HU-SP-005`, TECH-325) opens its own screen.
 */

import { Badge } from '@allfitone/react-native/badge'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { withAlpha } from '@allfitone/react-native/tokens'
import type { IconName } from '@allfitone/icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { Children, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import {
  activeSince,
  emailRow,
  foundingMemberLabel,
  identityInitials,
  type ContactState,
  type EmailRowState,
  type SpaceIdentity,
} from '../../src/client/fitness-profile'
import { phoneLine } from '../../src/client/phone-countries'
import { Note } from '@allfitone/react-native/note'
import { LIVE_IDENTITY, type IdentitySources } from '../../src/components/identity-edit'
import { SectionLabel } from '../../src/components/pro-ui'
import { useText } from '../../src/i18n/use-text'

const CARD = ['#0E3B45', '#08141C'] as const

export default function IdentityRoute() {
  return <IdentityScreen sources={LIVE_IDENTITY} />
}

/** The screen given where its data comes from; the route passes the real sources. */
export function IdentityScreen({ sources }: { readonly sources: IdentitySources }) {
  const router = useRouter()
  const theme = useTheme()
  const text = useText()
  const t = text.identity
  const [identity, setIdentity] = useState<SpaceIdentity | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)
  const email = identity ? emailRow(identity.email, text.identity.emailRow) : undefined
  const emailRoute = email?.route
  const editEmail = emailRoute ? { onEdit: () => router.push(emailRoute) } : {}

  // Read again each time it shows: the edit screens go back here once they save.
  useFocusEffect(
    useCallback(() => {
      let active = true
      sources
        .readIdentity()
        .then((read) => {
          if (!active) return
          setIdentity(read)
          setUnreadable(false)
        })
        .catch(() => active && setUnreadable(true))
      return () => {
        active = false
      }
    }, [sources]),
  )

  // While WorkOS takes a new address the row says so; reading again shows when it is done.
  const applying = identity?.email.pending?.status === 'applying'
  useEffect(() => {
    if (!applying) return
    let active = true
    const timer = setTimeout(() => {
      sources
        .readIdentity()
        .then((read) => active && setIdentity(read))
        .catch(() => undefined)
    }, 3_000)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [applying, identity, sources])

  const fullName = identity ? `${identity.given_name} ${identity.family_name}` : ''
  const founding = foundingMemberLabel(identity?.founding_member_number)

  return (
    <Screen edges={['top', 'bottom']}>
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {unreadable ? <InlineAlert message={t.unreadable} /> : null}

        {identity && email ? (
          <>
            <LinearGradient
              colors={CARD}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.card, { borderColor: theme.color.accent.tonalBorder }]}
            >
              <View style={styles.cardTop}>
                <Text role="label" size="xs" color="accent">
                  FITNESS ID
                </Text>
                <View
                  style={[
                    styles.active,
                    { backgroundColor: withAlpha(theme.color.status.success, 0.14) },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: theme.color.status.success }]} />
                  <Text role="control" size="xs" color="success">
                    {t.card.active}
                  </Text>
                </View>
              </View>
              <View style={styles.who}>
                <View style={[styles.avatar, { borderColor: theme.color.icon.accent }]}>
                  <Text role="display" size="3xl">
                    {identityInitials(identity.given_name, identity.family_name)}
                  </Text>
                </View>
                <View style={styles.grow}>
                  <Text role="display" size="3xl" uppercase>
                    {fullName}
                  </Text>
                  {identity.username ? (
                    <Text role="control" size="md" color="accent">
                      {`@${identity.username}`}
                    </Text>
                  ) : null}
                  {founding ? (
                    <View style={styles.founding}>
                      <Badge label={founding} tone="accent" />
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={[styles.rule, { backgroundColor: theme.color.border.subtle }]} />
              <View style={styles.facts}>
                <View style={styles.grow}>
                  <Text role="label" size="2xs" color="muted" uppercase>
                    {t.card.since}
                  </Text>
                  <Text role="control" size="sm">
                    {activeSince(identity.active_since, text.common)}
                  </Text>
                </View>
                <View style={styles.grow}>
                  <Text role="label" size="2xs" color="muted" uppercase>
                    {t.card.yours}
                  </Text>
                  <Text role="control" size="sm">
                    {t.card.noGymOwnsIt}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.group}>
              <SectionLabel>{t.sections.name}</SectionLabel>
              <Panel>
                <IdentityRow
                  icon="person"
                  label={t.rows.fullName}
                  value={fullName}
                  onEdit={() => router.push('/me/name')}
                />
                <IdentityRow
                  icon="people"
                  label={t.rows.username}
                  value={identity.username ?? t.rows.noUsername}
                  caption={t.rows.usernameCaption}
                  onEdit={() => router.push('/me/username')}
                />
              </Panel>
            </View>

            <View style={styles.group}>
              <SectionLabel>{t.sections.contact}</SectionLabel>
              <Panel>
                <IdentityRow
                  icon="notification"
                  label={t.rows.email}
                  value={identity.email.address ?? t.rows.noEmail}
                  caption={email.caption}
                  state={EMAIL_CHIP[email.state]}
                  {...editEmail}
                />
                <IdentityRow
                  icon="notification"
                  label={t.rows.phone}
                  value={identity.phone.number ? phoneLine(identity.phone.number) : t.rows.noPhone}
                  caption={t.rows.phoneCaption}
                  onEdit={() => router.push('/me/phone')}
                />
              </Panel>
            </View>

            <View style={styles.group}>
              <SectionLabel>{t.sections.signIn}</SectionLabel>
              <Panel>
                <IdentityRow
                  icon="locked"
                  label={t.rows.password}
                  value="••••••••••"
                  caption={t.rows.passwordCaption}
                  onEdit={() => router.push('/me/password')}
                />
              </Panel>
            </View>

            <Note>{t.elsewhere}</Note>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function Panel({ children }: { readonly children: ReactNode }) {
  const theme = useTheme()
  const rows = Children.toArray(children)
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.color.background.surface, borderColor: theme.color.border.subtle },
      ]}
    >
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? (
            <View style={[styles.rule, { backgroundColor: theme.color.border.subtle }]} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  )
}

function IdentityRow({
  icon,
  label,
  value,
  caption,
  state,
  onEdit,
}: {
  readonly icon: IconName
  readonly label: string
  readonly value: string
  readonly caption?: string
  readonly state?: RowChip
  readonly onEdit?: () => void
}) {
  const theme = useTheme()
  const text = useText()
  const chips = text.identity.chips
  const body = (
    <>
      <View style={[styles.glyph, { backgroundColor: theme.color.background.surfaceMuted }]}>
        <FoundationIcon name={icon} size="sm" color={theme.color.icon.secondary} decorative />
      </View>
      <View style={styles.grow}>
        <Text role="body" size="xs" color="secondary">
          {label}
        </Text>
        <Text role="control" size="md">
          {value}
        </Text>
        {caption ? (
          <Text role="body" size="xs" color="muted">
            {caption}
          </Text>
        ) : null}
        {state === 'verified' ? (
          <View
            style={[styles.verified, styles.start, { borderColor: theme.color.accent.tonalBorder }]}
          >
            <FoundationIcon name="success" size="xs" color={theme.color.icon.accent} decorative />
            <Text role="control" size="xs" color="accent">
              {chips.verified}
            </Text>
          </View>
        ) : state === 'pending' ? (
          <View
            style={[styles.verified, styles.start, { borderColor: theme.color.status.warning }]}
          >
            <FoundationIcon name="time" size="xs" color={theme.color.status.warning} decorative />
            <Text role="control" size="xs" style={{ color: theme.color.status.warning }}>
              {chips.pending}
            </Text>
          </View>
        ) : state === 'unverified' ? (
          <View
            style={[styles.verified, styles.start, { borderColor: theme.color.status.warning }]}
          >
            <FoundationIcon
              name="warning"
              size="xs"
              color={theme.color.status.warning}
              decorative
            />
            <Text role="control" size="xs" style={{ color: theme.color.status.warning }}>
              {chips.unverified}
            </Text>
          </View>
        ) : null}
      </View>
      {onEdit ? (
        <FoundationIcon name="edit" size="sm" color={theme.color.icon.accent} decorative />
      ) : null}
    </>
  )
  if (!onEdit) {
    return (
      <View
        accessible
        accessibilityLabel={[
          label,
          value,
          state && state !== 'missing' ? chips[state] : '',
          caption,
        ]
          .filter(Boolean)
          .join('. ')}
        style={styles.row}
      >
        {body}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={text.common.change}
      onPress={onEdit}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  )
}

type RowChip = ContactState | 'pending'

// While WorkOS takes the address, the line says so and the row carries no chip.
const EMAIL_CHIP: Record<EmailRowState, RowChip> = {
  verified: 'verified',
  unverified: 'unverified',
  awaiting_code: 'pending',
  applying: 'missing',
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 12 },
  content: { gap: 20, paddingTop: 4, paddingBottom: 40 },
  card: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 18 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: 2 },
  founding: { alignSelf: 'flex-start', marginTop: 8 },
  rule: { height: 1 },
  facts: { flexDirection: 'row', gap: 16 },
  group: { gap: 10 },
  panel: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  start: { alignSelf: 'flex-start', marginTop: 4 },
  pressed: { opacity: 0.7 },
})

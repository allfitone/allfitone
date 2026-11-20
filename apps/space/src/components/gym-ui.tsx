/**
 * The pieces the gym screens share (INV-3..7, N-8a, PF-8, PF-9): the gym's monogram, a
 * row with a glyph in a quiet square, and the icon each data category wears.
 */

import type { IconName } from '@allfitone/icons'
import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { invitationExpiry, type PendingInvitation } from '../client/gym-affiliation'
import { createSpaceInvitationFlow } from '../client/gym-affiliation-transport'
import { holdsLinkToken } from '../client/invitation-draft'

const SCOPE_ICON: Record<string, IconName> = {
  relationship_training: 'training',
  prior_training_history: 'history',
  body_progress: 'progress',
  health_context: 'heart',
  nutrition_intake: 'nutrition',
  nutrition_guidance: 'target',
  nutrition_media: 'image',
}

export const scopeIcon = (code: string): IconName => SCOPE_ICON[code] ?? 'permissions'

/** The gym's first letter on its warm square, the way the designs draw a gym. */
export function GymMark({ name, size = 44 }: { readonly name: string; readonly size?: number }) {
  const theme = useTheme()
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: theme.color.discipline.highIntensity,
        },
      ]}
    >
      <Text
        role="display"
        size={size > 60 ? '3xl' : 'xl'}
        style={{ color: theme.color.background.canvas }}
      >
        {name.trim().slice(0, 1).toUpperCase()}
      </Text>
    </View>
  )
}

/** A card holding rows divided by a hairline: the design system's grouped card. */
export function RowCard({ children }: { readonly children: ReactNode }) {
  return <ContentGroup>{children}</ContentGroup>
}

// Asked once per launch: every onboarding step shows the same answer.
let waiting: Promise<string | undefined> | undefined

/** `INV-2`: the gym whose invitation waits at the end of the onboarding, if any. */
export function WaitingGym() {
  const theme = useTheme()
  const [gym, setGym] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    waiting ??= createSpaceInvitationFlow()
      .listMine()
      .then((pending) => pending[0]?.organization_name)
      .catch(() => undefined)
    void waiting.then((name) => {
      if (active) setGym(name)
    })
    return () => {
      active = false
    }
  }, [])

  if (!gym) return null
  return (
    <View
      style={[
        styles.waiting,
        { backgroundColor: theme.color.accent.tonal, borderColor: theme.color.accent.tonalBorder },
      ]}
    >
      <GymMark name={gym} size={22} />
      <Text role="control" size="xs" style={{ color: theme.color.text.accent }}>
        {gym} te espera al terminar
      </Text>
    </View>
  )
}

/**
 * On «Hoy», the invitation still waiting on her, until she answers it or it expires.
 * A link opened before signing in is picked up here, once she is in.
 */
export function PendingInvitationCard({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingInvitation | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      if (holdsLinkToken()) {
        router.push('/invitation')
        return
      }
      let active = true
      createSpaceInvitationFlow()
        .listMine()
        .then((list) => {
          if (active) setPending(list[0])
        })
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [router]),
  )

  if (!pending) return null
  return (
    <ContentRow
      preview={<GymMark name={pending.organization_name} size={40} />}
      name={`${pending.organization_name} te invitó`}
      caption={`Ver y decidir · ${invitationExpiry(pending.expires_at)}`}
      onPress={() => router.push({ pathname: '/invitation', params: { id: pending.id } })}
      {...(style ? { style } : {})}
    />
  )
}

const styles = StyleSheet.create({
  waiting: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    marginBottom: 8,
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
})

/**
 * `PF-2e` · Identidad y acceso (`HU-SP-009`, TECH-43): the Fitness ID, how the person
 * is called, how Allfit reaches them and how they sign in.
 *
 * **Each thing in its own place** (criterion 2): no permissions and no gyms here, and
 * the email, the phone and the password live here rather than in rows of their own in
 * Perfil. The name and the username are corrected from this screen (`HU-SP-098`
 * criterion 6, `OP-IDN-063`), each on its own screen: changing one never asks for the
 * other, and the keyboard never pushes a sheet over what it edits. The phone is a contact value (ADR-050): V1 sends no SMS, so it is written and
 * saved at once, with no verification state to show. Changing the email (`HU-SP-076`) or
 * the password (`HU-SP-005`) is not built yet, so those rows say «Pronto».
 */

import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { IconName } from '@allfitone/icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { Children, useCallback, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import {
  activeSince,
  contactState,
  identityInitials,
  type ContactState,
  type SpaceIdentity,
} from '../../src/client/fitness-profile'
import { phoneLine } from '../../src/client/phone-countries'
import { FormNote } from '../../src/components/fitness-profile-ui'
import { LIVE_IDENTITY, type IdentitySources } from '../../src/components/identity-edit'
import { SectionLabel } from '../../src/components/pro-ui'

const UNREADABLE = 'No pudimos leer tu identidad. Revisa tu conexión e inténtalo otra vez.'
const CARD = ['#0E3B45', '#08141C'] as const

export default function IdentityRoute() {
  return <IdentityScreen sources={LIVE_IDENTITY} />
}

/** The screen given where its data comes from; the route passes the real sources. */
export function IdentityScreen({ sources }: { readonly sources: IdentitySources }) {
  const router = useRouter()
  const theme = useTheme()
  const [identity, setIdentity] = useState<SpaceIdentity | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)

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

  const fullName = identity ? `${identity.given_name} ${identity.family_name}` : ''

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header">
          Identidad y acceso
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {unreadable ? <InlineAlert message={UNREADABLE} /> : null}

        {identity ? (
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
                  style={[styles.active, { backgroundColor: `${theme.color.status.success}24` }]}
                >
                  <View style={[styles.dot, { backgroundColor: theme.color.status.success }]} />
                  <Text role="control" size="xs" color="success">
                    Activo
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
                </View>
              </View>
              <View style={[styles.rule, { backgroundColor: theme.color.border.subtle }]} />
              <View style={styles.facts}>
                <View style={styles.grow}>
                  <Text role="label" size="2xs" color="muted" uppercase>
                    Desde
                  </Text>
                  <Text role="control" size="sm">
                    {activeSince(identity.active_since)}
                  </Text>
                </View>
                <View style={styles.grow}>
                  <Text role="label" size="2xs" color="muted" uppercase>
                    Es tuyo
                  </Text>
                  <Text role="control" size="sm">
                    Ningún gimnasio lo posee
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.group}>
              <SectionLabel>Cómo te llamas</SectionLabel>
              <Panel>
                <IdentityRow
                  icon="person"
                  label="Nombre y apellido"
                  value={fullName}
                  onEdit={() => router.push('/me/name')}
                />
                <IdentityRow
                  icon="people"
                  label="Usuario"
                  value={identity.username ?? 'Sin usuario'}
                  caption="Único: nadie más puede tenerlo."
                  onEdit={() => router.push('/me/username')}
                />
              </Panel>
            </View>

            <View style={styles.group}>
              <SectionLabel>Cómo te contactamos</SectionLabel>
              <Panel>
                <IdentityRow
                  icon="notification"
                  label="Correo"
                  value={identity.email.address ?? 'Sin correo'}
                  caption="También es con el que entras."
                  state={contactState({
                    value: identity.email.address,
                    verified: identity.email.verified,
                  })}
                  soon
                />
                <IdentityRow
                  icon="notification"
                  label="Teléfono"
                  value={identity.phone.number ? phoneLine(identity.phone.number) : 'Sin teléfono'}
                  caption="Solo para contactarte: no te enviamos SMS."
                  onEdit={() => router.push('/me/phone')}
                />
              </Panel>
            </View>

            <View style={styles.group}>
              <SectionLabel>Cómo entras</SectionLabel>
              <Panel>
                <IdentityRow
                  icon="locked"
                  label="Contraseña"
                  value="••••••••••"
                  caption="Al cambiarla se cierran tus otras sesiones."
                  soon
                />
              </Panel>
            </View>

            <FormNote text="Tus permisos y tus gimnasios tienen su propio lugar en Perfil." />
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
  soon,
  onEdit,
}: {
  readonly icon: IconName
  readonly label: string
  readonly value: string
  readonly caption?: string
  readonly state?: ContactState
  readonly soon?: boolean
  readonly onEdit?: () => void
}) {
  const theme = useTheme()
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
              Verificado
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
              Sin verificar
            </Text>
          </View>
        ) : null}
      </View>
      {onEdit ? (
        <FoundationIcon name="edit" size="sm" color={theme.color.icon.accent} decorative />
      ) : soon ? (
        <Text role="control" size="2xs" color="muted">
          Pronto
        </Text>
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
          STATE_LABEL[state ?? 'missing'],
          caption,
          soon && 'Pronto',
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
      accessibilityHint="Cambiar"
      onPress={onEdit}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  )
}

const STATE_LABEL: Record<ContactState, string> = {
  verified: 'Verificado',
  unverified: 'Sin verificar',
  missing: '',
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

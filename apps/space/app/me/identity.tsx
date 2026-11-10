/**
 * `PF-2d` · Identidad y acceso (`HU-SP-009`, TECH-43): the Fitness ID, how the person
 * is called, how Allfit reaches them and how they sign in.
 *
 * **Each thing in its own place** (criterion 2): no permissions and no gyms here, and
 * the email, the phone and the password live here rather than in rows of their own in
 * Perfil. The name and the username are corrected from this screen (`HU-SP-098`
 * criterion 6, `OP-IDN-063`), each in its own sheet: changing one never asks for the
 * other. Changing a contact (`HU-SP-076`) or the password (`HU-SP-005`) is not built
 * yet, so those rows show their state and say «Pronto».
 *
 * A username somebody else holds comes back as a conflict and lands on the field, with
 * the onboarding's own words, without saying who has it.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useTheme } from '@allfitone/react-native/theme'
import type { IconName } from '@allfitone/icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Children, useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { ApiError } from '../../src/client'
import {
  activeSince,
  cleanUsername,
  contactState,
  identityInitials,
  nameProblem,
  type ContactState,
  type OwnName,
  type SpaceIdentity,
} from '../../src/client/fitness-profile'
import { correctName, readIdentity } from '../../src/client/profile-transport'
import { EditSheetHeader, FormNote } from '../../src/components/fitness-profile-ui'
import { SectionLabel } from '../../src/components/pro-ui'

const UNREADABLE = 'No pudimos leer tu identidad. Revisa tu conexión e inténtalo otra vez.'
const SAVE_FAILED = 'No pudimos guardarlo. Inténtalo otra vez.'
const TAKEN = 'Ese usuario ya está en uso. Prueba con otro.'
const FIELD_PROBLEM: Record<keyof OwnName, string> = {
  given_name: 'Escribe tu nombre.',
  family_name: 'Escribe tu apellido.',
  username: 'Entre 3 y 30 letras, números o guion bajo, y empieza con una letra.',
}
const CARD = ['#0E3B45', '#08141C'] as const

type Editing = 'name' | 'username'

const SHEETS: Record<
  Editing,
  { readonly title: string; readonly subtitle: string; readonly fields: (keyof OwnName)[] }
> = {
  name: {
    title: 'Cómo te llamas',
    subtitle: 'Así te nombra la app y así te ven tus gimnasios.',
    fields: ['given_name', 'family_name'],
  },
  username: {
    title: 'Tu usuario',
    subtitle: 'Es único y te identifica: nadie más puede tenerlo.',
    fields: ['username'],
  },
}

export interface IdentitySources {
  readonly readIdentity: () => Promise<SpaceIdentity>
  readonly correctName: (name: OwnName) => Promise<OwnName>
}

const LIVE: IdentitySources = { readIdentity, correctName }

export default function IdentityRoute() {
  return <IdentityScreen sources={LIVE} />
}

/** The screen given where its data comes from; the route passes the real sources. */
export function IdentityScreen({
  sources,
  initiallyEditing,
}: {
  readonly sources: IdentitySources
  readonly initiallyEditing?: Editing
}) {
  const router = useRouter()
  const theme = useTheme()
  const [identity, setIdentity] = useState<SpaceIdentity | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)
  const [editing, setEditing] = useState<Editing | undefined>(initiallyEditing)

  useEffect(() => {
    let active = true
    sources
      .readIdentity()
      .then((read) => active && setIdentity(read))
      .catch(() => active && setUnreadable(true))
    return () => {
      active = false
    }
  }, [sources])

  const fullName = identity ? `${identity.given_name} ${identity.family_name}` : ''
  const phone = identity
    ? contactState({ value: identity.phone.number, verified: identity.phone.verified })
    : 'missing'

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
                  onEdit={() => setEditing('name')}
                />
                <IdentityRow
                  icon="people"
                  label="Usuario"
                  value={identity.username ?? 'Sin usuario'}
                  caption="Único: nadie más puede tenerlo."
                  onEdit={() => setEditing('username')}
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
                  value={identity.phone.number ?? 'Sin teléfono'}
                  {...phoneCaption(phone)}
                  state={phone}
                  soon
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

      {identity
        ? (['name', 'username'] as const).map((sheet) => (
            <NameSheet
              key={sheet}
              sheet={sheet}
              visible={editing === sheet}
              identity={identity}
              correct={sources.correctName}
              onDismiss={() => setEditing(undefined)}
              onSaved={(name) => {
                setIdentity({ ...identity, ...name })
                setEditing(undefined)
              }}
            />
          ))
        : null}
    </Screen>
  )
}

function phoneCaption(state: ContactState): { caption?: string } {
  return state === 'unverified' ? { caption: 'Sin verificar no te llegan avisos por SMS.' } : {}
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

function NameSheet({
  sheet,
  visible,
  identity,
  correct,
  onDismiss,
  onSaved,
}: {
  readonly sheet: Editing
  readonly visible: boolean
  readonly identity: SpaceIdentity
  readonly correct: (name: OwnName) => Promise<OwnName>
  readonly onDismiss: () => void
  readonly onSaved: (name: OwnName) => void
}) {
  const [given, setGiven] = useState(identity.given_name)
  const [family, setFamily] = useState(identity.family_name)
  const [username, setUsername] = useState(identity.username ?? '')
  const [open, setOpen] = useState(visible)
  const [taken, setTaken] = useState<string | undefined>(undefined)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  // Every opening starts from the name in force, never from an abandoned edit.
  if (open !== visible) {
    setOpen(visible)
    if (visible) {
      setGiven(identity.given_name)
      setFamily(identity.family_name)
      setUsername(identity.username ?? '')
      setTaken(undefined)
      setTried(false)
      setFailure(undefined)
    }
  }

  const name: OwnName = {
    given_name: given,
    family_name: family,
    username: cleanUsername(username),
  }
  const { title, subtitle, fields } = SHEETS[sheet]
  const problem = nameProblem(name, fields)
  const shown = (field: keyof OwnName) =>
    field === 'username' && taken !== undefined && taken === name.username
      ? TAKEN
      : tried && problem === field
        ? FIELD_PROBLEM[field]
        : undefined

  const errorOf = (field: keyof OwnName): { error?: string } => {
    const message = shown(field)
    return message === undefined ? {} : { error: message }
  }

  const save = async () => {
    setTried(true)
    if (problem) return
    setSaving(true)
    setFailure(undefined)
    try {
      onSaved(await correct(name))
    } catch (cause) {
      if (cause instanceof ApiError && cause.failure === 'conflict') setTaken(name.username)
      else setFailure(SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} hideTitle>
      <View style={styles.sheet}>
        <EditSheetHeader title={title} subtitle={subtitle} onClose={onDismiss} />
        {sheet === 'name' ? (
          <>
            <TextField
              label="Nombre"
              value={given}
              onChangeText={setGiven}
              autoComplete="given-name"
              textContentType="givenName"
              {...errorOf('given_name')}
            />
            <TextField
              label="Apellido"
              value={family}
              onChangeText={setFamily}
              autoComplete="family-name"
              textContentType="familyName"
              {...errorOf('family_name')}
            />
          </>
        ) : (
          <TextField
            label="Usuario"
            value={username === '' ? '' : `@${cleanUsername(username)}`}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            {...errorOf('username')}
          />
        )}
        {failure ? <InlineAlert message={failure} /> : null}
        <Button label="Guardar" loading={saving} onPress={() => void save()} />
      </View>
    </Sheet>
  )
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
  sheet: { gap: 14, paddingBottom: 8 },
})

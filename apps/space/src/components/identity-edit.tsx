/**
 * The screens that edit «Identidad y acceso» (TECH-43): name and family name, username,
 * phone, and the list of country codes the phone picks from (`PF-E7` to `PF-E10`).
 *
 * **A screen each, not a sheet.** A sheet with a text field rides up with the keyboard and
 * covers what it edits; a pushed screen keeps its header still and lifts only «Guardar»
 * above the keyboard. Each reads the identity in force when it opens, so an edit never
 * starts from what another screen remembered, and goes back once it is saved.
 *
 * **The phone is two parts on screen and one on the server** (ADR-050): the country code
 * from a list of the Americas, and the number beside it. Removing it is its own button,
 * because an empty field that saves as «no phone» is a surprise.
 *
 * A username somebody else holds comes back as a conflict and lands on the field, with
 * the onboarding's own words, without saying who has it.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'

import { ApiError } from '../client'
import {
  cleanUsername,
  nameProblem,
  type ContactPhone,
  type OwnName,
  type SpaceIdentity,
} from '../client/fitness-profile'
import {
  DEFAULT_COUNTRY,
  chooseCountry,
  countryOf,
  joinPhone,
  searchCountries,
  splitPhone,
  takeChosenCountry,
  type Country,
} from '../client/phone-countries'
import { correctName, correctPhone, readIdentity } from '../client/profile-transport'
import { FormNote } from './fitness-profile-ui'

export interface IdentitySources {
  readonly readIdentity: () => Promise<SpaceIdentity>
  readonly correctName: (name: OwnName) => Promise<OwnName>
  readonly correctPhone: (phone: string | null) => Promise<ContactPhone>
}

export const LIVE_IDENTITY: IdentitySources = { readIdentity, correctName, correctPhone }

const UNREADABLE = 'No pudimos leer tu identidad. Revisa tu conexión e inténtalo otra vez.'
const SAVE_FAILED = 'No pudimos guardarlo. Inténtalo otra vez.'
const TAKEN = 'Ese usuario ya está en uso. Prueba con otro.'
const PHONE_PROBLEM = 'Escribe solo el número, por ejemplo 310 555 0142.'
const FIELD_PROBLEM: Record<keyof OwnName, string> = {
  given_name: 'Escribe tu nombre.',
  family_name: 'Escribe tu apellido.',
  username: 'Entre 3 y 30 letras, números o guion bajo, y empieza con una letra.',
}

export type NameEditing = 'name' | 'username'

const NAME_SCREENS: Record<
  NameEditing,
  { readonly title: string; readonly subtitle: string; readonly fields: (keyof OwnName)[] }
> = {
  name: {
    title: 'Nombre y apellido',
    subtitle: 'Así te nombra la app y así te ven tus gimnasios.',
    fields: ['given_name', 'family_name'],
  },
  username: {
    title: 'Usuario',
    subtitle: 'Es único y te identifica: nadie más puede tenerlo.',
    fields: ['username'],
  },
}

function useIdentity(sources: IdentitySources) {
  const [identity, setIdentity] = useState<SpaceIdentity | undefined>(undefined)
  const [unreadable, setUnreadable] = useState(false)
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
  return { identity, unreadable }
}

function Header({ title }: { readonly title: string }) {
  const router = useRouter()
  return (
    <View style={styles.header}>
      <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
      <Text role="control" size="xl" accessibilityRole="header">
        {title}
      </Text>
    </View>
  )
}

function EditScreen({
  title,
  subtitle,
  failure,
  saving,
  onSave,
  children,
}: {
  readonly title: string
  readonly subtitle: string
  readonly failure: string | undefined
  readonly saving: boolean
  readonly onSave: (() => void) | undefined
  readonly children: ReactNode
}) {
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.grow}
      >
        <Header title={title} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text role="body" size="sm" color="secondary">
            {subtitle}
          </Text>
          {children}
          {failure ? <InlineAlert message={failure} /> : null}
        </ScrollView>
        {onSave ? (
          <View style={styles.footer}>
            <Button label="Guardar" loading={saving} onPress={onSave} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  )
}

/** `PF-E7` and `PF-E8`: the name, or the username, each alone. */
export function NameEditScreen({
  editing,
  sources,
}: {
  readonly editing: NameEditing
  readonly sources: IdentitySources
}) {
  const router = useRouter()
  const { identity, unreadable } = useIdentity(sources)
  const [given, setGiven] = useState('')
  const [family, setFamily] = useState('')
  const [username, setUsername] = useState('')
  const [taken, setTaken] = useState<string | undefined>(undefined)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!identity) return
    setGiven(identity.given_name)
    setFamily(identity.family_name)
    setUsername(identity.username ?? '')
  }, [identity])

  const name: OwnName = {
    given_name: given,
    family_name: family,
    username: cleanUsername(username),
  }
  const { title, subtitle, fields } = NAME_SCREENS[editing]
  const problem = nameProblem(name, fields)
  const errorOf = (field: keyof OwnName): { error?: string } => {
    if (field === 'username' && taken !== undefined && taken === name.username) {
      return { error: TAKEN }
    }
    return tried && problem === field ? { error: FIELD_PROBLEM[field] } : {}
  }

  const save = async () => {
    setTried(true)
    if (problem) return
    setSaving(true)
    setFailure(undefined)
    try {
      await sources.correctName(name)
      router.back()
    } catch (cause) {
      if (cause instanceof ApiError && cause.failure === 'conflict') setTaken(name.username)
      else setFailure(SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditScreen
      title={title}
      subtitle={subtitle}
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      onSave={identity ? () => void save() : undefined}
    >
      {identity && editing === 'name' ? (
        <>
          <TextField
            label="Nombre"
            value={given}
            onChangeText={setGiven}
            autoComplete="given-name"
            textContentType="givenName"
            autoFocus
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
      ) : null}
      {identity && editing === 'username' ? (
        <TextField
          label="Usuario"
          value={username === '' ? '' : `@${cleanUsername(username)}`}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoFocus
          {...errorOf('username')}
        />
      ) : null}
    </EditScreen>
  )
}

/** `PF-E9`: the country code from a list, the number beside it. */
export function PhoneEditScreen({ sources }: { readonly sources: IdentitySources }) {
  const router = useRouter()
  const theme = useTheme()
  const { identity, unreadable } = useIdentity(sources)
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [national, setNational] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!identity) return
    const split = splitPhone(identity.phone.number)
    setCountry(split.country)
    setNational(split.national)
  }, [identity])

  // The list hands back what was picked when this screen shows again.
  useFocusEffect(
    useCallback(() => {
      const picked = takeChosenCountry()
      if (picked) setCountry(picked)
    }, []),
  )

  const phone = joinPhone(country, national)
  const shown = countryOf(country)

  const write = async (value: string | null) => {
    setSaving(true)
    setFailure(undefined)
    try {
      await sources.correctPhone(value)
      router.back()
    } catch {
      setFailure(SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    setTried(true)
    if (phone === undefined) return
    void write(phone)
  }

  return (
    <EditScreen
      title="Teléfono"
      subtitle="Es solo un dato de contacto: no te enviamos SMS."
      failure={unreadable ? UNREADABLE : failure}
      saving={saving}
      onSave={identity ? save : undefined}
    >
      {identity ? (
        <>
          <View style={styles.phone}>
            <Text role="label" size="xs" color="secondary">
              TELÉFONO
            </Text>
            <View style={styles.phoneRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Indicativo: ${shown?.name ?? ''} +${shown?.dial ?? ''}`}
                accessibilityHint="Elegir el país"
                onPress={() =>
                  router.push({ pathname: '/me/phone-country', params: { selected: country } })
                }
                style={({ pressed }) => [
                  styles.code,
                  {
                    backgroundColor: theme.color.background.surfaceMuted,
                    borderColor: theme.color.border.subtle,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.grow}>
                  <Text role="body" size="2xs" color="secondary" numberOfLines={1}>
                    {shown?.name ?? ''}
                  </Text>
                  <Text role="control" size="md">
                    {`+${shown?.dial ?? ''}`}
                  </Text>
                </View>
                <FoundationIcon
                  name="expand"
                  size="xs"
                  color={theme.color.icon.secondary}
                  decorative
                />
              </Pressable>
              <TextField
                label="Número"
                hideLabel
                value={national}
                onChangeText={setNational}
                keyboardType="phone-pad"
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                placeholder="310 555 0142"
                autoFocus
                style={styles.grow}
                {...(tried && phone === undefined ? { error: PHONE_PROBLEM } : {})}
              />
            </View>
          </View>
          <FormNote text="Solo el número, sin el indicativo: lo eliges a la izquierda." />
          {identity.phone.number ? (
            <View style={styles.start}>
              <Button
                label="Quitar mi teléfono"
                variant="ghost"
                icon="remove"
                onPress={() => void write(null)}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </EditScreen>
  )
}

/** `PF-E10`: the countries of the Americas, the picked one first. */
export function CountryCodeScreen() {
  const router = useRouter()
  const theme = useTheme()
  const { selected = DEFAULT_COUNTRY } = useLocalSearchParams<{ selected?: string }>()
  const [query, setQuery] = useState('')
  const found = searchCountries(query)
  const picked = countryOf(selected)
  const rest = query === '' ? found.filter((country) => country.iso !== selected) : found

  const pick = (country: Country) => {
    chooseCountry(country.iso)
    router.back()
  }

  const row = (country: Country, index: number) => {
    const on = country.iso === selected
    return (
      <Pressable
        key={country.iso}
        accessibilityRole="button"
        accessibilityLabel={`${country.name}, +${country.dial}`}
        accessibilityState={{ selected: on }}
        onPress={() => pick(country)}
        style={({ pressed }) => [
          styles.country,
          index > 0 && { borderTopWidth: 1, borderTopColor: theme.color.border.subtle },
          pressed && styles.pressed,
        ]}
      >
        <Text role={on ? 'control' : 'body'} size="md" style={styles.grow}>
          {country.name}
        </Text>
        <Text role="control" size="sm" color={on ? 'accent' : 'secondary'}>
          {`+${country.dial}`}
        </Text>
        {on ? (
          <FoundationIcon name="check" size="sm" color={theme.color.icon.accent} decorative />
        ) : null}
      </Pressable>
    )
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Indicativo del país" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TextField
          label="Buscar"
          hideLabel
          value={query}
          onChangeText={setQuery}
          placeholder="Busca un país o un indicativo"
          autoCorrect={false}
        />
        <View
          style={[
            styles.list,
            {
              backgroundColor: theme.color.background.surface,
              borderColor: theme.color.border.subtle,
            },
          ]}
        >
          {query === '' && picked ? (
            <>
              {row(picked, 0)}
              <View style={[styles.divider, { borderTopColor: theme.color.border.subtle }]}>
                <Text role="label" size="2xs" color="muted">
                  TODOS LOS PAÍSES
                </Text>
              </View>
            </>
          ) : null}
          {rest.map(row)}
          {rest.length === 0 ? (
            <Text role="body" size="sm" color="muted" style={styles.empty}>
              Ningún país de la lista coincide.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 12 },
  content: { gap: 18, paddingTop: 4, paddingBottom: 32 },
  footer: { paddingTop: 12, paddingBottom: 8 },
  phone: { gap: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  code: {
    width: 118,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  start: { alignSelf: 'flex-start' },
  list: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 16 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  divider: { borderTopWidth: 1, paddingTop: 14, paddingBottom: 6 },
  empty: { paddingVertical: 16 },
  pressed: { opacity: 0.7 },
})

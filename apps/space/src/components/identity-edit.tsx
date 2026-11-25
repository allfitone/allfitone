/**
 * The screens that edit «Identidad y acceso» (TECH-43, TECH-44): name and family name,
 * username, phone, the list of country codes the phone picks from, and the email with its
 * code (`PF-E7` to `PF-E12`).
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
 *
 * **The email changes in two steps** (`OP-IDN-021`, `OP-IDN-022`): asking sends a code to
 * the new address and moves nothing; the code hands the change to the worker, which
 * updates WorkOS first. The code screen reads the address from the pending change, never
 * from a route parameter, so nothing personal travels in the navigation state.
 */

import { Button } from '@allfitone/react-native/button'
import { CodeField } from '@allfitone/react-native/code-field'
import { ContentGroup } from '@allfitone/react-native/content-row'
import { DisclosureButton } from '@allfitone/react-native/disclosure-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { TextField } from '@allfitone/react-native/text-field'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { ApiError } from '../client'
import {
  cleanUsername,
  emailChangeProgress,
  nameProblem,
  newEmailProblem,
  replacedCodeNote,
  type ContactPhone,
  type EmailChange,
  type OwnName,
  type SpaceIdentity,
} from '../client/fitness-profile'
import {
  DEFAULT_COUNTRY,
  chooseCountry,
  countriesIn,
  countryOf,
  joinPhone,
  searchCountries,
  splitPhone,
  takeChosenCountry,
  type Country,
} from '../client/phone-countries'
import {
  correctName,
  correctPhone,
  readIdentity,
  requestEmailChange,
  verifyEmailChange,
} from '../client/profile-transport'
import { EditHeader, EditScreen } from './edit-screen'
import { EmailChangeProgress } from './email-change-progress'
import type { Dictionary } from '../i18n'
import { useLocale, useText } from '../i18n/use-text'
import { Note } from '@allfitone/react-native/note'

export interface IdentitySources {
  readonly readIdentity: () => Promise<SpaceIdentity>
  readonly correctName: (name: OwnName) => Promise<OwnName>
  readonly correctPhone: (phone: string | null) => Promise<ContactPhone>
  readonly requestEmailChange: (email: string) => Promise<EmailChange>
  readonly verifyEmailChange: (code: string) => Promise<{ outcome: 'applying' }>
}

export const LIVE_IDENTITY: IdentitySources = {
  readIdentity,
  correctName,
  correctPhone,
  requestEmailChange,
  verifyEmailChange,
}

type IdentityText = Dictionary['identity']

export type NameEditing = 'name' | 'username'

const NAME_FIELDS: Record<NameEditing, (keyof OwnName)[]> = {
  name: ['given_name', 'family_name'],
  username: ['username'],
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

/** `PF-E7` and `PF-E8`: the name, or the username, each alone. */
export function NameEditScreen({
  editing,
  sources,
}: {
  readonly editing: NameEditing
  readonly sources: IdentitySources
}) {
  const router = useRouter()
  const text = useText()
  const t = text.identity
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
  const { title, subtitle } = editing === 'name' ? t.name : t.username
  const fields = NAME_FIELDS[editing]
  const problem = nameProblem(name, fields)
  const errorOf = (field: keyof OwnName): { error?: string } => {
    if (field === 'username' && taken !== undefined && taken === name.username) {
      return { error: t.username.taken }
    }
    return tried && problem === field ? { error: t.fieldProblem[field] } : {}
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
      else setFailure(text.common.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditScreen
      title={title}
      subtitle={subtitle}
      failure={unreadable ? t.unreadable : failure}
      saving={saving}
      onSave={identity ? () => void save() : undefined}
    >
      {identity && editing === 'name' ? (
        <>
          <TextField
            label={t.name.given}
            value={given}
            onChangeText={setGiven}
            autoComplete="given-name"
            textContentType="givenName"
            autoFocus
            {...errorOf('given_name')}
          />
          <TextField
            label={t.name.family}
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
          label={t.username.field}
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
  const text = useText()
  const locale = useLocale()
  const t = text.identity
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
  const shown = countryOf(country, countriesIn(t.countries, locale))

  const write = async (value: string | null) => {
    setSaving(true)
    setFailure(undefined)
    try {
      await sources.correctPhone(value)
      router.back()
    } catch {
      setFailure(text.common.saveFailed)
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
      title={t.phone.title}
      subtitle={t.phone.subtitle}
      failure={unreadable ? t.unreadable : failure}
      saving={saving}
      onSave={identity ? save : undefined}
    >
      {identity ? (
        <>
          <View style={styles.phone}>
            <Text role="label" size="xs" color="secondary">
              {t.phone.label}
            </Text>
            <View style={styles.phoneRow}>
              <DisclosureButton
                variant="select"
                label={shown?.name ?? ''}
                value={`+${shown?.dial ?? ''}`}
                accessibilityLabel={t.phone.code(shown?.name ?? '', shown?.dial ?? '')}
                onPress={() =>
                  router.push({ pathname: '/me/phone-country', params: { selected: country } })
                }
                style={styles.code}
              />
              <TextField
                label={t.phone.number}
                hideLabel
                value={national}
                onChangeText={setNational}
                keyboardType="phone-pad"
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                placeholder="310 555 0142"
                autoFocus
                style={styles.grow}
                {...(tried && phone === undefined ? { error: t.phone.problem } : {})}
              />
            </View>
          </View>
          <Note>{t.phone.note}</Note>
          {identity.phone.number ? (
            <View style={styles.start}>
              <Button
                label={t.phone.remove}
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
  const t = useText().identity
  const locale = useLocale()
  const { selected = DEFAULT_COUNTRY } = useLocalSearchParams<{ selected?: string }>()
  const [query, setQuery] = useState('')
  const countries = countriesIn(t.countries, locale)
  const found = searchCountries(query, countries)
  const picked = countryOf(selected, countries)
  const rest = query === '' ? found.filter((country) => country.iso !== selected) : found

  const pick = (country: Country) => {
    chooseCountry(country.iso)
    router.back()
  }

  const row = (country: Country) => {
    const on = country.iso === selected
    return (
      <Pressable
        key={country.iso}
        accessibilityRole="button"
        accessibilityLabel={`${country.name}, +${country.dial}`}
        accessibilityState={{ selected: on }}
        onPress={() => pick(country)}
        style={({ pressed }) => [styles.country, pressed && styles.pressed]}
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
      <EditHeader title={t.country.title} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TextField
          label={t.country.search}
          hideLabel
          value={query}
          onChangeText={setQuery}
          placeholder={t.country.placeholder}
          autoCorrect={false}
        />
        <ContentGroup>
          {query === '' && picked ? (
            <>
              {row(picked)}
              <View style={styles.divider}>
                <Text role="label" size="2xs" color="muted">
                  {t.country.all}
                </Text>
              </View>
            </>
          ) : null}
          {rest.map((country) => row(country))}
          {rest.length === 0 ? (
            <Text role="body" size="sm" color="muted" style={styles.empty}>
              {t.country.none}
            </Text>
          ) : null}
        </ContentGroup>
      </ScrollView>
    </Screen>
  )
}

// The worker applies a change on its next cycle; this watches for it, not forever.
const APPLY_CHECK_MS = 2_000
const APPLY_CHECKS = 45

function emailRequestFailure(cause: unknown, text: Dictionary): string {
  if (cause instanceof ApiError && cause.failure === 'validation-failed') {
    return text.identity.email.refused
  }
  if (cause instanceof ApiError && cause.failure === 'conflict') return text.identity.email.tooSoon
  return text.common.saveFailed
}

/** `PF-E11`: the address in force, the new one, and a code on its way. */
export function EmailEditScreen({ sources }: { readonly sources: IdentitySources }) {
  const router = useRouter()
  const theme = useTheme()
  const text = useText()
  const t: IdentityText = text.identity
  const { identity, unreadable } = useIdentity(sources)
  const [typed, setTyped] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const problem = identity ? newEmailProblem(typed, identity.email.address) : 'shape'
  const fieldError =
    tried && problem === 'shape'
      ? { error: t.email.shapeProblem }
      : tried && problem === 'same'
        ? { error: t.email.same }
        : {}

  const send = async () => {
    setTried(true)
    if (problem) return
    setSaving(true)
    setFailure(undefined)
    try {
      await sources.requestEmailChange(typed.trim())
      router.replace('/me/email-code')
    } catch (cause) {
      setFailure(emailRequestFailure(cause, text))
    } finally {
      setSaving(false)
    }
  }

  return (
    <EditScreen
      title={t.email.title}
      subtitle={t.email.subtitle}
      failure={unreadable ? t.unreadable : failure}
      saving={saving}
      saveLabel={t.email.send}
      onSave={identity ? () => void send() : undefined}
    >
      {identity ? (
        <>
          <View
            style={[
              styles.current,
              {
                backgroundColor: theme.color.background.surface,
                borderColor: theme.color.border.subtle,
              },
            ]}
          >
            <Text role="label" size="xs" color="secondary">
              {t.email.current}
            </Text>
            <Text role="control" size="md">
              {identity.email.address ?? t.rows.noEmail}
            </Text>
          </View>
          <TextField
            label={t.email.field}
            value={typed}
            onChangeText={setTyped}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            autoFocus
            {...fieldError}
          />
          <Note>{t.email.note}</Note>
          {replacedCodeNote(identity.email.pending, t) ? (
            <Note boxed>{replacedCodeNote(identity.email.pending, t) ?? ''}</Note>
          ) : null}
        </>
      ) : null}
    </EditScreen>
  )
}

const CODE_LENGTH = 6

/** Minutes left on the code, never fewer than one while it is still valid. */
function minutesLeft(expiresAt: string): number {
  return Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000))
}

/** `PF-E12`: the six digits from the new inbox. */
export function EmailCodeScreen({ sources }: { readonly sources: IdentitySources }) {
  const router = useRouter()
  const text = useText()
  const t = text.identity.code
  const { identity, unreadable } = useIdentity(sources)
  const [pending, setPending] = useState<EmailChange | null | undefined>(undefined)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [applying, setApplying] = useState<string | undefined>(undefined)
  const [applied, setApplied] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!identity) return
    setPending(identity.email.pending)
    if (identity.email.pending?.status === 'applying') setApplying(identity.email.pending.address)
  }, [identity])

  // Stays until the new address is the one in force, so nobody leaves on a half-done change.
  useEffect(() => {
    if (!applying) return
    let active = true
    let checks = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      checks += 1
      try {
        const read = await sources.readIdentity()
        if (!active) return
        const progress = emailChangeProgress(read.email, applying)
        if (progress === 'done') {
          setApplied(applying)
          setApplying(undefined)
          return
        }
        if (progress === 'failed') {
          setApplying(undefined)
          setPending(null)
          setFailure(t.changeFailed)
          return
        }
      } catch {
        if (!active) return
      }
      if (checks >= APPLY_CHECKS) {
        setApplying(undefined)
        setFailure(t.changeSlow)
        return
      }
      timer = setTimeout(() => void check(), APPLY_CHECK_MS)
    }
    timer = setTimeout(() => void check(), APPLY_CHECK_MS)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [applying, sources, router, t])

  const waiting = !applying && pending?.status === 'awaiting_code' ? pending : undefined

  const confirm = async () => {
    if (applying) return
    if (code.length !== CODE_LENGTH) {
      setFailure(t.digits)
      return
    }
    setSaving(true)
    setFailure(undefined)
    setNotice(undefined)
    try {
      await sources.verifyEmailChange(code)
      setApplying(waiting?.address)
    } catch (cause) {
      setCode('')
      if (cause instanceof ApiError && cause.failure === 'validation-failed') {
        setFailure(t.refused)
      } else if (cause instanceof ApiError && cause.failure === 'conflict') {
        setFailure(t.spent)
      } else {
        setFailure(text.common.saveFailed)
      }
    } finally {
      setSaving(false)
    }
  }

  const resend = async () => {
    if (!waiting) return
    setFailure(undefined)
    setNotice(undefined)
    try {
      setPending(await sources.requestEmailChange(waiting.address))
      setCode('')
      setNotice(t.resent)
    } catch (cause) {
      setFailure(emailRequestFailure(cause, text))
    }
  }

  const subtitle = applying
    ? t.applying(applying)
    : waiting
      ? t.sent(waiting.address, minutesLeft(waiting.expires_at))
      : pending === null
        ? t.nothingPending
        : ''

  const shown = applied ?? applying
  if (shown) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EditHeader title={t.title} />
        <EmailChangeProgress
          address={shown}
          done={applied !== undefined}
          onDone={() => router.back()}
        />
      </Screen>
    )
  }

  return (
    <EditScreen
      title={t.title}
      subtitle={subtitle}
      failure={unreadable ? text.identity.unreadable : failure}
      saving={saving || applying !== undefined}
      saveLabel={t.confirm}
      onSave={waiting || applying ? () => void confirm() : undefined}
    >
      {applying ? <Note>{t.whenDone}</Note> : null}
      {waiting ? (
        <>
          <CodeField
            label={t.field}
            value={code}
            onChangeText={(next) => {
              setFailure(undefined)
              setCode(next)
            }}
            length={CODE_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            editable={!saving}
          />
          <Note>{t.onConfirm}</Note>
          {notice ? <InlineAlert message={notice} tone="success" /> : null}
          <View style={styles.resend}>
            <Text role="body" size="sm" color="secondary">
              {t.notArrived}
            </Text>
            <Button
              label={t.resend}
              variant="ghost"
              size="sm"
              accessibilityLabel={t.resendLabel}
              onPress={() => void resend()}
            />
          </View>
          {/* A code sent to a mistyped address never arrives: this is the way out. */}
          <View style={styles.resend}>
            <Text role="body" size="sm" color="secondary">
              {t.wrongEmail}
            </Text>
            <Button
              label={t.useAnother}
              variant="ghost"
              size="sm"
              accessibilityLabel={t.useAnotherLabel}
              onPress={() => router.replace('/me/email')}
            />
          </View>
        </>
      ) : null}
    </EditScreen>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  content: { gap: 18, paddingTop: 4, paddingBottom: 32 },
  phone: { gap: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  code: { width: 118 },
  start: { alignSelf: 'flex-start' },
  country: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  divider: { paddingTop: 14, paddingBottom: 6 },
  empty: { paddingVertical: 16 },
  pressed: { opacity: 0.7 },
  current: { gap: 4, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  resend: { flexDirection: 'row', alignItems: 'center' },
})

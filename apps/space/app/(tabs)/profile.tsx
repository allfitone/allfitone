/**
 * `PF-1` · Perfil — the index of the person's account, and `HU-SP-003`'s way out.
 *
 * The screen is a table of contents: who is signed in, the plan they are on, and then
 * the account in five groups — the person, their account and access, their gyms,
 * privacy, and plan and payments. The account sits right after the person because it is
 * where they change who they are and how they sign in. Each row carries the one fact that
 * tells somebody whether to open it.
 *
 * **Only what exists opens.** Most of these parts of the account are their own stories
 * and have no screen yet. They are listed so the shape of the account is visible, but
 * marked «Pronto» and not pressable: a chevron that leads nowhere is a broken promise.
 * Facts come only from what the API answers — the name from the training profile, the
 * plan and the gyms from `GET /pro` — and where there is no fact, the row says what it
 * holds instead of inventing one.
 *
 * **The confirmation is not ceremony.** `HU-SP-003` criterion 2 requires a warning
 * when a workout has not reached the server, because erasing the tokens takes it with
 * it. So the first press asks and the second forgets — and the flow, not this screen,
 * decides which is which.
 */

import { Badge } from '@allfitone/react-native/badge'
import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import Constants from 'expo-constants'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { createSpaceExecutionFlow } from '../../src/client/execution-transport'
import { forgetExerciseLibrary } from '../../src/client/exercise-library'
import { foundingMemberLabel } from '../../src/client/fitness-profile'
import { readIdentity } from '../../src/client/profile-transport'
import { gymsOf, sourceLine, type ProStatus } from '../../src/client/pro'
import { createSpaceProFlow } from '../../src/client/pro-transport'
import { initialsOf, paymentsCaption, planCaption } from '../../src/client/profile'
import type { SignOutFlow } from '../../src/client/sign-out'
import { createSpaceSignOutFlow } from '../../src/client/sign-out-transport'
import { latestOf, tenths } from '../../src/client/body'
import { readBodyRecords } from '../../src/client/body-transport'
import { deviceTimezone } from '../../src/client/timezone'
import { PlanCard, ProfileGroup, ProfileRow, ProTeaser } from '../../src/components/profile-ui'
import { DOCK_HEIGHT } from '../../src/components/tab-bar'

const LOCAL_ONLY =
  'Cerramos sesión en este teléfono. No pudimos avisarle al servidor, así que hazlo otra vez cuando tengas conexión.'

export interface ProfileSources {
  readonly readName: () => Promise<string>
  /** The badge already worded; undefined for somebody who holds no number. */
  readonly readFounding: () => Promise<string | undefined>
  readonly readPlan: () => Promise<ProStatus>
  /** The latest weight, already worded; undefined when none was ever recorded. */
  readonly readWeight: () => Promise<string | undefined>
  readonly signOut: SignOutFlow
}

export default function ProfileRoute() {
  const sources = useMemo<ProfileSources>(() => {
    const training = createSpaceExecutionFlow()
    const pro = createSpaceProFlow()
    return {
      readName: () =>
        training.readToday(deviceTimezone()).then((today) => today.profile.given_name),
      readFounding: () =>
        readIdentity().then((identity) => foundingMemberLabel(identity.founding_member_number)),
      readPlan: () => pro.read(),
      readWeight: () =>
        readBodyRecords().then((records) => {
          const latest = latestOf(records, 'body_weight')
          return latest ? `${tenths(latest.value)} kg` : undefined
        }),
      signOut: createSpaceSignOutFlow(),
    }
  }, [])
  return <ProfileScreen sources={sources} />
}

/** The screen itself, given where its facts come from: the route passes the real ones. */
export function ProfileScreen({ sources }: { readonly sources: ProfileSources }) {
  const router = useRouter()
  const theme = useTheme()
  const [name, setName] = useState('')
  const [founding, setFounding] = useState<string | undefined>(undefined)
  const [plan, setPlan] = useState<ProStatus | undefined>(undefined)
  const [weight, setWeight] = useState<string | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      let active = true
      // A fact that cannot load leaves its row quieter, not the screen in error.
      sources
        .readName()
        .then((read) => active && setName(read))
        .catch(() => undefined)
      sources
        .readFounding()
        .then((read) => active && setFounding(read))
        .catch(() => undefined)
      sources
        .readPlan()
        .then((read) => active && setPlan(read))
        .catch(() => undefined)
      sources
        .readWeight()
        .then((read) => active && setWeight(read))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [sources]),
  )

  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const leave = async (force: boolean) => {
    setBusy(true)
    setWarning(false)
    try {
      const outcome = await sources.signOut.signOut(force ? { force: true } : undefined)
      if (outcome.state === 'unsynced-workout') {
        setWarning(true)
        return
      }
      // Nothing personal is in it, but a cache that outlives the session it was read
      // under is a cache nobody can reason about.
      forgetExerciseLibrary()
      // Replaced, not pushed: there must be no way back into a signed-out session.
      router.replace('/welcome')
      if (outcome.state === 'signed-out-locally') setNotice(LOCAL_ONLY)
    } finally {
      setBusy(false)
    }
  }

  const initials = initialsOf(name)
  const gyms = plan ? gymsOf(plan) : []
  const version = Constants.expoConfig?.version

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text role="control" size="2xl" accessibilityRole="header">
          Perfil
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {notice ? <InlineAlert message={notice} /> : null}

        <View style={styles.who}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: theme.color.accent.tonal,
                borderColor: theme.color.accent.tonalBorder,
              },
            ]}
          >
            {initials ? (
              <Text role="display" size="2xl">
                {initials}
              </Text>
            ) : (
              <FoundationIcon
                name="person"
                size="lg"
                color={theme.color.icon.secondary}
                decorative
              />
            )}
          </View>
          <View style={styles.grow}>
            {name ? (
              <Text role="control" size="lg">
                {name}
              </Text>
            ) : null}
            <Text role="body" size="xs" color="secondary">
              Fitness ID activo
            </Text>
            {founding ? (
              <View style={styles.founding}>
                <Badge label={founding} tone="accent" />
              </View>
            ) : null}
          </View>
        </View>

        {plan ? (
          <PlanCard
            pro={plan.is_pro}
            caption={sourceLine(plan)}
            onPress={() => router.push('/pro')}
          />
        ) : null}
        {plan && !plan.is_pro ? <ProTeaser onPress={() => router.push('/pro/plans')} /> : null}

        <ProfileGroup label="Tú">
          <ProfileRow
            icon="progress"
            title="Progreso"
            caption="Tu entrenamiento, semana a semana"
            end="open"
            onPress={() => router.push('/progress')}
          />
          <ProfileRow
            icon="person"
            title="Cuerpo"
            caption="Peso, medidas y fotos"
            end="open"
            value={weight}
            onPress={() => router.push('/body')}
          />
          <ProfileRow
            icon="person"
            title="Perfil fitness"
            caption="Objetivo, cómo entrenas y con qué"
            end="open"
            onPress={() => router.push('/me/fitness')}
          />
          <ProfileRow
            icon="heart"
            title="Dolor y limitaciones"
            caption="Solo lo ve quien tenga ese permiso"
            end="open"
            alert
            onPress={() => router.push('/me/health')}
          />
        </ProfileGroup>

        <ProfileGroup label="Cuenta">
          <ProfileRow
            icon="person"
            title="Identidad y acceso"
            caption="Fitness ID, correo, teléfono y contraseña"
            end="open"
            onPress={() => router.push('/me/identity')}
          />
          <ProfileRow
            icon="notification"
            title="Avisos"
            caption="Qué te avisamos y por dónde"
            end="soon"
          />
          <ProfileRow
            icon="settings"
            title="Preferencias"
            caption="Kilos, kilómetros e idioma"
            end="soon"
          />
          <ProfileRow
            icon="activity"
            title="Apple Health"
            caption="Publica tus entrenos"
            end="soon"
          />
        </ProfileGroup>

        <ProfileGroup label="Tus gimnasios">
          {gyms.length > 0 ? (
            gyms.map((gym) => (
              <ProfileRow
                key={gym.organization_id}
                icon="organization"
                title={gym.organization_name}
                caption="Te incluye Allfit Pro"
                end="open"
                onPress={() => router.push('/gyms')}
              />
            ))
          ) : (
            <ProfileRow
              icon="organization"
              title="Sin gimnasio"
              caption="Si un gimnasio te invita, aparece aquí"
              end="none"
            />
          )}
          <ProfileRow
            icon="history"
            title="Relaciones anteriores"
            caption="Las que ya terminaron"
            end="open"
            onPress={() => router.push('/gyms')}
          />
        </ProfileGroup>

        <ProfileGroup label="Privacidad">
          <ProfileRow
            icon="permissions"
            title="Lo que compartes"
            caption="Por gimnasio y categoría"
            end="open"
            onPress={() => router.push('/sharing')}
          />
          <ProfileRow
            icon="locked"
            title="Sesiones ocultas"
            caption="Entrenos que no compartes"
            end="soon"
          />
          <ProfileRow
            icon="remove"
            title="Eliminar mis datos"
            caption="Por categoría o toda la cuenta"
            end="soon"
          />
        </ProfileGroup>

        <ProfileGroup label="Plan y pagos">
          <ProfileRow
            icon="favourite"
            title="Tu plan"
            caption={plan ? planCaption(plan) : undefined}
            end="open"
            onPress={() => router.push('/pro')}
          />
          <ProfileRow
            icon="frequency"
            title="Tus pagos"
            caption={plan ? paymentsCaption(plan) : undefined}
            end="open"
            onPress={() => router.push('/pro/payments')}
          />
          {/* A gym plan is not Pro: the gym sets the price and charges it through its own
              gateway. Both are money, so they belong in the same group. */}
          <ProfileRow
            icon="organization"
            title="Planes de gimnasio"
            caption="Los que ofrece tu gimnasio y los que pagas"
            end="open"
            onPress={() => router.push('/subscriptions')}
          />
        </ProfileGroup>

        <Button
          label="Cerrar sesión"
          variant="outlineDanger"
          loading={busy}
          disabled={busy}
          style={styles.leave}
          onPress={() => void leave(false)}
        />

        <Text role="body" size="2xs" color="muted" align="center">
          {version ? `Versión ${version} · Allfit Space` : 'Allfit Space'}
        </Text>
      </ScrollView>

      <Sheet
        visible={warning}
        onDismiss={() => setWarning(false)}
        title="Tienes un entrenamiento sin terminar"
      >
        <View style={styles.sheetBody}>
          <Text role="body" size="sm" color="secondary">
            Dejaste una sesión abierta y todavía no llegó al servidor. Si cierras sesión ahora, se
            pierde lo que registraste en ella.
          </Text>
          <Button
            label="Volver al entrenamiento"
            onPress={() => {
              setWarning(false)
              router.replace('/today')
            }}
          />
          <Button
            label="Cerrar sesión de todas formas"
            variant="ghost"
            onPress={() => void leave(true)}
          />
        </View>
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  // Today's sign-out pill is 52 tall; the DS md button is 44.
  leave: { minHeight: 52 },
  header: { paddingTop: 6, paddingBottom: 12 },
  content: { gap: 18, paddingTop: 4, paddingBottom: DOCK_HEIGHT + 40 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: 3 },
  founding: { alignSelf: 'flex-start', marginTop: 5 },
  sheetBody: { gap: 12 },
})

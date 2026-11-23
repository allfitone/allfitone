'use client'

/**
 * Mi cuenta: the account a person signs in with, and the optional professional
 * profile that travels with it.
 *
 * Shaped after the library (`organization-content.tsx`), the screen the other
 * registers copy. Three things follow from that, and each replaces something
 * this screen used to do differently from every other one.
 *
 * **The sections are always the same three.** The screen used to be a flat
 * stack for a person with no professional profile and a set of tabs for a
 * person with one, so the way to move around it depended on data the reader
 * cannot see. Now the profile, the memberships and the preferences are always
 * present; what changes is which one opens first and what the first one holds.
 * A person who only administers spaces lands on «Vinculaciones».
 *
 * **Every tab is a section of the account.** The old set mixed two levels: two
 * tabs were sections of the professional profile, one was the account's
 * memberships, and the account's theme sat outside the tabs entirely — rightly,
 * since it is not part of the profile, but with nowhere of its own to live. The
 * profile is now one tab that holds its own sections, so the strip announced as
 * «Secciones de mi cuenta» is exactly that.
 *
 * **A panel is read only while open.** The professional catalogues are fetched
 * when that tab is open and something there needs them, never because the tab
 * exists. Someone who never opens it never pays for it, which is what the
 * screen used to get by not drawing the tab at all.
 *
 * No badge names a state the product does not have. `StudioMe` carries only
 * `profile` and `memberships`: there is no inactive account and no unpublished
 * profile, so «Cuenta activa» and «Perfil creado» said nothing a reader could
 * act on. The same reasoning already removed «Sin publicar» from the setup
 * screen; this finishes it.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Toaster } from '@allfitone/react/components/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import {
  WorkspaceActions,
  WorkspaceContent,
  WorkspaceEyebrow,
  WorkspaceHeader,
  WorkspaceMain,
  WorkspaceShell,
  WorkspaceTitle,
} from '@allfitone/react/components/workspace-shell'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { AccountTheme } from './account-theme'
import { LogoutForm } from './logout-form'
import { ProfessionalCredentials } from './professional-credentials'
import { ProfessionalMemberships } from './professional-memberships'
import { ProfessionalPresentation } from './professional-presentation'
import { LoadingCard } from './studio-frame'
import { StudioWordmark } from './studio-wordmark'
import { StudioApiError, type ProfessionalCatalogItem, type StudioMe } from '@/lib/studio-api'
import { useCompactViewport } from '@/lib/use-compact-viewport'
import {
  professionalCredentialTypesQueryOptions,
  professionalSpecialtiesQueryOptions,
  studioMeQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

/** The three sections of the account, in the order the strip shows them. */
type AccountTab = 'profile' | 'spaces' | 'preferences'

function isAccountTab(value: unknown): value is AccountTab {
  return value === 'profile' || value === 'spaces' || value === 'preferences'
}

export function ProfessionalProfileScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [setupStarted, setSetupStarted] = useState(false)
  // Null until the reader chooses, so the first open can follow the account.
  const [chosenTab, setChosenTab] = useState<AccountTab | null>(null)

  const routeSessionFailure = useCallback(
    (error: unknown): boolean => {
      if (
        error instanceof StudioApiError &&
        (error.status === 401 || error.code === 'registration-incomplete')
      ) {
        router.replace('/app')
        return true
      }
      return false
    },
    [router],
  )

  const meQuery = useQuery(studioMeQueryOptions())
  const me = meQuery.data

  /**
   * A person with a profile lands on it; a person without one lands on the
   * spaces they came for. The strip is the same either way — only which tab
   * opens first follows the account.
   */
  const tab: AccountTab = chosenTab ?? (me?.profile ? 'profile' : 'spaces')

  // Read only while that panel is open, and only once it has something to show.
  const catalogsEnabled = tab === 'profile' && Boolean(me?.profile || setupStarted)
  const specialtiesQuery = useQuery({
    ...professionalSpecialtiesQueryOptions(),
    enabled: catalogsEnabled,
  })
  const credentialTypesQuery = useQuery({
    ...professionalCredentialTypesQueryOptions(),
    enabled: catalogsEnabled,
  })
  const catalogError = specialtiesQuery.error ?? credentialTypesQuery.error
  const catalogsReady = Boolean(specialtiesQuery.data && credentialTypesQuery.data)

  useEffect(() => {
    const error = meQuery.error ?? catalogError
    if (error) routeSessionFailure(error)
  }, [catalogError, meQuery.error, routeSessionFailure])

  const refreshMe = useCallback(async (): Promise<StudioMe | undefined> => {
    await queryClient.invalidateQueries({ queryKey: studioQueryKeys.me(), exact: true })
    try {
      return await queryClient.fetchQuery({ ...studioMeQueryOptions(), staleTime: 0 })
    } catch (error) {
      if (!routeSessionFailure(error)) throw error
      return undefined
    }
  }, [queryClient, routeSessionFailure])

  function retryCatalogs(): void {
    void specialtiesQuery.refetch()
    void credentialTypesQuery.refetch()
  }

  return (
    <AccountShell onSpaces={() => router.push('/app')}>
      {/* A refresh of what is already on screen, never a first load. Gated on
          `catalogsEnabled` it also fired while the catalogues loaded for the first
          time, so "Actualizando tu cuenta…" sat above the catalogue loader. */}
      {(meQuery.isFetching && !meQuery.isPending) ||
      (catalogsReady && (specialtiesQuery.isFetching || credentialTypesQuery.isFetching)) ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando tu cuenta…
        </p>
      ) : null}
      {meQuery.isError && me ? (
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos actualizar tu cuenta</AlertTitle>
          <AlertDescription>La información cargada permanece visible.</AlertDescription>
          <AlertAction>
            <Button onClick={() => void meQuery.refetch()}>Reintentar</Button>
          </AlertAction>
        </Alert>
      ) : null}
      {/* The same card as every other wait in Studio. Composed here by hand, a
          lone spinner and a paragraph sat against the page's left edge, and the
          spinner's open arc read as a letter C. */}
      {meQuery.isPending ? (
        <LoadingCard label="Reuniendo tus espacios y opciones personales…" />
      ) : !me ? (
        <div data-profile-state>
          <Alert variant="danger" live="assertive">
            <AlertTitle role="heading" aria-level={1}>
              No pudimos abrir tu cuenta
            </AlertTitle>
            <AlertDescription>
              {meQuery.error instanceof StudioApiError && meQuery.error.status === 503
                ? 'El servicio no está disponible en este momento. Puedes reintentar.'
                : 'Ocurrió un error al reunir la información de tu cuenta.'}
            </AlertDescription>
            <AlertAction>
              <Button onClick={() => void meQuery.refetch()}>Reintentar</Button>
            </AlertAction>
          </Alert>
        </div>
      ) : (
        <AccountSections
          me={me}
          tab={tab}
          onTabChange={setChosenTab}
          specialties={specialtiesQuery.data?.items}
          credentialTypes={credentialTypesQuery.data?.items}
          catalogError={catalogError}
          catalogsReady={catalogsReady}
          onRetryCatalogs={retryCatalogs}
          setupStarted={setupStarted}
          onStartSetup={() => setSetupStarted(true)}
          onCancelSetup={() => setSetupStarted(false)}
          onSessionFailure={routeSessionFailure}
          onRefreshMe={refreshMe}
          onMeChange={(next) => queryClient.setQueryData(studioQueryKeys.me(), next)}
        />
      )}
    </AccountShell>
  )
}

interface ProfessionalPanelProps {
  me: StudioMe
  specialties: ProfessionalCatalogItem[] | undefined
  credentialTypes: ProfessionalCatalogItem[] | undefined
  catalogError: unknown
  catalogsReady: boolean
  onRetryCatalogs: () => void
  setupStarted: boolean
  onStartSetup: () => void
  onCancelSetup: () => void
  onSessionFailure: (error: unknown) => boolean
  onRefreshMe: () => Promise<StudioMe | undefined>
  onMeChange: (me: StudioMe) => void
}

function AccountSections({
  me,
  tab,
  onTabChange,
  ...panel
}: ProfessionalPanelProps & {
  tab: AccountTab
  onTabChange: (tab: AccountTab) => void
}) {
  return (
    <>
      {/* One heading for the page, whichever section is open. The title used to
          change with the state — «Tu cuenta de Studio», «Configura tu perfil
          profesional», the profile's own headline — so one address announced
          itself three ways and a reader could not tell whether they had
          navigated. */}
      <header data-profile-heading>
        <div data-profile-heading-text>
          <WorkspaceEyebrow>Mi cuenta</WorkspaceEyebrow>
          <WorkspaceTitle>Tu cuenta de Studio</WorkspaceTitle>
          <p data-page-header-description>
            Tus vinculaciones con espacios de Studio y tus opciones personales. Si además entrenas o
            prestas servicios, tu perfil profesional vive aquí y viaja contigo.
          </p>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(isAccountTab(value) ? value : 'spaces')}
        data-profile-tabs
      >
        <TabsList variant="line" aria-label="Secciones de mi cuenta">
          {/* One word each, as in the library. «Perfil profesional» took half
              the strip on a phone and left the third tab nowhere to sit; the
              panel opens by saying whose profile it is. */}
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="spaces">Vinculaciones</TabsTrigger>
          <TabsTrigger value="preferences">Preferencias</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          {/* The panel's own rhythm. Its sections used to live in a tab each,
              so nothing ever had to space two of them against each other;
              `TabsContent` brings no spacing of its own, and the credentials
              heading sat flush against the presentation above it. */}
          <div data-profile-panel>
            <ProfessionalPanel me={me} {...panel} />
          </div>
        </TabsContent>
        <TabsContent value="spaces">
          <ProfessionalMemberships memberships={me.memberships} />
        </TabsContent>
        <TabsContent value="preferences">
          <AccountTheme />
        </TabsContent>
      </Tabs>
    </>
  )
}

/**
 * The professional profile, and the invitation to start one.
 *
 * Four states share this panel and the strip above it does not move between
 * them: no profile yet, the catalogues it needs are missing, one is being set
 * up, or one exists.
 */
function ProfessionalPanel({
  me,
  specialties,
  credentialTypes,
  catalogError,
  catalogsReady,
  onRetryCatalogs,
  setupStarted,
  onStartSetup,
  onCancelSetup,
  onSessionFailure,
  onRefreshMe,
  onMeChange,
}: ProfessionalPanelProps) {
  const profile = me.profile

  if (!profile && !setupStarted) {
    return (
      <Empty data-profile-empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="people" decorative />
          </EmptyMedia>
          <EmptyTitle>Todavía no tienes un perfil profesional</EmptyTitle>
          <EmptyDescription>
            Solo lo necesitas si entrenas o prestas servicios. Administrar un espacio no lo
            requiere, y crearlo no cambia tus roles, permisos ni vinculaciones.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onStartSetup}>Crear mi perfil profesional</Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (catalogError && !catalogsReady) {
    return (
      <ProfessionalCatalogError
        retryable={catalogError instanceof StudioApiError && catalogError.status === 503}
        onRetry={onRetryCatalogs}
        onBack={!profile ? onCancelSetup : undefined}
      />
    )
  }

  if (!specialties || !credentialTypes) {
    return <LoadingCard label="Reuniendo especialidades y tipos de credencial…" />
  }

  if (!profile) {
    return (
      <>
        <ProfessionalPresentation
          profile={null}
          specialties={specialties}
          onSessionFailure={onSessionFailure}
          onSaved={(savedProfile) => onMeChange({ ...me, profile: savedProfile })}
        />
        <div data-profile-setup-actions>
          <Button variant="ghost" onClick={onCancelSetup}>
            Cancelar
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <ProfessionalPresentation
        profile={profile}
        specialties={specialties}
        onSessionFailure={onSessionFailure}
        onSaved={(savedProfile) => onMeChange({ ...me, profile: savedProfile })}
      />
      <ProfessionalCredentials
        credentials={profile.credentials}
        credentialTypes={credentialTypes}
        onSessionFailure={onSessionFailure}
        onRefreshMe={onRefreshMe}
        onCredentialsChange={(credentials) =>
          onMeChange({ ...me, profile: { ...profile, credentials } })
        }
      />
    </>
  )
}

function ProfessionalCatalogError({
  retryable,
  onRetry,
  onBack,
}: {
  retryable: boolean
  onRetry: () => void
  onBack?: (() => void) | undefined
}) {
  return (
    <div data-profile-state>
      <Alert variant="danger" live="assertive">
        {/* Level 2: this sits inside a panel now, under the page's own heading.
            Replacing the whole screen it was the only title on it. */}
        <AlertTitle role="heading" aria-level={2}>
          No pudimos preparar el perfil profesional
        </AlertTitle>
        <AlertDescription>
          {retryable
            ? 'Los catálogos profesionales no están disponibles en este momento.'
            : 'Ocurrió un error al reunir los catálogos profesionales.'}
        </AlertDescription>
        <AlertAction>
          <Button onClick={onRetry}>Reintentar</Button>
          {onBack ? (
            <Button variant="ghost" onClick={onBack}>
              Cancelar
            </Button>
          ) : null}
        </AlertAction>
      </Alert>
    </div>
  )
}

function AccountShell({ children, onSpaces }: { children: React.ReactNode; onSpaces: () => void }) {
  const compact = useCompactViewport()

  return (
    <WorkspaceShell>
      <WorkspaceMain data-profile-canvas>
        <WorkspaceHeader data-profile-header>
          {/* `WorkspaceActions` is `shrink-0`, so the brand absorbs every bit of
              squeeze: the 138px wordmark rendered at 14px on a 320px phone. The
              compact mark fits beside both labelled controls from 360px up, and
              below that the CSS hides it — the brand is shown whole or not at
              all, never crushed.

              The mark lost its carrier tile in @allfitone/react 0.14.0, so it is
              now the bare glyph: 10px wide at this height instead of 27px, which
              leaves the row with more slack than the budget above assumed. */}
          <span data-profile-brand>
            <StudioWordmark compact={compact} />
          </span>
          <WorkspaceActions>
            <Button variant="ghost" size="sm" onClick={onSpaces}>
              Mis espacios
            </Button>
            <LogoutForm variant="outline" />
          </WorkspaceActions>
        </WorkspaceHeader>
        <WorkspaceContent data-profile-content>{children}</WorkspaceContent>
        {/* No `richColors`: it swaps the Design System's tokens for the toast
            library's own palette, whose green reads 4.25:1 and misses AA. The
            type still arrives through the icon. */}
        <Toaster position="bottom-right" closeButton />
      </WorkspaceMain>
    </WorkspaceShell>
  )
}

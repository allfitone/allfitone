/**
 * `INV-4` · Tu invitación — and `INV-7` when it is no longer there. HU-SP-016, HU-SP-017.
 *
 * Reached from the emailed link (by token) or from a pending invitation (by id). She
 * decides each thing on its own: the relationship here, each data category on «Decide
 * qué pueden ver» (N-8a). There is no «aceptar todo», and accepting the relationship
 * shares nothing by itself. Nothing leaves the phone until she confirms.
 *
 * An offered program comes after the categories because it depends on one: it stays
 * locked until she shares her training with them, and opens as a no (TECH-362).
 *
 * An invitation that does not exist, expired, or was already answered reads the same:
 * no longer available (ADR-008).
 */

import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { ContentRow } from '@allfitone/react-native/content-row'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ApiError } from '../../src/client'
import {
  type Decision,
  decisionFailure,
  decisionOf,
  invitationExpiry,
  type InvitationKey,
  type InvitationPresentation,
  localDate,
  programAnswer,
  programNote,
  programOutcomeLine,
  programSpan,
  programStanding,
  type ProgramStanding,
  scopeName,
  scopeTitle,
  sharedSummary,
} from '../../src/client/gym-affiliation'
import { createSpaceInvitationFlow } from '../../src/client/gym-affiliation-transport'
import {
  closeDraft,
  currentDraft,
  openDraft,
  takeLinkToken,
  type InvitationDraft,
} from '../../src/client/invitation-draft'
import { deviceTimezone } from '../../src/client/timezone'
import { GymMark, RowCard } from '../../src/components/gym-ui'

const ANSWER: readonly { readonly value: Decision; readonly label: string }[] = [
  { value: 'rejected', label: 'No' },
  { value: 'accepted', label: 'Sí' },
]

export default function InvitationScreen() {
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const flow = useMemo(() => createSpaceInvitationFlow(), [])
  const [draft, setDraft] = useState<InvitationDraft | undefined>(undefined)
  const [gone, setGone] = useState(false)
  const [, redraw] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      // Coming back from N-8a: the draft already holds what she chose there.
      const held = currentDraft()
      if (held) {
        setDraft(held)
        redraw((tick) => tick + 1)
        return
      }
      const token = takeLinkToken()
      const key: InvitationKey | undefined = token
        ? { token }
        : id
          ? { invitationId: id }
          : undefined
      if (!key) {
        setGone(true)
        return
      }
      let active = true
      flow
        .read(key)
        .then((invitation) => {
          if (!active) return
          if (invitation.status !== 'pending') {
            setGone(true)
            return
          }
          setDraft(openDraft(key, invitation))
        })
        .catch((cause: unknown) => {
          if (!active) return
          const missing =
            cause instanceof ApiError &&
            (cause.failure === 'not-found' || cause.failure === 'forbidden')
          if (missing) setGone(true)
          else setFailure('No pudimos abrir la invitación. Revisa tu conexión.')
        })
      return () => {
        active = false
      }
    }, [flow, id]),
  )

  const leave = () => {
    closeDraft()
    router.replace('/today')
  }

  if (gone) return <Unavailable onLeave={leave} />

  const invitation = draft?.invitation
  const asked = invitation?.scope_options.length ?? 0
  const offer = invitation?.program_proposal ?? null
  const standing = draft && offer ? programStanding(offer, draft.relationship, draft.scopes) : null
  // Locked or off, it goes back to a no: reopening it never brings back an old yes.
  if (draft && standing && standing !== 'open') draft.program = 'rejected'
  const today = localDate()

  const confirm = async () => {
    if (!draft || !invitation) return
    setBusy(true)
    setFailure(undefined)
    try {
      const result = await flow.decide({
        invitation: draft.key,
        intentId: invitation.invitation_intent_id,
        relationship: draft.relationship,
        scopes: draft.relationship === 'accepted' ? draft.scopes : {},
        ...(standing
          ? {
              program: {
                decision: programAnswer(standing, draft.program),
                timezone: deviceTimezone(),
              },
            }
          : {}),
      })
      closeDraft()
      if (result.relationship_id) {
        router.replace({
          pathname: '/invitation/done',
          params: {
            gym: invitation.organization.display_name,
            shared: String(result.granted_scope_codes.length),
            asked: String(asked),
            ...(offer
              ? {
                  program: offer.title,
                  programLine: programOutcomeLine(offer, result.program_proposal, today) ?? '',
                }
              : {}),
          },
        })
      } else {
        router.replace('/today')
      }
    } catch (cause) {
      setFailure(decisionFailure(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="close" accessibilityLabel="Cerrar" onPress={leave} />
        <Text role="control" size="xl" accessibilityRole="header">
          Tu invitación
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 150 }]}
        showsVerticalScrollIndicator={false}
      >
        {failure ? <InlineAlert message={failure} /> : null}
        {draft && invitation ? (
          <>
            <View style={styles.gym}>
              <GymMark name={invitation.organization.display_name} />
              <View style={styles.grow}>
                <Text role="control" size="lg">
                  {invitation.organization.display_name}
                </Text>
                <Text role="body" size="xs" color="muted">
                  {[
                    invitation.invited_by ? `Te invita ${invitation.invited_by}` : null,
                    invitationExpiry(invitation.expires_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <Text role="body" size="sm" color="secondary">
              Decide cada cosa. No hay un «aceptar todo».
            </Text>

            <View style={styles.section}>
              <Text role="control" size="sm" color="muted">
                La relación
              </Text>
              <RowCard>
                <ContentRow
                  icon="organization"
                  name={`Entrenar con ${invitation.organization.display_name}`}
                  caption="Incluye Allfit Pro mientras sigas con ellos"
                  trailing={{
                    kind: 'choice',
                    items: ANSWER,
                    value: draft.relationship,
                    accessibilityLabel: 'Entrenar con este gimnasio',
                    onChange: (value) => {
                      draft.relationship = decisionOf(value)
                      redraw((tick) => tick + 1)
                    },
                  }}
                />
              </RowCard>
              <Note>Aceptar no comparte ningún dato por sí solo.</Note>
            </View>

            <View style={styles.section}>
              <Text role="control" size="sm" color="muted">
                Lo que pueden ver
              </Text>
              <View style={draft.relationship === 'rejected' && styles.dimmed}>
                <RowCard>
                  <ContentRow
                    icon="permissions"
                    iconTone="quiet"
                    name="Elegir qué compartes"
                    caption={
                      draft.relationship === 'rejected'
                        ? 'Sin relación no se comparte nada'
                        : sharedSummary(draft.scopes, asked)
                    }
                    disabled={draft.relationship === 'rejected' || asked === 0}
                    onPress={() => router.push('/invitation/share')}
                  />
                </RowCard>
              </View>
            </View>

            {offer && standing ? (
              <ProgramSection
                title={offer.title}
                span={
                  standing === 'off' ? 'Sin relación no hay programa' : programSpan(offer, today)
                }
                standing={standing}
                decision={draft.program}
                note={programNote(
                  offer,
                  standing,
                  draft.program,
                  requiredTitle(invitation, offer.required_scope.scope_code),
                  today,
                )}
                onChange={(value) => {
                  draft.program = value
                  redraw((tick) => tick + 1)
                }}
                onShare={() => router.push('/invitation/share')}
              />
            ) : null}
          </>
        ) : !failure ? (
          <Text role="body" size="sm" color="muted">
            Abriendo tu invitación…
          </Text>
        ) : null}
      </ScrollView>

      {draft ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 14, backgroundColor: theme.color.background.canvas },
          ]}
        >
          <Button label="Confirmar mis decisiones" loading={busy} onPress={() => void confirm()} />
          <Text role="body" size="xs" color="muted" align="center">
            Nada se comparte hasta que confirmes.
          </Text>
        </View>
      ) : null}
    </Screen>
  )
}

/** The permission the program needs, by the name N-8a shows it with. */
function requiredTitle(invitation: InvitationPresentation, code: string): string {
  const option = invitation.scope_options.find((candidate) => candidate.scope_code === code)
  return option ? scopeTitle(option) : scopeName(code)
}

function ProgramSection({
  title,
  span,
  standing,
  decision,
  note,
  onChange,
  onShare,
}: {
  readonly title: string
  readonly span: string
  readonly standing: ProgramStanding
  readonly decision: Decision
  readonly note: string | null
  readonly onChange: (value: Decision) => void
  readonly onShare: () => void
}) {
  return (
    <View style={styles.section}>
      <Text role="control" size="sm" color="muted">
        El programa que te proponen
      </Text>
      <View style={standing === 'off' && styles.dimmed}>
        <RowCard>
          <ContentRow
            icon="calendar"
            name={title}
            caption={span}
            disabled={standing !== 'open'}
            trailing={
              standing === 'open'
                ? {
                    kind: 'choice',
                    items: ANSWER,
                    value: decision,
                    accessibilityLabel: `Empezar ${title}`,
                    onChange: (value) => onChange(decisionOf(value)),
                  }
                : { kind: 'badge', label: 'Bloqueado', tone: 'neutral' }
            }
          />
        </RowCard>
      </View>
      {note ? <Note>{note}</Note> : null}
      {standing === 'locked' ? (
        <Button
          label="Elegir qué compartes"
          variant="ghost"
          size="sm"
          onPress={onShare}
          style={styles.link}
        />
      ) : null}
    </View>
  )
}

/** `INV-7`: the same answer for an invitation that never was, expired or was used. */
function Unavailable({ onLeave }: { readonly onLeave: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="close" accessibilityLabel="Cerrar" onPress={onLeave} />
        <Text role="control" size="xl" accessibilityRole="header">
          Invitación
        </Text>
      </View>
      {/* Centred in what the fixed footer leaves visible, not behind it. */}
      <View style={[styles.gone, { paddingBottom: insets.bottom + 96 }]}>
        <View style={[styles.goneGlyph, { backgroundColor: theme.color.background.surface }]}>
          <FoundationIcon name="external" size="lg" color={theme.color.icon.secondary} decorative />
        </View>
        <Text role="control" size="xl" align="center">
          Esta invitación ya no está disponible
        </Text>
        <Text role="body" size="sm" color="secondary" align="center">
          Puede que haya vencido o que ya se haya usado. Pídele a tu gimnasio que te envíe una
          nueva.
        </Text>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Button label="Entrar a Allfit" onPress={onLeave} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 18,
  },
  content: { paddingHorizontal: 24, gap: 18 },
  gym: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 2 },
  section: { gap: 8 },
  block: { paddingBottom: 12 },
  answer: { width: 112 },
  note: { paddingRight: 4 },
  dimmed: { opacity: 0.5 },
  link: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 10,
  },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  goneGlyph: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
})

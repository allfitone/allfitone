/**
 * `N-8b` · Lo que compartes, and `N-8c` · taking one category back — HU-SP-030, HU-SP-031.
 *
 * Everything she shares, one gym at a time, each category with how it stands. The gyms
 * she trains at come first; nutrition sits on its own card, as the designs draw it. A
 * gym she no longer trains with still shows what it kept, and that can be taken back
 * too (ADR-023).
 *
 * «Quitar» asks first: it cuts that category alone, deletes nothing of hers, and cannot
 * be undone — sharing again takes a new permission.
 */

import { Button } from '@allfitone/react-native/button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { ContentRow } from '@allfitone/react-native/content-row'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { Sheet } from '@allfitone/react-native/sheet'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { IconName } from '@allfitone/icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { scopeName } from '../src/client/gym-affiliation'
import {
  canRevoke,
  consentLine,
  groupCaption,
  groupConsents,
  revokeCopy,
  type Consent,
  type SharingGroup,
} from '../src/client/sharing'
import { consents } from '../src/client/sharing-transport'
import { GymMark, RowCard, scopeIcon } from '../src/components/gym-ui'
import { useLocale, useText } from '../src/i18n/use-text'

const SHEET_ICONS: readonly IconName[] = ['locked', 'permissions', 'history', 'info']

export default function Sharing() {
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const text = useText()
  const words = text.sharing
  const [groups, setGroups] = useState<readonly SharingGroup[] | undefined>(undefined)
  const [asking, setAsking] = useState<Consent | undefined>(undefined)
  const [revoking, setRevoking] = useState(false)
  const [failure, setFailure] = useState<'loadFailed' | 'revokeFailed' | undefined>(undefined)

  const load = useCallback(async () => {
    setGroups(groupConsents(await consents.list()))
  }, [])

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setFailure('loadFailed'))
    }, [load]),
  )

  const revoke = async (consent: Consent) => {
    if (!consent.grant_id) return
    setRevoking(true)
    setFailure(undefined)
    try {
      await consents.revoke(consent.grant_id)
      setAsking(undefined)
      await load()
    } catch {
      setAsking(undefined)
      setFailure('revokeFailed')
    } finally {
      setRevoking(false)
    }
  }

  const active = groups?.filter((group) => group.status === 'active') ?? []
  const ended = groups?.filter((group) => group.status !== 'active') ?? []
  const copy = asking ? revokeCopy(asking, words) : undefined

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header">
          {words.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {failure ? <InlineAlert message={words[failure]} /> : null}

        {groups && groups.length === 0 ? (
          <Text role="body" size="sm" color="secondary">
            {words.none}
          </Text>
        ) : null}

        {active.map((group) => (
          <Gym key={group.relationshipId} group={group} onRevoke={setAsking} />
        ))}

        {ended.map((group) => (
          <Gym key={group.relationshipId} group={group} onRevoke={setAsking} ended />
        ))}

        {ended.length > 0 ? <Note>{words.endedNote}</Note> : null}
      </ScrollView>

      <Sheet
        visible={asking !== undefined}
        onDismiss={() => setAsking(undefined)}
        title={copy?.title ?? ''}
      >
        <View style={styles.sheet}>
          {copy?.lines.map((line, index) => (
            <View key={line} style={styles.sheetLine}>
              <FoundationIcon
                name={SHEET_ICONS[index] ?? 'info'}
                size="sm"
                color={index === 0 ? theme.color.status.danger : theme.color.icon.secondary}
                decorative
              />
              <Text role="body" size="sm" color="secondary" style={styles.grow}>
                {line}
              </Text>
            </View>
          ))}
          <Button
            label={words.stop}
            variant="danger"
            loading={revoking}
            onPress={() => {
              if (asking) void revoke(asking)
            }}
          />
          <Button label={words.keep} variant="secondary" onPress={() => setAsking(undefined)} />
        </View>
      </Sheet>
    </Screen>
  )
}

function Gym({
  group,
  onRevoke,
  ended,
}: {
  readonly group: SharingGroup
  readonly onRevoke: (consent: Consent) => void
  readonly ended?: boolean
}) {
  const text = useText().sharing
  const locale = useLocale()
  return (
    <View style={styles.gym}>
      <View style={[styles.gymHead, ended && styles.muted]}>
        <GymMark name={group.organizationName} size={40} />
        <View style={styles.grow}>
          <Text role="control" size="sm">
            {group.organizationName}
          </Text>
          <Text role="body" size="xs" color="muted">
            {groupCaption(group, text, locale)}
          </Text>
        </View>
      </View>
      {group.training.length > 0 ? (
        <RowCard>
          {group.training.map((consent) => (
            <Category key={consent.scope_code} consent={consent} onRevoke={onRevoke} />
          ))}
        </RowCard>
      ) : null}
      {group.nutrition.length > 0 ? (
        <>
          <Text role="control" size="xs" color="muted" style={styles.label}>
            {text.nutrition(group.organizationName)}
          </Text>
          <RowCard>
            {group.nutrition.map((consent) => (
              <Category key={consent.scope_code} consent={consent} onRevoke={onRevoke} />
            ))}
          </RowCard>
        </>
      ) : null}
    </View>
  )
}

function Category({
  consent,
  onRevoke,
}: {
  readonly consent: Consent
  readonly onRevoke: (consent: Consent) => void
}) {
  const text = useText().sharing
  const locale = useLocale()
  const title = scopeName(consent.scope_code)
  return (
    <ContentRow
      icon={scopeIcon(consent.scope_code)}
      iconTone="quiet"
      name={title}
      caption={consentLine(consent, text, locale)}
      trailing={
        canRevoke(consent)
          ? {
              kind: 'button',
              label: text.remove,
              accessibilityLabel: text.removeLabel(title),
              onPress: () => onRevoke(consent),
            }
          : { kind: 'badge', label: text.notShared }
      }
    />
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
  content: { paddingHorizontal: 24, gap: 22 },
  gym: { gap: 10 },
  gymHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { marginTop: 4 },
  grow: { flex: 1 },
  muted: { opacity: 0.6 },
  remove: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  sheet: { gap: 14 },
  sheetLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
})

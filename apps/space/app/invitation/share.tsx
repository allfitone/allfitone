/**
 * `N-8a` · Decide qué pueden ver — HU-SP-017.
 *
 * Every category the gym asked for, with what it is for and the level it asks, answered
 * one by one. Each starts as a no: a category she leaves untouched is not shared. What
 * she chooses stays in the draft until «Tu invitación» confirms it.
 *
 * Each category reads by the name and description the gym sent, frozen when the
 * invitation was sent. The description is the half that says what is not included, so
 * she decides on where the permission stops, not only on its name.
 *
 * When the invitation offers a program, the category it needs says so (TECH-362).
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { ContentRow } from '@allfitone/react-native/content-row'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  accessLevelLabel,
  type Decision,
  decisionOf,
  programNeedLine,
  scopeDescription,
  scopeTitle,
} from '../../src/client/gym-affiliation'
import { currentDraft } from '../../src/client/invitation-draft'
import { GymMark, RowCard, scopeIcon } from '../../src/components/gym-ui'
import { useText } from '../../src/i18n/use-text'

export default function InvitationShare() {
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const draft = currentDraft()
  const text = useText()
  const words = text.invitation
  const [, redraw] = useState(0)
  const answers: readonly { readonly value: Decision; readonly label: string }[] = [
    { value: 'rejected', label: words.answer.no },
    { value: 'accepted', label: words.answer.yes },
  ]

  if (!draft) {
    router.back()
    return null
  }
  const options = draft.invitation.scope_options
  const offer = draft.invitation.program_proposal
  const shared = options.filter((option) => draft.scopes[option.scope_code] === 'accepted').length

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <View style={styles.gym}>
          <GymMark name={draft.invitation.organization.display_name} size={36} />
          <View style={styles.grow}>
            <Text role="control" size="sm">
              {draft.invitation.organization.display_name}
            </Text>
            <Text role="body" size="xs" color="muted">
              {words.share.invites}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 150 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text role="control" size="2xl" accessibilityRole="header">
          {words.share.title}
        </Text>
        <Text role="body" size="sm" color="secondary">
          {words.share.intro}
        </Text>
        <RowCard>
          {options.map((option) => {
            const title = scopeTitle(option, text.gyms)
            const description = scopeDescription(option)
            return (
              <View key={option.scope_code} style={styles.option}>
                <ContentRow
                  icon={scopeIcon(option.scope_code)}
                  iconTone="quiet"
                  name={title}
                  caption={accessLevelLabel(option.offered_access_level, text.gyms)}
                  trailing={{
                    kind: 'choice',
                    items: answers,
                    value: draft.scopes[option.scope_code] ?? 'rejected',
                    accessibilityLabel: words.share.shareLabel(title),
                    onChange: (value) => {
                      draft.scopes[option.scope_code] = decisionOf(value)
                      redraw((tick) => tick + 1)
                    },
                  }}
                />
                {description ? (
                  <Text role="body" size="xs" color="secondary" style={styles.detail}>
                    {description}
                  </Text>
                ) : null}
                {option.purpose ? (
                  <Text role="body" size="xs" color="muted" style={styles.detail}>
                    {option.purpose}
                  </Text>
                ) : null}
                {offer && offer.required_scope.scope_code === option.scope_code ? (
                  <Text role="body" size="xs" color="accent" style={styles.detail}>
                    {programNeedLine(offer, words)}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </RowCard>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 14, backgroundColor: theme.color.background.canvas },
        ]}
      >
        <Button label={words.share.done(shared, options.length)} onPress={() => router.back()} />
        <Text role="body" size="xs" color="muted" align="center">
          {words.share.unchosen}
        </Text>
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
    paddingBottom: 14,
  },
  gym: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, gap: 1 },
  content: { paddingHorizontal: 24, gap: 12 },
  option: { paddingBottom: 8 },
  answer: { width: 112 },
  detail: { paddingLeft: 48, paddingBottom: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 10,
  },
})

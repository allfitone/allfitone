/**
 * On a finished session's detail, the corrections still waiting on her for that session
 * (`HU-SP-062`): one row each, opening «Corrección propuesta» (`NT-5`). Draws nothing
 * when none waits or the list cannot be read, so the session never waits on it.
 */

import { ContentRow } from '@allfitone/react-native/content-row'
import { Monogram } from '@allfitone/react-native/monogram'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { expiryLabel, statusOf, type CorrectionProposal } from '../client/corrections'
import { corrections } from '../client/corrections-transport'
import { deviceTimezone } from '../client/timezone'
import { useText } from '../i18n/use-text'

export function PendingCorrections({
  executionId,
  style,
}: {
  readonly executionId: string
  readonly style?: StyleProp<ViewStyle>
}) {
  const router = useRouter()
  const t = useText().corrections
  const timeZone = deviceTimezone()
  const [waiting, setWaiting] = useState<{ list: CorrectionProposal[]; at: Date }>()

  useFocusEffect(
    useCallback(() => {
      let active = true
      corrections
        .list('pending')
        .then((list) => {
          const at = new Date()
          const mine = list.filter(
            (one) => one.execution_id === executionId && statusOf(one, at) === 'pending',
          )
          if (active) setWaiting({ list: mine, at })
        })
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [executionId]),
  )

  if (!waiting || waiting.list.length === 0) return null
  return (
    <View style={style}>
      {waiting.list.map((proposal) => (
        <ContentRow
          key={proposal.id}
          preview={<Monogram name={proposal.proposer_name} letters={2} tone="sport" />}
          name={t.waiting(proposal.proposer_name)}
          caption={expiryLabel(proposal, waiting.at, timeZone, t)}
          onPress={() =>
            router.push({
              pathname: '/corrections/[proposalId]',
              params: { proposalId: proposal.id },
            })
          }
        />
      ))}
    </View>
  )
}

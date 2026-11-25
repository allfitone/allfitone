/**
 * `INV-5` · Ya entrenas con tu gimnasio — HU-SP-016.
 *
 * What accepting did, and only that: Pro comes with the gym, and she shares exactly the
 * categories she said yes to. The coach is assigned afterwards in Studio (HU-STUDIO-023),
 * so this screen does not promise one. An offered program she accepted says when it
 * starts, or why it was not set (TECH-362).
 */

import { Button } from '@allfitone/react-native/button'
import { ContentRow } from '@allfitone/react-native/content-row'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GymMark, RowCard } from '../../src/components/gym-ui'
import { useText } from '../../src/i18n/use-text'

export default function InvitationDone() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const words = useText().invitation.done
  const {
    gym = '',
    shared = '0',
    asked = '0',
    program = '',
    programLine = '',
  } = useLocalSearchParams<{
    gym?: string
    shared?: string
    asked?: string
    program?: string
    programLine?: string
  }>()

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.content}>
        <GymMark name={gym} size={64} />
        <Text role="control" size="2xl" align="center" accessibilityRole="header">
          {words.title(gym)}
        </Text>
        <Text role="body" size="sm" color="secondary" align="center">
          {words.coach}
        </Text>
        <View style={styles.rows}>
          <RowCard>
            <ContentRow icon="favourite" name={words.pro} caption={words.includedBy(gym)} />
            <ContentRow
              icon="permissions"
              iconTone="quiet"
              name={words.shared(Number(shared), Number(asked))}
              caption={words.changeLater}
            />
            {program && programLine ? (
              <ContentRow icon="calendar" name={program} caption={programLine} />
            ) : null}
          </RowCard>
        </View>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Button label={words.today} onPress={() => router.replace('/today')} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 72, gap: 12 },
  rows: { alignSelf: 'stretch', marginTop: 12 },
  footer: { paddingHorizontal: 24, paddingTop: 14 },
})

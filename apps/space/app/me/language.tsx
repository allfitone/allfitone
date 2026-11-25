/**
 * The language she reads the app in, chosen from `PF-14`. HU-SP-094, ADR-054.
 *
 * No design of its own: two of the design system's selectable rows, each language named
 * in itself. Choosing one switches the whole app at once and saves it; the language also
 * decides her email and push. A refused save puts the app back and says why. Until she
 * chooses, the app follows the phone and the row of the phone's language is the one
 * marked.
 */

import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Note } from '@allfitone/react-native/note'
import { Screen } from '@allfitone/react-native/screen'
import { SelectableRow } from '@allfitone/react-native/selectable-row'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import {
  applyOptimistically,
  preferenceFailure,
  withLocale,
  type SpacePreferences,
} from '../../src/client/preferences'
import { preferencesApi, preferenceStores } from '../../src/client/preferences-transport'
import { LOCALES, type Locale } from '../../src/i18n'
import { useLocale, useText } from '../../src/i18n/use-text'

export default function Language() {
  const router = useRouter()
  const text = useText()
  const t = text.preferences
  const speaking = useLocale()
  const [held, setHeld] = useState<SpacePreferences | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      let active = true
      preferencesApi
        .read()
        .then((read) => active && setHeld(read))
        .catch(() => active && setFailure(t.unreadable))
      return () => {
        active = false
      }
    }, [t.unreadable]),
  )

  const choose = async (locale: Locale) => {
    if (!held || held.locale === locale) return
    setFailure(undefined)
    try {
      setHeld(
        await applyOptimistically(
          held,
          withLocale(held, locale),
          preferenceStores,
          preferencesApi.save,
        ),
      )
      router.back()
    } catch (cause) {
      setFailure(preferenceFailure(cause, t))
    }
  }

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header">
          {t.language.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {failure ? <InlineAlert message={failure} /> : null}
        {LOCALES.map((locale) => (
          <SelectableRow
            key={locale}
            name={t.language.names[locale]}
            {...(held?.locale === null && locale === speaking
              ? { caption: t.language.followsPhone }
              : {})}
            selected={(held?.locale ?? speaking) === locale}
            disabled={held === undefined}
            onPress={() => void choose(locale)}
          />
        ))}
        <Note>{t.language.note}</Note>
      </ScrollView>
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
  content: { paddingHorizontal: 24, gap: 12 },
})

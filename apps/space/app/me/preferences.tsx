/**
 * `PF-14` · Preferencias — her units and language, and the way to what lives elsewhere.
 * HU-SP-094, ADR-054, `OP-IDN-070`/`OP-IDN-071`.
 *
 * **Units convert, they never rewrite.** Kilos or pounds, kilometres or miles: every
 * stored value keeps its canonical and original unit and is converted only when drawn,
 * which the note under the card says in so many words (criterion 2).
 *
 * **A choice shows at once.** The stores move before the `PUT` answers, so the whole app
 * reads in pounds the moment she presses «Libras»; if the server refuses, they move back
 * and an alert says why. Nothing is sent until her current choice has been read, because
 * the `PUT` carries all three keys and a guess would overwrite one she made elsewhere.
 *
 * Apple Health is listed and off: it is its own story and not built yet. The last group
 * reaches her contact, her permissions and the deletion of her data (criterion 3); the
 * deletion is not built yet and says «Pronto» instead of a chevron.
 */

import { ContentGroup, ContentRow } from '@allfitone/react-native/content-row'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  applyOptimistically,
  languageRow,
  preferenceFailure,
  withDistance,
  withMass,
  type SpacePreferences,
} from '../../src/client/preferences'
import { preferencesApi, preferenceStores } from '../../src/client/preferences-transport'
import { SectionLabel } from '../../src/components/pro-ui'
import { useLocale, useText } from '../../src/i18n/use-text'
import { isDistanceUnit, isMassUnit } from '../../src/units/units'
import { useUnits } from '../../src/units/use-units'

export default function Preferences() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const text = useText()
  const t = text.preferences
  const speaking = useLocale()
  const units = useUnits()
  const [held, setHeld] = useState<SpacePreferences | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      let active = true
      preferencesApi
        .read()
        .then((read) => {
          if (!active) return
          setHeld(read)
          setFailure(undefined)
        })
        .catch(() => active && setFailure(t.unreadable))
      return () => {
        active = false
      }
    }, [t.unreadable]),
  )

  const choose = async (next: SpacePreferences) => {
    if (!held) return
    setFailure(undefined)
    try {
      setHeld(await applyOptimistically(held, next, preferenceStores, preferencesApi.save))
    } catch (cause) {
      setFailure(preferenceFailure(cause, t))
    }
  }

  const language = languageRow(held?.locale ?? null, speaking, t)

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel={text.common.back}
          onPress={() => router.back()}
        />
        <Text role="control" size="xl" accessibilityRole="header">
          {t.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {failure ? <InlineAlert message={failure} /> : null}

        <View style={styles.group}>
          <SectionLabel>{t.units.label}</SectionLabel>
          <ContentGroup>
            <ContentRow
              name={t.units.mass}
              trailing={{
                kind: 'choice',
                items: [
                  { value: 'kg', label: t.units.kilograms },
                  { value: 'lb', label: t.units.pounds },
                ],
                value: units.mass,
                accessibilityLabel: t.units.mass,
                onChange: (value) => {
                  if (held && isMassUnit(value)) void choose(withMass(held, value))
                },
              }}
            />
            <ContentRow
              name={t.units.distance}
              trailing={{
                kind: 'choice',
                items: [
                  { value: 'km', label: t.units.kilometres },
                  { value: 'mi', label: t.units.miles },
                ],
                value: units.distance,
                accessibilityLabel: t.units.distance,
                onChange: (value) => {
                  if (held && isDistanceUnit(value)) void choose(withDistance(held, value))
                },
              }}
            />
          </ContentGroup>
          <Text role="body" size="xs" color="muted">
            {t.units.note}
          </Text>
        </View>

        <View style={styles.group}>
          <SectionLabel>{t.language.label}</SectionLabel>
          <ContentGroup>
            <ContentRow
              name={language.name}
              {...(language.caption ? { caption: language.caption } : {})}
              trailing={{ kind: 'chevron' }}
              onPress={() => router.push('/me/language')}
            />
          </ContentGroup>
        </View>

        <View style={styles.group}>
          <SectionLabel>{t.health.label}</SectionLabel>
          <ContentGroup>
            <ContentRow
              icon="heart"
              iconTone="quiet"
              name={t.health.appleHealth}
              caption={t.health.caption}
              trailing={{ kind: 'none' }}
              disabled
            />
          </ContentGroup>
        </View>

        <View style={styles.group}>
          <SectionLabel>{t.elsewhere.label}</SectionLabel>
          <ContentGroup>
            <ContentRow
              name={t.elsewhere.contact}
              trailing={{ kind: 'chevron' }}
              onPress={() => router.push('/me/identity')}
            />
            <ContentRow
              name={t.elsewhere.sharing}
              trailing={{ kind: 'chevron' }}
              onPress={() => router.push('/sharing')}
            />
            <ContentRow
              name={t.elsewhere.deleteData}
              trailing={{ kind: 'badge', label: text.profile.badge.soon }}
            />
          </ContentGroup>
        </View>
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
  content: { paddingHorizontal: 24, gap: 22 },
  group: { gap: 10 },
})

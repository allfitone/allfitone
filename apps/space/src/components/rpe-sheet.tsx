/**
 * The effort scale, open and explained — `HU-SP-055` criterion 8.
 *
 * **It explains before it asks.** A bare 1-to-10 field is a question in a language half
 * the people do not speak; above, it says what is measured, and below the numbers what
 * the one just marked means. The changing copy sits below because a finger covers what
 * is above it while tapping.
 *
 * **It records on tap and the sheet stays open.** Closing on tap would hide the line
 * that explains the choice, which is exactly what the person came to read.
 *
 * Two rows of five, not ten in one: ten targets across a phone come out at thirty
 * points each, and the floor is forty-four.
 */

import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { Pressable, StyleSheet, View } from 'react-native'

import { rpeCopy, rpeLevels, type RpeLevel } from '../client/rpe-scale'
import { useText } from '../i18n/use-text'

export function RpeSheetBody({
  value,
  onChoose,
}: {
  readonly value: number | undefined
  readonly onChoose: (value: number | undefined) => void
}) {
  const theme = useTheme()
  const text = useText().session.rpe
  const levels = rpeLevels(text)
  const rows: readonly (readonly RpeLevel[])[] = [levels.slice(0, 5), levels.slice(5)]

  return (
    <View style={styles.body}>
      <Text role="body" size="sm" color="secondary">
        {text.explainer}
      </Text>

      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row[0]?.value ?? 0} style={styles.row}>
            {row.map((level) => {
              const on = level.value === value
              return (
                <Pressable
                  key={level.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={text.step(level.value, level.name)}
                  accessibilityHint={level.detail}
                  // Tapping the one marked clears it: the only way back to no effort
                  // without one more button.
                  onPress={() => onChoose(on ? undefined : level.value)}
                  style={({ pressed }) => [
                    styles.step,
                    {
                      backgroundColor: on
                        ? theme.color.accent.tonal
                        : theme.color.background.surface,
                      borderColor: on ? theme.color.border.accent : theme.color.border.subtle,
                      borderWidth: on ? 1.5 : 1,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text role="data" size="lg" color={on ? 'accent' : 'primary'}>
                    {String(level.value)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      {/* The changing line. Always two lines tall, so marking a number never moves what
          is below it while two are compared. */}
      <View style={[styles.copy, { borderTopColor: theme.color.border.subtle }]}>
        <Text role="body" size="md" color={value === undefined ? 'muted' : 'primary'}>
          {rpeCopy(value, text)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingBottom: 8 },
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  step: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { borderTopWidth: 1, paddingTop: 12, minHeight: 58 },
})

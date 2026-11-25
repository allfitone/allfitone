/**
 * The rest between sets, chosen: any value by the stepper, the common ones by a chip.
 *
 * Shared by the routine editor, where it is the plan's rest, and the session, where it
 * is today's (ADR-035). What it changes is the caller's business; this only asks.
 */

import { Chip } from '@allfitone/react-native/chip'
import { Stepper } from '@allfitone/react-native/stepper'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import { StyleSheet, View } from 'react-native'

import {
  REST_MAX_SECONDS,
  REST_PRESETS,
  REST_STEP_SECONDS,
  restPresetLabel,
} from '../client/set-scheme'
import { useText } from '../i18n/use-text'

export function RestSheetBody({
  value,
  onChange,
}: {
  readonly value: number
  readonly onChange: (seconds: number) => void
}) {
  const theme = useTheme()
  const words = useText()
  const text = words.session.rest
  const shown = (seconds: number) => restPresetLabel(seconds, words.training.sets)

  return (
    <View style={styles.sheet}>
      <Text role="body" size="sm" color="muted">
        {text.sheetLead}
      </Text>

      {/* Any rest, not one of seven. The presets below are a shortcut to the common
          answers, never the whole set of them. */}
      <Stepper
        accessibilityLabel={words.training.routine.sheets.rest}
        value={value}
        min={0}
        max={REST_MAX_SECONDS}
        step={REST_STEP_SECONDS}
        format={shown}
        caption={text.stepCaption(REST_STEP_SECONDS)}
        grow
        style={{ borderColor: theme.color.border.accent }}
        onChange={onChange}
      />

      <Text role="control" size="sm" color="secondary">
        {text.presets}
      </Text>
      <View style={styles.chips}>
        {REST_PRESETS.map((preset) => (
          <Chip
            key={preset}
            label={shown(preset)}
            selected={value === preset}
            onPress={() => onChange(preset)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { gap: 10, paddingBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
})

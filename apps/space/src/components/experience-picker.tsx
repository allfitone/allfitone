/**
 * Choosing how much somebody has trained (`HU-SP-012`, criterion 2): the three stops of
 * one scale and the fixed notice under them.
 *
 * Shared by the onboarding and by the screen that edits the level later. It holds the
 * answer's drawing and nothing of the screen around it. Why the line does not fill and
 * why the notice is fixed rather than revealed is in `app/onboarding/experience.tsx`.
 */

import { Note } from '@allfitone/react-native/note'
import { Text } from '@allfitone/react-native/text'
import { StyleSheet, View } from 'react-native'
import Animated, { type FadeInDown } from 'react-native-reanimated'

import {
  chooseLevel,
  experienceStops,
  TRAINING_EXPERIENCE,
  type TrainingExperience,
} from '../client/experience-form'
import { useText } from '../i18n/use-text'
import { LevelStopRow } from './level-stop'

export function ExperiencePicker({
  level,
  onChoose,
  pressable,
  entering,
}: {
  readonly level: TrainingExperience | undefined
  readonly onChoose: (level: TrainingExperience) => void
  readonly pressable: boolean
  /** One per stop and one for the notice, in order; absent draws everything at once. */
  readonly entering?: readonly (FadeInDown | undefined)[] | undefined
}) {
  const text = useText().fitness.experience
  const notice = entering?.[TRAINING_EXPERIENCE.length]
  return (
    <>
      {/* El recorrido entero, frío, desde el primer fotograma. Si apareciera al
          elegir, la escala sólo la vería quien ya decidió. */}
      <View style={styles.track}>
        {experienceStops(level, text).map((stop, index) => {
          const enter = entering?.[index]
          return (
            <LevelStopRow
              key={stop.entry.level}
              stop={stop}
              pressable={pressable}
              onPress={() => onChoose(chooseLevel(level, stop.entry.level))}
              {...(enter ? { entering: enter } : {})}
            />
          )
        })}
      </View>

      {/* Shown whether or not a level is chosen: whoever fears a label reads it first. */}
      <Animated.View {...(notice ? { entering: notice } : {})} style={styles.notice}>
        <Note>
          <Text role="body" size="xs" color="primary">
            {text.notALabelTitle}
          </Text>
          {text.notALabelBody}
        </Note>
      </Animated.View>
    </>
  )
}

const styles = StyleSheet.create({
  // Crece con lo que lleva dentro, y no al revés: ver `stopSlot` en `level-stop`.
  track: { flexGrow: 1, marginBottom: 4 },
  notice: { marginTop: 2 },
})

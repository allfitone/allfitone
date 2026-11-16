/**
 * `PF-E4b` · Dónde y con qué (`HU-SP-013`, TECH-43): where somebody trains and the
 * equipment they have, so nothing is proposed that cannot be done.
 *
 * A screen rather than a sheet because nine pieces of equipment need room to be
 * recognised by their picture. The place is one claim (`OP-IDN-004`) and the equipment a
 * set (`OP-IDN-065`); each is written only when it changed.
 *
 * **Home with little equipment is said at the moment it is chosen** (criterion 3): it is
 * not a separate answer but a reading of these two.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { FoundationIcon } from '@allfitone/react-native/icons'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useTheme } from '@allfitone/react-native/theme'
import type { IconName } from '@allfitone/icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { EQUIPMENT_PICTURES } from '../../src/client/equipment-pictures'
import {
  EQUIPMENT_CHOICES,
  PLACE_CHOICES,
  entryOf,
  fewEquipmentAtHome,
  type EquipmentPiece,
  type FitnessProfile,
  type TrainingPlace,
} from '../../src/client/fitness-profile'
import {
  declareClaim,
  declareEquipment,
  readFitnessProfile,
  type ClaimCode,
} from '../../src/client/profile-transport'
import { FormNote } from '../../src/components/fitness-profile-ui'

const SAVE_FAILED = 'No pudimos guardarlo. Inténtalo otra vez.'
const PLACE_ICON: Record<TrainingPlace, IconName> = {
  gym: 'training',
  home: 'home',
  outdoors: 'outdoor',
  multiple: 'route',
}

export interface PlaceSources {
  readonly readProfile: () => Promise<FitnessProfile>
  readonly declareClaim: (code: ClaimCode, value: string) => Promise<unknown>
  readonly declareEquipment: (equipment: readonly EquipmentPiece[]) => Promise<unknown>
}

const LIVE: PlaceSources = { readProfile: readFitnessProfile, declareClaim, declareEquipment }

export default function PlaceRoute() {
  return <PlaceScreen sources={LIVE} />
}

/** The screen given where its data comes from; the route passes the real sources. */
export function PlaceScreen({ sources }: { readonly sources: PlaceSources }) {
  const router = useRouter()
  const theme = useTheme()
  const [place, setPlace] = useState<TrainingPlace | undefined>(undefined)
  const [equipment, setEquipment] = useState<EquipmentPiece[]>([])
  const [initial, setInitial] = useState<{ place?: string; equipment: string } | undefined>()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    sources
      .readProfile()
      .then((profile) => {
        if (!active) return
        const declaredPlace = entryOf(profile, 'training_place')?.values[0]
        const declared = entryOf(profile, 'available_equipment')?.values ?? []
        const pieces = EQUIPMENT_CHOICES.map((one) => one.value).filter((one) =>
          declared.includes(one),
        )
        setPlace(PLACE_CHOICES.find((one) => one.value === declaredPlace)?.value)
        setEquipment(pieces)
        setInitial({
          ...(declaredPlace === undefined ? {} : { place: declaredPlace }),
          equipment: pieces.join(),
        })
      })
      .catch(() => active && setInitial({ equipment: '' }))
    return () => {
      active = false
    }
  }, [sources])

  const toggle = (piece: EquipmentPiece) =>
    setEquipment((chosen) =>
      chosen.includes(piece)
        ? chosen.filter((one) => one !== piece)
        : EQUIPMENT_CHOICES.map((one) => one.value).filter(
            (one) => one === piece || chosen.includes(one),
          ),
    )

  const placeChanged = place !== undefined && place !== initial?.place
  const equipmentChanged = equipment.length > 0 && equipment.join() !== initial?.equipment

  const save = async () => {
    setSaving(true)
    setFailure(undefined)
    try {
      if (placeChanged) await sources.declareClaim('training_place', place)
      if (equipmentChanged) await sources.declareEquipment(equipment)
      router.back()
    } catch {
      setFailure(SAVE_FAILED)
      setSaving(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header">
          Dónde y con qué
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text role="body" size="sm" color="secondary">
          Para no proponerte ejercicios que no puedes hacer.
        </Text>

        <Text role="label" size="xs" color="secondary" uppercase>
          Dónde entrenas
        </Text>
        <View style={styles.places}>
          {PLACE_CHOICES.map((choice) => {
            const chosen = place === choice.value
            return (
              <Pressable
                key={choice.value}
                accessibilityRole="radio"
                accessibilityLabel={choice.name}
                accessibilityState={{ selected: chosen }}
                onPress={() => setPlace(choice.value)}
                style={({ pressed }) => [
                  styles.place,
                  {
                    borderColor: chosen ? theme.color.border.accent : theme.color.border.subtle,
                    backgroundColor: theme.color.background.surface,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.placeIcon,
                    {
                      backgroundColor: chosen
                        ? theme.color.icon.accent
                        : theme.color.background.surfaceMuted,
                    },
                  ]}
                >
                  <FoundationIcon
                    name={PLACE_ICON[choice.value]}
                    size="sm"
                    color={chosen ? theme.color.accent.onAccent : theme.color.icon.secondary}
                    decorative
                  />
                </View>
                <Text role="control" size="sm" style={styles.grow}>
                  {choice.name}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.equipmentHead}>
          <Text role="label" size="xs" color="secondary">
            EL EQUIPO QUE TIENES
          </Text>
          {equipment.length > 0 ? (
            <Text role="control" size="xs" color="accent">
              {equipment.length === 1 ? '1 elegido' : `${String(equipment.length)} elegidos`}
            </Text>
          ) : null}
        </View>
        <View style={styles.grid}>
          {EQUIPMENT_CHOICES.map((piece) => {
            const chosen = equipment.includes(piece.value)
            const picture = EQUIPMENT_PICTURES[piece.value]
            return (
              <Pressable
                key={piece.value}
                accessibilityRole="checkbox"
                accessibilityLabel={piece.name}
                accessibilityState={{ checked: chosen }}
                onPress={() => toggle(piece.value)}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.plate,
                    {
                      borderColor: chosen ? theme.color.border.accent : theme.color.border.subtle,
                      opacity: chosen ? 1 : 0.55,
                    },
                  ]}
                >
                  {picture === undefined ? null : (
                    <Image source={picture} style={styles.picture} resizeMode="cover" />
                  )}
                  {chosen ? (
                    <View style={[styles.tick, { backgroundColor: theme.color.icon.accent }]}>
                      <FoundationIcon
                        name="check"
                        size="xs"
                        color={theme.color.accent.onAccent}
                        decorative
                      />
                    </View>
                  ) : null}
                </View>
                <Text role="control" size="xs" color={chosen ? 'primary' : 'muted'}>
                  {piece.name}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {fewEquipmentAtHome(place, equipment) ? (
          <FormNote
            boxed
            text="Entrenas en casa con poco equipo: tu plan se apoya en tu peso y en lo que marcaste."
          />
        ) : null}
        {failure ? <InlineAlert message={failure} /> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Guardar"
          loading={saving}
          disabled={!placeChanged && !equipmentChanged}
          onPress={() => void save()}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 12 },
  content: { gap: 14, paddingBottom: 24 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  place: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
  },
  placeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  equipmentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '30%', flexGrow: 1, gap: 6 },
  plate: {
    aspectRatio: 1.25,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The picture carries its own ground, so it fills the plate edge to edge.
  picture: { width: '100%', height: '100%' },
  tick: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingTop: 8 },
})

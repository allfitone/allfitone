/**
 * «Importar historial» — bringing years of training from Hevy (ADR-044).
 *
 * One action and what came of the earlier ones. The file is chosen here and read by the
 * server at once; nothing enters the history on this screen. What the person sees next
 * is the review, where they confirm what each exercise is before anything is written.
 *
 * The device's zone goes with the file because Hevy's times carry none: «7:16» is read
 * as 7:16 where the person is now, which is right for nearly everybody.
 */

import { Button } from '@allfitone/react-native/button'
import { IconButton } from '@allfitone/react-native/icon-button'
import { InlineAlert } from '@allfitone/react-native/inline-alert'
import { Screen } from '@allfitone/react-native/screen'
import { Text } from '@allfitone/react-native/text'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ApiError } from '../../src/client'
import {
  importStatusLine,
  importTitle,
  refusalMessage,
  type HistoryImport,
} from '../../src/client/history-import'
import { historyImports, pickHistoryFile } from '../../src/client/history-import-transport'
import { deviceTimezone } from '../../src/client/timezone'
import { GlyphRow, RowCard } from '../../src/components/gym-ui'

const STEPS = [
  { icon: 'settings', title: 'En Hevy, abre Ajustes', caption: 'Desde tu perfil' },
  {
    icon: 'download',
    title: 'Exporta tus entrenamientos',
    caption: 'Hevy guarda un archivo CSV con todas tus series',
  },
  { icon: 'check', title: 'Elígelo aquí', caption: 'Revisas los ejercicios antes de importar' },
] as const

export default function HistoryImportStart() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [imports, setImports] = useState<readonly HistoryImport[]>([])
  const [reading, setReading] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      historyImports
        .list()
        .then(setImports)
        .catch(() => setImports([]))
    }, []),
  )

  const choose = async () => {
    setFailure(undefined)
    let content: string | null
    try {
      content = await pickHistoryFile()
    } catch {
      setFailure('No pudimos abrir el archivo. Inténtalo de nuevo.')
      return
    }
    if (content === null) return
    setReading(true)
    try {
      const staged = await historyImports.stage(content, deviceTimezone())
      router.push({ pathname: '/history-import/[importId]', params: { importId: staged.id } })
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.failure === 'validation-failed'
          ? refusalMessage(error.issues[0])
          : 'No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.',
      )
    } finally {
      setReading(false)
    }
  }

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Volver" onPress={() => router.back()} />
        <Text role="control" size="xl" accessibilityRole="header">
          Importar historial
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text role="body" size="sm" color="secondary">
          Trae tus entrenamientos de Hevy y sigue tu progreso aquí sin empezar de cero. Tus récords
          y tu racha los cuentan.
        </Text>

        <RowCard>
          {STEPS.map((step) => (
            <GlyphRow key={step.title} icon={step.icon} title={step.title} caption={step.caption} />
          ))}
        </RowCard>

        {failure ? <InlineAlert message={failure} /> : null}

        <Button
          label={reading ? 'Leyendo el archivo…' : 'Elegir archivo CSV'}
          loading={reading}
          onPress={() => void choose()}
        />

        {imports.length > 0 ? (
          <View style={styles.list}>
            <Text role="control" size="xs" color="muted">
              Tus importaciones
            </Text>
            <RowCard>
              {imports.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/history-import/[importId]',
                      params: { importId: item.id },
                    })
                  }
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <GlyphRow
                    icon="history"
                    title={importTitle(item)}
                    caption={importStatusLine(item)}
                    accent={item.status === 'staged'}
                  />
                </Pressable>
              ))}
            </RowCard>
          </View>
        ) : null}
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
  list: { gap: 10 },
  pressed: { opacity: 0.6 },
})

/**
 * The section «Perfil fitness» (`PF-3b`) groups its data in.
 *
 * Each datum inside is the design system's `DatumRow`: what it is, what it says and
 * where it came from, or «Sin responder» with «Responder» when nobody asked yet.
 */

import { ContentGroup } from '@allfitone/react-native/content-row'
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { SectionLabel } from './pro-ui'

/** A section: its name, then its rows on the design system's grouped card. */
export function FitnessGroup({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.group}>
      <SectionLabel>{label}</SectionLabel>
      <ContentGroup>{children}</ContentGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 10 },
})

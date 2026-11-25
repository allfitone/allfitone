/**
 * Buying and restoring Pro from a screen: the store's sheet, then the API, then the store
 * again (`pro-store.ts` explains the order).
 *
 * The listener lives as long as the screen that can buy. A purchase that arrives while it
 * is mounted — just bought, or replayed by the store because it was never finished — is
 * presented and finished here; one that arrives elsewhere comes back on the next restore.
 */

import { useEffect, useRef, useState } from 'react'

import type { ProFlow, ProStatus } from '../client/pro'
import {
  buy,
  finish,
  heldPurchases,
  listenForPurchases,
  purchaseOf,
  type StoreOffer,
} from '../client/pro-store'
import { useText } from '../i18n/use-text'

type PurchaseFailure = 'notTaken' | 'storeFailed' | 'nothingToRestore'

export function useProPurchase(flow: ProFlow, onPro: (status: ProStatus) => void) {
  const [busy, setBusy] = useState(false)
  const words = useText().plans.purchase
  const [failure, setFailure] = useState<PurchaseFailure | undefined>(undefined)
  const done = useRef(onPro)
  done.current = onPro

  useEffect(() => {
    const take = async (purchase: Parameters<typeof purchaseOf>[0]) => {
      const presented = purchaseOf(purchase)
      if (!presented) return
      setBusy(true)
      try {
        const status = await flow.present(presented)
        await finish(purchase)
        setFailure(undefined)
        done.current(status)
      } catch {
        // Left unfinished on purpose: the store hands it back and it is presented again.
        setFailure('notTaken')
      } finally {
        setBusy(false)
      }
    }
    return listenForPurchases({
      onPurchase: (purchase) => void take(purchase),
      onFailure: () => {
        setBusy(false)
        setFailure('storeFailed')
      },
    })
  }, [flow])

  return {
    busy,
    failure: failure ? words[failure] : undefined,
    async subscribe(offer: StoreOffer, accountToken: string) {
      setFailure(undefined)
      setBusy(true)
      try {
        await buy(offer, accountToken)
      } catch {
        setBusy(false)
        setFailure('storeFailed')
      }
    },
    async restore() {
      setFailure(undefined)
      setBusy(true)
      try {
        const held = await heldPurchases()
        let last: ProStatus | undefined
        for (const purchase of held) {
          const presented = purchaseOf(purchase)
          if (!presented) continue
          last = await flow.present(presented)
          await finish(purchase)
        }
        if (last) done.current(last)
        else setFailure('nothingToRestore')
      } catch {
        setFailure('notTaken')
      } finally {
        setBusy(false)
      }
    },
  }
}

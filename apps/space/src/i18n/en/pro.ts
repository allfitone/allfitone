import type { Dictionary } from '../es'

export const pro: Dictionary['pro'] = {
  paidWith: (store) => `Paid through ${store}`,
  includedBy: (gym) => `Included by ${gym}`,
  freeForever: 'No cost, forever',
}

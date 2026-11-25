import type { Dictionary } from '../es'

export const sharing: Dictionary['sharing'] = {
  title: 'What you share',
  loadFailed: "We couldn't load what you share. Check your connection.",
  revokeFailed: "We couldn't stop sharing it. Please try again.",
  none: "You don't share anything with any gym. When one invites you, you decide here what it sees.",
  endedNote:
    "Even though you ended it, they can still see what you shared up to that date. Remove it if you don't want them to keep seeing it.",
  stop: 'Stop sharing',
  keep: 'Keep sharing',
  nutrition: (gym) => `Nutrition · ${gym}`,
  remove: 'Remove',
  removeLabel: (category) => `Stop sharing ${category}`,
  notShared: 'Not shared',
  line: {
    active: (level, date) => `${level} · since ${date}`,
    frozen: (date) => `They can still see what was shared up to ${date}`,
    revoked: (date) => `You stopped sharing it on ${date}`,
    declined: 'You chose not to share it',
  },
  caption: {
    ended: (date) => `Ended on ${date} · they don't see anything new`,
    active: (date, shared, total) =>
      `Active since ${date} · ${String(shared)} of ${String(total)} ${total === 1 ? 'category' : 'categories'}`,
  },
  revoke: {
    title: (what, gym) => `Stop sharing ${what} with ${gym}?`,
    kept: (what) => `They stop keeping ${what}, including what you already shared with them.`,
    seen: (what) => `They stop seeing ${what} right away.`,
    apart: 'Everything else you share stays the same: each permission is separate.',
    nothingDeleted: 'Nothing of yours is deleted. It stays in your Fitness ID.',
    final: "This can't be undone: sharing again will need a new permission.",
  },
}

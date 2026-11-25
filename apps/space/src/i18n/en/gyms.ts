import type { Dictionary } from '../es'

export const gyms: Dictionary['gyms'] = {
  title: 'Your gyms',
  loadFailed: "We couldn't load your gyms. Check your connection.",
  decideFailed: "We couldn't save your decision. Please try again.",
  wouldCover: (name) => `${name} would cover for your coach`,
  coverBody:
    'Until you decide, they see nothing. If you accept, they see the same as your coach, and only on those dates.',
  reject: 'Decline',
  accept: 'Accept',
  none: "You don't train with any gym yet.",
  active: 'Active',
  ended: 'Ended',
  activeBadge: 'Active',
  coach: (name) => `Coach: ${name}`,
  noCoach: 'No coach assigned yet',
  invitationNote:
    "If a gym invites you, the invitation waits for you in Today. Accepting doesn't share anything by itself.",
  waiting: (gym) => `${gym} is waiting for you at the end`,
  invited: (gym) => `${gym} invited you`,
  seeAndDecide: (expiry) => `View and decide · ${expiry}`,
  relationship: {
    loadFailed: "We couldn't load this relationship. Check your connection.",
    endFailed: "We couldn't end the relationship. Please try again.",
    activeSince: (date) => `Active since ${date}`,
    endedOn: (date) => `Ended on ${date}`,
    yourCoach: (name) => `Your coach: ${name}`,
    seesNothingNew: "They don't see anything new",
    whatHappened: 'What has happened',
    note: "This record can't be edited or deleted. If the gym gives a reason when ending, you don't see it, just as they don't see yours.",
    end: 'End the relationship',
    endWith: (name) => `End things with ${name}?`,
    endBody:
      'From today they receive nothing new from you. What you shared up to today stays frozen, and your history is still yours.',
    stay: 'Stay with them',
  },
}

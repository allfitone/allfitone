import type { Dictionary } from '../es'

export const notices: Dictionary['notices'] = {
  title: 'Notices',
  channels: 'Choose how we notify you',
  filter: {
    all: 'All',
    awaiting: (count: number) =>
      count > 0 ? `Need your decision · ${String(count)}` : 'Need your decision',
    label: 'Which notices to show',
  },
  groups: { awaiting: 'Need your decision', informational: 'For your information' },
  empty: {
    title: "You're all caught up",
    body: 'Invitations from your gym, what your coach proposes and anything that needs your decision arrive here.',
    awaiting: 'Nothing needs your decision.',
  },
  privacy: 'A notice never carries your data: it tells you what happened and brings you here.',
  more: 'Show more notices',
  unreadable: "We couldn't load your notices. Check your connection and try again.",
  unread: 'Unread',
  bell: (awaiting: number) =>
    awaiting > 0 ? `Your notices, ${String(awaiting)} need your decision` : 'Your notices',
  fallback: { gym: 'Your gym', professional: 'Your coach', aGym: 'A gym' },
  actions: { see: 'View', decide: 'Decide', review: 'Review' },
  closed: 'No longer waiting for your answer.',
  kinds: {
    client_invitation: {
      title: (gym: string) => `${gym} invites you`,
      line: 'Decide whether to accept and what they can see.',
    },
    cover_proposed: {
      title: 'A coach offers to cover for yours',
      line: (professional: string, gym: string) =>
        `${professional}, at ${gym}. Until you answer, they see nothing.`,
    },
    correction_proposed: {
      title: (professional: string) => `${professional} suggests correcting a workout`,
      line: 'Review the change before it counts.',
    },
    goal_proposed: {
      title: 'You have a proposed goal',
      line: (professional: string) => `${professional} proposed a new goal for you.`,
    },
    professional_changed: {
      title: 'You have a new coach',
      line: (professional: string, gym: string) => `${professional} now trains you at ${gym}.`,
    },
    relationship_ended: {
      title: (gym: string) => `${gym} ended your relationship`,
      line: 'From today they see nothing new from you.',
    },
    plan_paused: {
      title: (gym: string) => `Your plan with ${gym} is paused`,
      line: "The payment didn't go through. Once you pay, everything carries on.",
    },
    plan_resumed: {
      title: (gym: string) => `Your plan with ${gym} is active again`,
      line: 'Payment received. Everything carries on as before.',
    },
    plan_ended: {
      title: (gym: string) => `Your plan with ${gym} has ended`,
      line: 'You can see their plans whenever you like.',
    },
    program_assigned: {
      title: 'You were assigned a program',
      line: (program: string | null) =>
        program ? `“${program}” is now in your schedule.` : "It's now in your schedule.",
    },
    password_changed: {
      title: 'Your password was changed',
      line: "If it wasn't you, secure your account.",
    },
    email_changed: {
      title: 'Your email was changed',
      line: "If it wasn't you, secure your account.",
    },
  },
  time: {
    now: 'Now',
    minutes: (count: number) => `${String(count)} min ago`,
    hours: (count: number) => `${String(count)} h ago`,
    yesterday: 'Yesterday',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekday: (weekday: string, day: number) => `${weekday} ${String(day)}`,
    date: (day: number, month: string, year: number | null) =>
      year === null ? `${month} ${String(day)}` : `${month} ${String(day)}, ${String(year)}`,
  },
  expires: {
    today: 'Expires today',
    tomorrow: 'Expires tomorrow',
    days: (count: number) => `Expires in ${String(count)} days`,
  },
  push: {
    close: 'Close',
    title: 'Shall we notify you on your phone?',
    subtitle: "So you don't miss what needs your decision.",
    reasons: {
      rest: 'When your rest is over, even with your phone locked.',
      gym: 'When your gym invites you or your coach proposes something.',
      security: 'If something happens with your account security.',
    },
    footnote:
      'We never send your data in a notice, and you choose which notices you get in Profile.',
    activate: 'Turn on notifications',
    notNow: 'Not now',
    denied:
      "Your phone doesn't let us notify you. You can allow it in your phone's settings, under Allfit Space.",
    unavailable:
      "This version of the app can't receive notifications on your phone yet. We'll keep notifying you here and by email.",
    failed: "We couldn't turn on notifications on this phone. Try again.",
  },
}

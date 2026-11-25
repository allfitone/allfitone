import type { Dictionary } from '../es'

export const corrections: Dictionary['corrections'] = {
  title: 'Corrections',
  waiting: (name) => `${name} proposes a correction`,
  sections: { pending: 'Pending', decided: 'Decided' },
  empty:
    'No one has proposed a correction to you. If your coach spots something to fix, it shows up here.',
  cancelledStays:
    'A proposal cancelled because the relationship ended stays here as cancelled: it does not disappear.',
  unreadable: "We couldn't load your corrections. Check your connection and try again.",
  status: {
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
    expired: 'Expired',
    cancelled: 'Cancelled',
  },
  set: (exercise, number) => `${exercise} · set ${String(number)}`,
  anExercise: 'Exercise',
  freeSession: 'Free session',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  day: (day, month) => `${month} ${String(day)}`,
  sessionDay: (weekday, day, month) => `${weekday}, ${month} ${String(day)}`,
  expiresOn: (date) => `expires ${date}`,
  today: 'today',
  yesterday: 'yesterday',
  expiresIn: (days) =>
    days <= 0
      ? 'Expires today'
      : days === 1
        ? 'Expires tomorrow'
        : `Expires in ${String(days)} days`,
  proposal: {
    title: 'Proposed correction',
    proposes: (name) => `${name} proposes`,
    coachAt: (organization) => `Your coach at ${organization}`,
    registered: 'What you logged',
    proposed: 'What they propose',
    why: 'Why',
    quoted: (reason) => `“${reason}”`,
    reps: (count) => `${String(count)} ${count === 1 ? 'rep' : 'reps'}`,
    rpe: (value) => `RPE ${value}`,
    nothingChanges:
      "Nothing changes until you accept. If you don't answer, it expires and stays as it was.",
    originalKept:
      'If you accept, your original entry is kept along with who proposed the change and why. The data is still yours.',
    reject: 'Reject',
    accept: 'Accept',
    opening: 'Opening the proposal…',
    gone: 'This proposal is no longer available.',
    accepted: (date) =>
      `You accepted it on ${date}. Your original entry is kept along with who proposed it and why.`,
    rejected: (date) => `You rejected it on ${date}. Your entry stays as it was.`,
    expired: (date) => `It expired on ${date} without an answer. Your entry stays as it was.`,
    cancelled: {
      target_changed: 'It was cancelled because you corrected that session before deciding.',
      session_annulled: 'It was cancelled because you deleted that session.',
      session_hidden: (organization) =>
        `It was cancelled because you hid that session from ${organization}.`,
      relationship_terminated: (organization) =>
        `It was cancelled because your relationship with ${organization} ended. Your entry stays as it was.`,
      other: 'It was cancelled. Your entry stays as it was.',
    },
  },
  failure: {
    closed: 'This proposal is no longer open: it expired, was cancelled or you already decided.',
    gone: 'This proposal no longer exists.',
    session: 'Your session expired. Sign in again to continue.',
    refused: "We couldn't save your decision. It's our fault, not yours.",
    offline: "We couldn't save your decision. Check your connection and try again.",
  },
}

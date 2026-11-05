/** The landing's words in English. The shape is set by `es.ts`. */

import type { Dictionary } from './es'

export const en: Dictionary = {
  meta: {
    title: 'Allfit Studio · Software for personal trainers and gyms',
    description:
      'Bring your clients, their training programs and every session they log into one panel. For personal trainers, studios and gyms.',
    shareImageAlt:
      'Allfit Studio’s front page: “Your plan. Their session. One panel.”, beside a client’s sheet comparing what was planned with what was logged.',
  },
  nav: {
    label: 'Main',
    how: 'How it works',
    privacy: 'Privacy',
    modules: 'Modules',
    language: 'Language',
    enter: 'Sign in',
  },
  links: {
    newTab: '(opens in a new tab)',
  },
  partialLogout: {
    title: 'You were signed out on this device',
    description:
      'We could not confirm the whole remote sign-out. If you sign in again, complete the access with the identity provider once more.',
  },
  hero: {
    title: ['Your plan.', 'Their session.', 'One panel.'],
    lead: 'Allfit Studio brings together your clients, their programs and what they log in every session. Compare the plan with what happened and adjust without losing the thread.',
    cta: 'Create my space',
    note: 'Already have an account? The same button takes you to your space.',
  },
  people: {
    title: 'People',
    laura: 'Session logged',
    camilo: 'Accepted your invitation',
    valentina: 'Program assigned',
  },
  sheet: {
    program: 'Strength · Program v3 · Week 4',
    shared: 'Shares their training and progress with you',
    columns: { exercise: 'Exercise', planned: 'Plan', logged: 'Logged' },
    exercises: {
      squat: 'Back squat',
      bench: 'Bench press',
      row: 'Barbell row',
      deadlift: 'Romanian deadlift',
    },
    changes: { bench: 'One set fewer', row: 'Two more reps' },
    footer: 'Logged today, 07:42',
  },
  sharing: {
    yours: 'What they share with you',
    shared: 'Shared',
    notShared: 'Not shared',
    categories: {
      training: 'Training',
      progress: 'Progress',
      nutrition: 'Nutrition',
      health: 'Health context',
    },
  },
  how: {
    title: ['From the plan', 'to what happened.'],
    steps: {
      invite: {
        title: 'Invite your clients',
        text: 'The relationship starts when the person accepts your invitation with their Fitness ID. They choose what to share with you.',
      },
      versions: {
        title: 'Assign their program',
        text: 'Build templates, assign them and adjust them without losing what came before: every version is kept.',
      },
      week: {
        title: 'Compare and adjust',
        text: 'Every logged session appears next to what you planned. You see the whole week and where to adjust.',
      },
    },
    versions: {
      template: 'Upper and lower body',
      current: 'Current',
      notes: {
        v3: 'Assigned on October 14',
        v2: 'More pulling volume',
        v1: 'Starting point',
      },
    },
    week: {
      title: 'This week',
      count: '12 of 16 blocks',
      days: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' },
      note: 'Saturday not logged · review next week’s load',
    },
  },
  privacy: {
    title: ['You only see what', 'they share.'],
    lead: 'Each person decides which categories your organization sees and can withdraw them whenever they want. Studio respects that on every screen.',
    pillars: {
      consent: {
        title: 'Each person decides',
        text: 'Accepting your invitation shares nothing on its own. The person chooses what you see, category by category.',
      },
      purpose: {
        title: 'Your team sees only what it needs',
        text: 'Each team member sees the people assigned to them, and only what those people share. Being an owner or an administrator grants no access on its own.',
      },
      history: {
        title: 'Their history is theirs',
        text: 'If the relationship ends, your organization stops seeing it and the person keeps everything they trained.',
      },
    },
  },
  modules: {
    title: ['What you manage', 'from Studio.'],
    lead: 'What you keep in spreadsheets and chats today, in one place.',
    items: {
      people: {
        name: 'People',
        description: 'Invitations, relationships and client follow-up',
      },
      training: {
        name: 'Training',
        description: 'Templates, programs, assignments and version history',
      },
      progress: {
        name: 'Progress',
        description: 'Logged sessions, adherence and shared results',
      },
      team: { name: 'Team', description: 'Members, roles and permissions' },
      plans: {
        name: 'Plans',
        description:
          'Plans you sell and active subscriptions. Every payment goes through your own payment gateway.',
      },
    },
    upcoming: {
      label: 'Coming later',
      text: 'Scheduling and bookings, classes and capacity, a public page and a marketplace.',
    },
    space: {
      title: 'Your clients train in Allfit Space',
      text: 'There they follow the program you assign, log every set and decide what to share with you.',
      cta: 'Discover Allfit Space',
    },
  },
  closing: {
    title: ['Your next client', 'starts with an invitation.'],
    cta: 'Create my space',
    note: 'Your Allfit One account works in both Studio and Space.',
  },
  footer: {
    nvidia: 'Allfit One is a member of NVIDIA Inception.',
    privacy: 'Privacy',
    rights: '© 2026 Allfit One',
  },
}

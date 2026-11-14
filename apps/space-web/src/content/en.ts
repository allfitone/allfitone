/** English copy. Its shape is the Spanish dictionary's, enforced by the type. */

import type { Dictionary } from './es'

export const en: Dictionary = {
  meta: {
    title: 'Allfit Space | Training and nutrition app',
    description:
      "Training and nutrition app: follow a programme for your goal, beat last time's sets and track your meals against your target. Free.",
    shareImageAlt: 'An athlete sets up a deadlift with a loaded barbell in a dimly lit gym.',
  },
  nav: {
    skip: 'Skip to content',
    label: 'Main',
    features: 'The app',
    programs: 'Programmes',
    privacy: 'Privacy',
    gyms: 'Gyms',
    language: 'Language',
    home: 'Allfit Space, home',
    join: 'Join the list',
  },
  stores: {
    soon: 'Coming soon on',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    download: 'Get it on',
  },
  hero: {
    lines: ['BEAT', 'YOUR LAST', 'SESSION.'],
    lead: 'A programme for your goal, every set logged and what you eat against your target. All in one app, so your next session beats this one.',
    join: 'Join the waitlist',
    todayAlt: "Allfit Space Today screen: the day's Pull session and the week at a glance.",
    programAlt: 'Upper and lower programme detail: 10 weeks, 4 days a week and its sessions.',
  },
  features: {
    title: ['FROM THE FIRST SET', 'TO THE LAST BITE.'],
    cards: [
      {
        title: 'YOUR WEEK, AT A GLANCE',
        text: "What's on today and how far into the week you are.",
        alt: "Today screen with the weekly summary and the sessions you've done.",
      },
      {
        title: 'EVERY SET COUNTS',
        text: 'See what you lifted last time and beat it, set by set.',
        alt: 'Session in progress with pull-up sets and the previous weight.',
      },
      {
        title: 'WHAT YOU EAT, AGAINST YOUR GOAL',
        text: "The day's calories and macros against the goal that comes with your programme.",
        alt: "The day's meals with calories and macros against the goal.",
      },
    ],
  },
  programs: {
    title: ['A PROGRAMME', 'FOR YOUR GOAL.'],
    lead: "Tell it what you want to achieve and how much you've trained, and the app suggests where to start. Strength, hypertrophy, running or getting moving again.",
    items: [
      { name: 'UPPER AND LOWER', meta: '4 days · 10 weeks' },
      { name: 'BASIC STRENGTH', meta: '3 days · 8 weeks' },
      { name: 'HALF MARATHON', meta: '4 days · 12 weeks' },
      { name: 'PUSH · PULL · LEGS', meta: '5 days · 12 weeks' },
    ],
  },
  privacy: {
    title: ['YOUR DATA', 'IS YOURS.'],
    lead: 'Your gym and your coach see only what you accept, category by category. And you take it back whenever you want, without losing anything of yours.',
    alt: 'What you share screen: each gym with the categories it can see.',
    pillars: [
      {
        title: 'Nothing is shared on its own',
        text: 'Accepting a gym shows it nothing. You decide whether it sees your training with them, your measurements and photos, or your meals.',
      },
      {
        title: 'Cut it off whenever you want',
        text: 'Tap “Remove” and they stop seeing it at once. If you end things with a gym, it keeps only what you shared up to that day, and you can take that back too.',
      },
      {
        title: 'You leave with everything',
        text: 'If you leave a gym, your programmes, your sets and your records stay in your account, and you pick up where you left off.',
      },
    ],
  },
  records: {
    title: ['EVERY', 'RECORD', 'COUNTS.'],
    lead: 'Finish your workout and the app already has your card ready: your record, the muscles you worked or your own photo. One tap from your stories.',
    steps: [
      { verb: 'FINISH', text: 'The card is built from your real data.' },
      { verb: 'CHOOSE', text: 'Muscles, a record or your photo behind it.' },
      { verb: 'POST', text: 'Straight to your stories, no screenshots.' },
    ],
    cards: [
      'Muscles card: lats and upper back, worked in the Pull session.',
      'Personal record card: 35 kg pull-ups, 2.5 kg more than last time.',
      'Workout completed card with a photo: Pull session, 26:05 and 1,920 kg in total.',
    ],
    editor: {
      label: 'Preview of a story ready to post',
      caption: 'Add a caption…',
      story: 'Your story',
      friends: 'Friends',
      published: 'Shared to your story',
    },
  },
  invite: {
    title: ['INVITE FRIENDS,', 'EARN PRO.'],
    highlight: 'PRO',
    text: 'Every friend who joins with your code and uses the app counts, whether they pay or not.',
    rewards: {
      5: '1 month of Pro',
      15: '2 months of Pro',
      30: '3 months of Pro',
      100: '1 year of Pro + merch',
    },
  },
  pro: {
    title: ['DOES YOUR GYM', 'PAY FOR ALLFIT STUDIO?', 'PRO IS INCLUDED.'],
    highlight: 'ALLFIT STUDIO',
    text: 'The app is free. Allfit Pro gives you unlimited programmes and all your progress in detail. If your gym or your coach has a paid Allfit Studio plan, Pro is included while you stay with them.',
    alt: 'Athlete doing a biceps curl with a dumbbell in each hand.',
  },
  studio: {
    title: 'Do you run a gym or coach others?',
    text: 'Invite your clients, assign their programme and follow them from Allfit Studio.',
    cta: 'Discover Allfit Studio',
  },
  closing: {
    title: ['EVERY WEEK,', 'A LITTLE MORE.'],
  },
  waitlist: {
    title: ['BE AMONG', 'THE FIRST 100.'],
    lead: "Join the waitlist and we'll let you know when Allfit Space opens. The first 100 people to confirm their email become its Founding Members.",
  },
  form: {
    nameLabel: 'Your name',
    emailLabel: 'Your email',
    consent: 'I authorise Allfit One to process my data under its [privacy policy].',
    referredBy: "You're joining with code {code}.",
    submit: 'Join the list',
    pending: 'One moment…',
    errorNameEmpty: 'Enter your name to join.',
    errorEmailEmpty: 'Enter your email to join.',
    errorEmailInvalid: 'Check the email: it needs the form name@email.com.',
    errorConsent: 'We need your authorisation to add you.',
    failed: "We couldn't add you. Try again or write to us at {email}.",
    joinedTitle: "You're on the list, {name}.",
    joinedBody: 'Confirm your email with the link we sent to {email}. Your place counts from then.',
    codeLabel: 'Your code',
    linkLabel: 'Your link',
    copy: 'Copy',
    copied: 'Copied',
    copiedAnnouncement: 'Link copied.',
    whatsapp: 'Share on WhatsApp',
    share: 'Share',
    shareMessage:
      "I joined the waitlist for Allfit Space, Allfit One's training and nutrition app. Join with my link: {link}",
    registered: 'Signed up with your link: {count}.',
    rewardRule:
      'Allfit Pro rewards count active referrals: from launch, they create an account and log 3 workouts or meals in their first 14 days.',
    reset: 'Use another email',
    errorEmailDisposable:
      "That's a disposable address. Use one you check: your confirmation goes there.",
    rateLimited: 'Too many attempts from this connection. Try again in an hour.',
    listedTitle: 'You were already on the list, {name}.',
    listedBody:
      "We wrote to {email} again: that email has your link, or the link to confirm if you haven't yet.",
  },
  founding: {
    title: 'Founding Members',
    rows: [
      {
        term: 'Your number',
        value:
          'From #001 to #100, in the order you confirm your email. It stays on your Allfit Space profile.',
      },
      {
        term: 'Early access',
        value: 'You get into Allfit Space before launch, in a closed beta.',
      },
      {
        term: 'Allfit Pro',
        value:
          "The founder price on the monthly plan, for life as long as you don't cancel. It's yours if you subscribe within 6 months of launch.",
      },
      {
        term: 'The team',
        value:
          "A direct channel with the people building Allfit Space, to suggest improvements and see what's next first.",
      },
    ],
  },
  referrals: {
    title: 'Invite friends, earn Allfit Pro',
    text: 'When you join you get a link of your own. Everyone who joins through it counts toward your level once active: they create an Allfit Space account after launch and log 3 workouts or meals in their first 14 days.',
    people: '{count} active referrals',
    rewards: {
      5: '1 month of Allfit Pro',
      15: '2 months of Allfit Pro',
      30: '3 months of Allfit Pro',
      100: '1 year of Allfit Pro and Allfit One merch',
    },
    note: 'Every level you reach adds its reward: with 30 active referrals you get 6 months of Allfit Pro.',
  },
  waitlistPage: {
    meta: {
      title: 'Waitlist | Allfit Space',
      description:
        'Join the Allfit Space waitlist: the first 100 people to confirm their email become Founding Members, and everyone you invite brings you closer to months of Allfit Pro.',
    },
    title: ['THE FIRST 100', 'ARE FOUNDING', 'MEMBERS.'],
    lead: "Join the waitlist and we'll let you know when Allfit Space opens. If you're among the first 100 people to confirm their email, you join as a Founding Member. And everyone who joins through your link brings you closer to months of Allfit Pro.",
    joinTitle: 'Join the waitlist',
    pro: {
      title: 'What Allfit Pro is',
      text: 'Allfit Space is free. Allfit Pro is its optional subscription: unlimited programmes and all your progress in detail.',
      rows: [
        {
          term: 'If your gym pays for Allfit Studio',
          value:
            "If your gym or your coach has a paid Allfit Studio plan, Allfit Pro is included while you stay with them. Studio's free plan doesn't include it.",
        },
        {
          term: 'Your data',
          value:
            'Controlling it is never paid for. Deciding what you share and with whom is free on every plan.',
        },
        {
          term: 'If you go back to the free plan',
          value:
            'Nothing is deleted. On the free plan you see your last month; with Allfit Pro you see it all again.',
        },
      ],
    },
    terms: {
      title: 'Terms',
      items: [
        'Founding Members are the first 100 people who join the waitlist and confirm their email. Their number, from #001 to #100, follows the order in which they confirm it.',
        'To keep it, create your Allfit Space account with the same email during the closed beta or within 7 days of launch. Otherwise, your place passes to the next person on the list.',
        "The founder price applies to the monthly Allfit Pro plan if you subscribe within 6 months of launch, and stays yours while you don't cancel, even if the price goes up. If you cancel, you lose it; a failed payment while the store retries it is not a cancellation.",
        "The status is personal and can't be transferred. You only lose it if you delete your account or for proven fraud.",
        'Someone you invite counts toward your total when they join with your link or code and confirm their email. For rewards they count once active: they create their Allfit Space account after launch, with the same email, and log at least 3 workouts or meals in their first 14 days. Each person counts once.',
        "Levels add up: you get the reward for every level you reach. Thirty active referrals are 1 + 2 + 3 = 6 months of Allfit Pro. Being a Founding Member doesn't stop you from earning them.",
        'Months of Allfit Pro arrive as an App Store or Google Play offer code. When they end, the subscription renews automatically unless you cancel it in the store first.',
        "Disposable emails, repeated sign-ups from the same device, and inviting yourself don't count.",
        'Nothing is drawn by lot: places go by order and rewards by the number of active referrals.',
      ],
    },
  },
  linkPages: {
    checking: 'Checking your link…',
    failedTitle: "We couldn't check your link.",
    failedBody: 'Try again in a moment. If it keeps happening, write to us at {email}.',
    rateLimited: 'Too many attempts from this connection. Try again in an hour.',
    retry: 'Try again',
    home: 'Go to Allfit Space',
    confirm: {
      meta: {
        title: 'Confirm your email | Allfit Space',
        description: 'Confirm your email so your place on the Allfit Space waitlist counts.',
      },
      pending: 'Confirming your email…',
      confirmedTitle: 'Email confirmed.',
      confirmedBody:
        "Your place on the list counts from now. We'll write to this address when Allfit Space opens.",
      alreadyTitle: 'Your email was already confirmed.',
      alreadyBody:
        "Your place on the list still counts. We'll write to you when Allfit Space opens.",
    },
    referrals: {
      meta: {
        title: 'Your link | Allfit Space',
        description: 'Your code, your link and how many people joined with it.',
      },
      title: 'Your Allfit Space link',
      body: 'Everyone who joins with your link and confirms their email adds to your count.',
      unconfirmedTitle: 'Your email is not confirmed.',
      unconfirmedBody:
        'Find the Allfit Space email in your inbox and open its link: your place on the list counts from then.',
      leave: 'Leave the list',
    },
    leave: {
      meta: {
        title: 'Leave the list | Allfit Space',
        description: 'Leave the Allfit Space waitlist and delete your data.',
      },
      title: 'Are you sure you want to leave the list?',
      body: 'We delete your name, your email and your code. You lose your place, and the people you invited stay on the list but stop counting for you. It cannot be undone.',
      submit: 'Yes, leave the list',
      pending: 'Leaving…',
      stay: 'Stay on the list',
      leftTitle: 'You left the list.',
      leftBody:
        'We deleted your data and every link we sent you stopped working. If you change your mind, you can join again.',
      join: 'Join again',
    },
    invalid: {
      title: 'This link no longer works.',
      body: "It may be incomplete, expired, or belong to someone who left the list. Enter your email and, if it's on the list, we'll send you a new one.",
      emailEmpty: 'Enter your email to get the link.',
      submit: 'Send me a new link',
      sentTitle: 'Check your email.',
      sentBody: 'If {email} is on the list, an email with a new link reaches you within minutes.',
    },
  },
  nvidia: {
    member: 'Allfit One is a member of NVIDIA Inception.',
    trademark:
      '© 2026 NVIDIA, the NVIDIA logo, and NVIDIA Inception are trademarks and/or registered trademarks of NVIDIA Corporation in the U.S. and other countries.',
    alt: 'NVIDIA Inception Program',
  },
  footer: {
    terms: 'Terms',
    privacy: 'Privacy',
    analytics: 'Analytics',
    studio: 'Allfit Studio',
    rights: '© 2026 Allfit One',
    newWindow: 'Opens in a new tab.',
  },
}

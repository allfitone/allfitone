import type { Dictionary } from '../es'

const months = (count: number) => (count === 1 ? 'month' : `${String(count)} months`)

export const plans: Dictionary['plans'] = {
  dayMonth: (day, month) => `${month} ${String(day)}`,
  free: 'Free',
  included: 'included',
  renewal: {
    grace: (date) => `We couldn't renew: you keep Pro until ${date}`,
    suspended: 'Payment pending: Pro is paused',
    renews: (date) => `Renews on ${date}`,
    ends: (date) => `Ends on ${date}, won't renew`,
  },
  gymWarning: (gym) =>
    `You already have Pro through ${gym}. Paying for it only means you no longer depend on that membership.`,
  waitingForFeatures: "Soon you'll see every Pro feature and its limit here.",
  feature: {
    active_personal_programs: (limit) =>
      limit === null
        ? 'Unlimited programs of your own'
        : `Up to ${String(limit)} active ${limit === 1 ? 'program' : 'programs'} of your own`,
    own_routines: (limit) =>
      limit === null
        ? 'Unlimited routines of your own'
        : `Up to ${String(limit)} ${limit === 1 ? 'routine' : 'routines'} of your own`,
    training_history_months: (limit) =>
      limit === null ? 'Your whole history' : `History from the last ${months(limit)}`,
    nutrition_history_months: (limit) =>
      limit === null ? 'Your whole meal history' : `Meal history from the last ${months(limit)}`,
    routine_duplication: () => 'Duplicate routines',
    full_program_catalogue: () => 'The whole program catalogue',
    period_analysis: () => 'Compare your periods',
    body_measurements: () => 'All your measurements',
    body_photos: () => 'Progress photos',
    meal_photo_recognition: () => 'Meals from a photo with AI',
  },
  unknownFeature: (name, limit) =>
    limit === null ? `${name}, unlimited` : `${name}: up to ${String(limit)}`,
  without: {
    full_program_catalogue: 'A selection of programs',
    period_analysis: 'A summary of each session',
    body_measurements: 'Weight and height',
    meal_photo_recognition: 'Meals by searching foods',
  },
  period: {
    month: { fee: 'Monthly fee', per: '/month' },
    year: { fee: 'Yearly fee', per: '/year' },
  },
  otherFee: 'Fee',
  upgrade: {
    window: (count) => `the last ${months(count ?? 1)}`,
    training_history_months: {
      title: 'Your whole history, with Pro',
      body: (window) =>
        `On Free you see ${window}. Everything older is still kept: with Pro you see it again.`,
    },
    nutrition_history_months: {
      title: 'All your meals, with Pro',
      body: (window) =>
        `On Free you see meals from ${window}. Everything older is still kept: with Pro you see it again.`,
    },
    active_personal_programs: {
      title: 'Several programs at once',
      body: (count) =>
        `On Free you follow ${String(count)} ${count === 1 ? 'program' : 'programs'} of your own at a time. With Pro, as many as you like. Your gym's programs never count.`,
    },
    own_routines: {
      title: 'Unlimited routines',
      body: (count) =>
        `On Free you keep up to ${String(count)} ${count === 1 ? 'routine' : 'routines'} of your own. With Pro, as many as you like: the ones you have stay.`,
    },
    routine_duplication: {
      title: 'Duplicate your routines',
      body: 'With Pro you copy one of your routines and change it without touching the original.',
    },
    full_program_catalogue: {
      title: "Allfit's whole catalogue",
      body: 'On Free you get a selection to start with. With Pro, every program for your goal and your level.',
    },
    period_analysis: {
      title: 'Compare your periods',
      body: 'With Pro you see your loads, volume and consistency week by week or month by month.',
    },
    body_measurements: {
      title: 'All your measurements',
      body: 'On Free you log your weight and height. With Pro, also waist, arm, body fat and more.',
    },
    body_photos: {
      title: 'Progress photos',
      body: 'With Pro you keep photos of your body, just for you, and compare them over time.',
    },
    meal_photo_recognition: {
      title: 'Log with a photo',
      body: 'With Pro you take a photo of your plate and the app recognises what you eat. Searching foods stays free.',
    },
    other: {
      title: 'This is part of Pro',
      body: "Your plan doesn't include this feature. With Pro you have it, along with everything else.",
    },
    compare: 'Compare Free and Pro',
    notNow: 'Not now',
  },
  rows: {
    sessions: 'Sessions, loads and offline',
    full_program_catalogue: 'Allfit programs',
    training_history_months: 'History',
    period_analysis: 'Analysis',
    body_measurements: 'Body progress',
    meal_photo_recognition: 'Nutrition',
    nutrition_history_months: 'Meal history',
    active_personal_programs: 'Active programs of your own',
    own_routines: 'Routines of your own',
    routine_duplication: 'Duplicate routines',
    organization: "Your gym's programs",
    privacy: 'Privacy and your data',
  },
  cells: {
    notIncluded: 'Not included',
    complete: 'Complete',
    lastMonth: 'Last month',
    lastMonths: (count) => `Last ${String(count)} months`,
    upTo: (count) => `Up to ${String(count)}`,
    unlimited: 'Unlimited',
    basicSelection: 'Basic selection',
    fullCatalogue: 'Full catalogue',
    sessionSummary: 'Session summary',
    loadsVolumeConsistency: 'Loads, volume and consistency',
    measuresAndPhotos: 'Measurements and photos',
    measures: 'Measurements',
    weight: 'Weight',
    logAndGoals: 'Logging and goals',
    logGoalsAndPhotos: 'Logging, goals and AI photos',
  },
  plan: {
    title: 'Your plan',
    unavailable: "We couldn't load your plan. Check your connection and try again.",
    renewal: 'Renewal',
    expiry: 'Expiry',
    gym: 'Gym',
    inApp: 'In the app',
    payNothing: 'You pay nothing',
    eachPlan: 'What each plan includes',
    sideBySide: 'Free and Pro, side by side',
    payments: 'Your payments',
    charges: (count) => (count === 1 ? '1 charge' : `${String(count)} charges`),
    chargesLast: (count, date) =>
      `${count === 1 ? '1 charge' : `${String(count)} charges`} · the last on ${date}`,
    manageIn: (store) => `Manage in ${store}`,
    changeOrCancel: 'Change or cancel the subscription',
    whileAtGym: (gym) =>
      `You have it while you stay at ${gym} and the gym is active. If that changes, you move to the free plan without losing anything.`,
    includes: 'What it includes',
    gymInvites: 'If a gym invites you, you get Pro without paying.',
    cancel: 'Cancel Pro',
    meetPro: 'Discover Allfit Pro',
    inviteTitle: 'All of Allfit, without\ndepending on a gym',
    meet: 'Discover Pro',
    card: { yourPlan: 'Your plan', active: 'Active', free: 'FREE' },
  },
  cancelSheet: {
    title: 'Cancel Allfit Pro?',
    until: (date) => `You keep Pro until ${date}`,
    keepsHistory: 'No data is deleted. You move to the free plan and still see your whole history.',
    keepsPermissions: "Your permissions and your gyms don't change.",
    keepsGym: 'If an active gym signs you up, you get Pro back without paying.',
    paidWith: (store) => `You pay through ${store}, so you cancel it in your ${store} account.`,
    keep: 'Keep Pro',
    cancelIn: (store) => `Cancel in ${store}`,
  },
  payments: {
    title: 'Your payments',
    unavailable: "We couldn't load your payments. Check your connection and try again.",
    none: 'There are no Allfit Pro charges yet.',
    lastCharge: 'Your last charge',
    since: (date) => `You've paid for Pro since ${date}`,
    through: (store) => `Through ${store}`,
    charges: 'Charges',
    paid: 'Paid',
    failed: (store) => `${store} couldn't charge`,
    receipts: (store) =>
      `Your receipts and your card are in your ${store} account. Allfit never sees your card.`,
    theStore: 'store',
  },
  compare: {
    unavailable: "We couldn't load the plans. Check your connection and try again.",
    notOnSale: "Pro isn't on sale in this store yet.",
    per: { month: '/month', year: '/year' },
    renews: { month: 'every month', year: 'every year' },
    store: { app_store: 'the App Store', google_play: 'Google Play' },
    theStore: 'the store',
    alreadyPro: "You're Pro · Manage",
    proWithGym: (gym) => `You already have Pro with ${gym}`,
    becomePro: 'Go Pro',
    becomeProAt: (price) => `Go Pro · ${price}`,
    renewsAlone: 'Your plan renews automatically. Cancel it anytime from the store.',
    whileWithGym:
      "While you stay with them you pay nothing more. If you leave the gym, you'll be able to subscribe here.",
    renewsUntil: (every, store) => `Renews ${every} until you cancel it in ${store}.`,
    seal: 'Free and Pro',
    headline: 'Your progress, no ceiling',
    headlineLines: ['YOUR PROGRESS,', 'NO', 'CEILING.'],
    lede: 'Training is free, always. Pro opens your full history, your progress analysis and nutrition with AI.',
    dataFreeTitle: 'Your data is never charged for',
    dataFreeBody:
      'Deciding what you share, seeing it, downloading it and deleting it is free on both plans. If you go back to Free you lose nothing: you just stop seeing it.',
    gymIncludes: 'Does your gym use Allfit? Pro comes included while you stay with them.',
    close: 'Close',
    restore: 'Restore purchases',
    terms: 'Terms',
    privacy: 'Privacy',
  },
  purchase: {
    notTaken:
      "The store charged you, but we couldn't confirm your purchase. Try again with «Restore purchases»; you won't be charged again.",
    storeFailed: "The store couldn't complete the purchase. Please try again in a moment.",
    nothingToRestore: "We didn't find any Allfit Pro purchases on this store account.",
  },
  carousel: {
    title: 'What Pro opens',
    card: (at, total) => `Card ${String(at)} of ${String(total)}`,
    cards: [
      {
        label: 'History',
        title: 'EVERYTHING\nYOU HAVE TRAINED.',
        pro: 'Every session since day one, a tap away.',
        free: "On Free you see the last month. Nothing older is deleted: it's still kept, and with Pro you see it again.",
      },
      {
        label: 'Analysis',
        title: 'SEE HOW FAR\nYOU HAVE COME.',
        pro: 'Your loads, volume and consistency, week by week or month by month.',
        free: 'On Free you get a summary of each session. With Pro you see your loads climb month by month.',
      },
      {
        label: 'Nutrition',
        title: 'ONE PHOTO\nAND DONE.',
        pro: 'Take a photo of your plate and the app recognises what you eat.',
        free: 'On Free you log by searching your foods and set your goal.',
      },
      {
        label: 'Body',
        title: 'WATCH YOURSELF\nCHANGE.',
        pro: 'Measurements and progress photos, just for you.',
        free: 'On Free you log your weight and height.',
      },
      {
        label: 'Programs',
        title: 'THE WHOLE\nCATALOGUE.',
        pro: 'Every Allfit program, for your goal and your level.',
        free: 'On Free you get a selection to start with.',
      },
      {
        label: 'Your programs',
        title: 'CREATE ALL\nYOU WANT.',
        pro: 'Unlimited routines and programs of your own, and duplicate routines.',
        free: 'On Free, one program of your own at a time and up to three routines.',
      },
    ],
    sessionsOf: 'of 86 sessions in view',
    sessionsAll: 'sessions, all in view',
    lastMonth: 'Last month',
    kept: 'Kept · with Pro',
    comparePro: 'Comparing periods is Pro',
    squatMonth: 'Squat · in one month',
    protein: (grams) => `${String(grams)} g protein`,
    waist: 'Waist',
    arm: 'Arm',
    weight: 'Weight',
    activePrograms: 'Active programs',
    ownRoutines: 'Your routines',
    sideBySide: 'Side by side',
    rowLabel: (label, free, pro) => `${label}. Free: ${free}. Pro: ${pro}.`,
  },
  gym: {
    title: 'Gym plans',
    readFailed: "We couldn't load your plans. Please try again.",
    perMonth: 'per month',
    perYear: 'per year',
    status: { active: 'Up to date', suspended: 'Paused', ended: 'Ended' },
    paused: (gym) =>
      `${gym} paused your plan over a pending payment. Your future sessions with them are paused, but nothing was deleted: your history is complete and the permissions you gave still stand. Once the payment is settled, everything comes back without you having to accept anything again.`,
    cancellation: (gym) =>
      `You stop paying ${gym}. Your Fitness ID, your history and what you logged are still yours. Cancelling the payment doesn't end your relationship with the gym or take back the permissions you gave it: if you want that too, it's decided separately.`,
    cancelThis: 'Cancel this plan',
    noneTitle: "You don't pay for any plan",
    noneBody:
      "If your gym has plans, you can see them below. Training and paying are separate things: you don't need a plan to keep using the app.",
    whereYouTrain: 'Where you train',
    seePlans: (gym) => `See ${gym}'s plans`,
    gatewayNote:
      'Each gym handles billing through its own payment gateway. Allfit never stores your card details.',
    cancelTitle: (gym) => `Cancel your plan with ${gym}?`,
    confirmCancel: 'Yes, cancel the plan',
    leaveIt: 'Leave it as is',
    refusal: {
      notOffered:
        "This plan is no longer available. Reload the gym's plans to see the ones that are.",
      cannotCharge: (gym) =>
        `${gym} can't receive payments yet, or you already have a plan with them. Talk to the gym: it isn't something you can fix from here.`,
      alreadyPaying: (gym) => `You already have a plan with ${gym}.`,
      unavailable: "We couldn't create the plan. You weren't charged, so you can try again.",
    },
    cancelRefusal: {
      notFound: 'This plan is gone. Reload your plans to see where they stand now.',
      unavailable: "We couldn't cancel the plan. Nothing changed, so you can try again.",
    },
    offers: {
      readFailed: "We couldn't load the plans. Please try again.",
      yourGym: 'your gym',
      subscribe: 'Subscribe',
      noneTitle: "This gym hasn't published any plans",
      noneBody: 'You can keep training all the same. If you expected a plan, ask the gym.',
      gatewayNote:
        "Payment happens on the gym's payment gateway. Allfit never sees or stores your card details.",
      confirmTitle: (plan) => `Subscribe to the ${plan} plan?`,
      confirmBody: (price, period, gym) =>
        `You'll pay ${gym} ${price} ${period}. The price stays fixed at what you see now: if the gym raises it later, yours doesn't change.`,
      notPermission:
        "Subscribing doesn't give access to any of your data. What the gym can see is decided only when you accept a relationship, and that doesn't change here.",
      confirm: 'Yes, subscribe',
      back: 'Back',
    },
  },
}

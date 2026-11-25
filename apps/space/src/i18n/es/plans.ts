/**
 * Allfit Pro and gym plans: «Tu plan», «Tus pagos», the comparison, the sheet that offers
 * Pro at a limit, and the plans a gym sells. Who pays, in one line, lives in `pro`.
 */
export const plans = {
  /** «3 oct»; `month` is the short name from `common.months`. */
  dayMonth: (day: number, month: string) => `${String(day)} ${month}`,
  free: 'Gratis',
  included: 'incluido',
  renewal: {
    grace: (date: string) => `No pudimos renovar: sigues con Pro hasta el ${date}`,
    suspended: 'Cobro pendiente: Pro está en pausa',
    renews: (date: string) => `Renueva el ${date}`,
    ends: (date: string) => `Termina el ${date}, no se renueva`,
  },
  gymWarning: (gym: string) =>
    `Ya tienes Pro por ${gym}. Pagarlo solo te sirve para no depender de esa afiliación.`,
  waitingForFeatures: 'Muy pronto verás aquí cada función de Pro y su límite.',
  /** Each known function at a limit; `null` is unlimited. */
  feature: {
    active_personal_programs: (limit: number | null) =>
      limit === null
        ? 'Programas propios sin límite'
        : `Máximo ${String(limit)} ${limit === 1 ? 'programa propio activo' : 'programas propios activos'}`,
    own_routines: (limit: number | null) =>
      limit === null
        ? 'Rutinas propias sin límite'
        : `Máximo ${String(limit)} ${limit === 1 ? 'rutina propia' : 'rutinas propias'}`,
    training_history_months: (limit: number | null) =>
      limit === null
        ? 'Todo tu historial'
        : limit === 1
          ? 'Historial del último mes'
          : `Historial de los últimos ${String(limit)} meses`,
    nutrition_history_months: (limit: number | null) =>
      limit === null
        ? 'Todo tu historial de comidas'
        : limit === 1
          ? 'Historial de comidas del último mes'
          : `Historial de comidas de los últimos ${String(limit)} meses`,
    routine_duplication: () => 'Duplicar rutinas',
    full_program_catalogue: () => 'Todo el catálogo de programas',
    period_analysis: () => 'Comparar tus periodos',
    body_measurements: () => 'Todas tus medidas',
    body_photos: () => 'Fotos de tu progreso',
    meal_photo_recognition: () => 'Comidas por foto con IA',
  },
  /** A function the app does not know yet, by the name the plan gives it. */
  unknownFeature: (name: string, limit: number | null) =>
    limit === null ? `${name} sin límite` : `${name}: máximo ${String(limit)}`,
  /** What the person still has when a plan leaves a function out. */
  without: {
    full_program_catalogue: 'Una selección de programas',
    period_analysis: 'Resumen de cada sesión',
    body_measurements: 'Peso y estatura',
    meal_photo_recognition: 'Comidas por búsqueda de alimentos',
  },
  period: {
    month: { fee: 'Cuota mensual', per: '/mes' },
    year: { fee: 'Cuota anual', per: '/año' },
  },
  /** The fee of a version whose period the catalogue does not say. */
  otherFee: 'Cuota',
  /** The sheet that offers Pro when a function was refused. */
  upgrade: {
    window: (months: number | null) =>
      months === 1 ? 'el último mes' : `los últimos ${String(months ?? 1)} meses`,
    training_history_months: {
      title: 'Todo tu historial, con Pro',
      body: (window: string) =>
        `Con Gratis ves ${window}. Lo anterior sigue guardado: con Pro lo vuelves a ver.`,
    },
    nutrition_history_months: {
      title: 'Todas tus comidas, con Pro',
      body: (window: string) =>
        `Con Gratis ves ${window} de comidas. Lo anterior sigue guardado: con Pro lo vuelves a ver.`,
    },
    active_personal_programs: {
      title: 'Varios programas a la vez',
      body: (count: number) =>
        `Con Gratis sigues ${String(count)} programa propio a la vez. Con Pro, los que quieras. Los de tu gimnasio nunca cuentan.`,
    },
    own_routines: {
      title: 'Rutinas sin límite',
      body: (count: number) =>
        `Con Gratis guardas hasta ${String(count)} rutinas propias. Con Pro, las que quieras: las que ya tienes se quedan.`,
    },
    routine_duplication: {
      title: 'Duplica tus rutinas',
      body: 'Con Pro copias una rutina tuya y la cambias sin tocar la original.',
    },
    full_program_catalogue: {
      title: 'Todo el catálogo de Allfit',
      body: 'Con Gratis tienes una selección para empezar. Con Pro, todos los programas según tu objetivo y tu nivel.',
    },
    period_analysis: {
      title: 'Compara tus periodos',
      body: 'Con Pro ves tus cargas, tu volumen y tu constancia semana a semana o mes a mes.',
    },
    body_measurements: {
      title: 'Todas tus medidas',
      body: 'Con Gratis registras tu peso y tu estatura. Con Pro, también cintura, brazo, grasa corporal y más.',
    },
    body_photos: {
      title: 'Fotos de tu progreso',
      body: 'Con Pro guardas fotos de tu cuerpo, solo para ti, y las comparas en el tiempo.',
    },
    meal_photo_recognition: {
      title: 'Registra con una foto',
      body: 'Con Pro tomas una foto de tu plato y la app reconoce lo que comes. Buscar alimentos sigue siendo gratis.',
    },
    other: {
      title: 'Esto es parte de Pro',
      body: 'Tu plan no incluye esta función. Con Pro la tienes, junto con todo lo demás.',
    },
    compare: 'Comparar Gratis y Pro',
    notNow: 'Ahora no',
  },
  /** The comparison, row by row. */
  rows: {
    sessions: 'Sesiones, cargas y sin conexión',
    full_program_catalogue: 'Programas de Allfit',
    training_history_months: 'Historial',
    period_analysis: 'Análisis',
    body_measurements: 'Evolución corporal',
    meal_photo_recognition: 'Nutrición',
    nutrition_history_months: 'Historial de comidas',
    active_personal_programs: 'Programas propios activos',
    own_routines: 'Rutinas propias',
    routine_duplication: 'Duplicar rutinas',
    organization: 'Programas de tu gimnasio',
    privacy: 'Privacidad y tus datos',
  },
  cells: {
    notIncluded: 'No incluido',
    complete: 'Completo',
    lastMonth: 'Último mes',
    lastMonths: (months: number) => `Últimos ${String(months)} meses`,
    upTo: (count: number) => `Hasta ${String(count)}`,
    unlimited: 'Sin límite',
    basicSelection: 'Selección básica',
    fullCatalogue: 'Catálogo completo',
    sessionSummary: 'Resumen de la sesión',
    loadsVolumeConsistency: 'Cargas, volumen y constancia',
    measuresAndPhotos: 'Medidas y fotos',
    measures: 'Medidas',
    weight: 'Peso',
    logAndGoals: 'Registro y metas',
    logGoalsAndPhotos: 'Registro, metas y fotos con IA',
  },
  /** «Tu plan» (`PRO-A`). */
  plan: {
    title: 'Tu plan',
    unavailable: 'No pudimos cargar tu plan. Revisa tu conexión e inténtalo de nuevo.',
    renewal: 'Renovación',
    expiry: 'Vencimiento',
    gym: 'Gimnasio',
    inApp: 'En la app',
    payNothing: 'No pagas nada',
    eachPlan: 'Qué incluye cada plan',
    sideBySide: 'Gratis y Pro, lado a lado',
    payments: 'Tus pagos',
    charges: (count: number) => `${String(count)} cobros`,
    chargesLast: (count: number, date: string) => `${String(count)} cobros · el último el ${date}`,
    manageIn: (store: string) => `Gestionar en ${store}`,
    changeOrCancel: 'Cambiar o cancelar la suscripción',
    whileAtGym: (gym: string) =>
      `Lo tienes mientras sigas en ${gym} y el gimnasio esté activo. Si eso cambia, pasas al plan gratis sin perder nada.`,
    includes: 'Lo que incluye',
    gymInvites: 'Si un gimnasio te invita, entras con Pro sin pagar.',
    cancel: 'Cancelar Pro',
    meetPro: 'Conoce Allfit Pro',
    inviteTitle: 'Todo Allfit, sin depender\nde un gimnasio',
    meet: 'Conoce Pro',
    card: { yourPlan: 'Tu plan', active: 'Activo', free: 'GRATIS' },
  },
  cancelSheet: {
    title: '¿Cancelar Allfit Pro?',
    until: (date: string) => `Sigues con Pro hasta el ${date}`,
    keepsHistory:
      'No se borra ningún dato. Pasas al plan gratis y sigues viendo todo tu historial.',
    keepsPermissions: 'Tus permisos y tus gimnasios no cambian.',
    keepsGym: 'Si un gimnasio activo te afilia, recuperas Pro sin pagar.',
    paidWith: (store: string) =>
      `Lo pagas con ${store}, así que se cancela en tu cuenta de ${store}.`,
    keep: 'Mantener Pro',
    cancelIn: (store: string) => `Cancelar en ${store}`,
  },
  /** «Tus pagos» (`PRO-B`). */
  payments: {
    title: 'Tus pagos',
    unavailable: 'No pudimos cargar tus pagos. Revisa tu conexión e inténtalo de nuevo.',
    none: 'Todavía no hay cobros de Allfit Pro.',
    lastCharge: 'Tu último cobro',
    since: (date: string) => `Pagas Pro desde el ${date}`,
    through: (store: string) => `Con ${store}`,
    charges: 'Cobros',
    paid: 'Pagado',
    failed: (store: string) => `${store} no pudo cobrar`,
    receipts: (store: string) =>
      `Tus recibos y tu tarjeta están en tu cuenta de ${store}. Allfit nunca ve tu tarjeta.`,
    theStore: 'la tienda',
  },
  /** The comparison and the purchase (`PRO-C`). */
  compare: {
    unavailable: 'No pudimos cargar los planes. Revisa tu conexión e inténtalo de nuevo.',
    notOnSale: 'Pro todavía no está a la venta en esta tienda.',
    per: { month: '/mes', year: '/año' } as Record<string, string>,
    renews: { month: 'cada mes', year: 'cada año' } as Record<string, string>,
    store: { app_store: 'la App Store', google_play: 'Google Play' } as Record<string, string>,
    theStore: 'la tienda',
    alreadyPro: 'Ya eres Pro · Gestionar',
    proWithGym: (gym: string) => `Ya tienes Pro con ${gym}`,
    becomePro: 'Hazte Pro',
    becomeProAt: (price: string) => `Hazte Pro · ${price}`,
    renewsAlone: 'Tu plan se renueva solo. Lo cancelas cuando quieras desde la tienda.',
    whileWithGym:
      'Mientras sigas con ellos no pagas nada más. Si terminas con el gimnasio, aquí podrás suscribirte.',
    renewsUntil: (every: string, store: string) =>
      `Se renueva ${every} hasta que lo canceles en ${store}.`,
    seal: 'Gratis y Pro',
    headline: 'Tu progreso, sin techo',
    headlineLines: ['TU PROGRESO,', 'SIN', 'TECHO.'],
    lede: 'Entrenar es gratis, siempre. Pro abre tu historial completo, el análisis de tu progreso y la nutrición con IA.',
    dataFreeTitle: 'Tus datos nunca se cobran',
    dataFreeBody:
      'Decidir qué compartes, verlo, descargarlo y borrarlo es gratis en los dos planes. Si bajas a Gratis no pierdes nada: solo dejas de verlo.',
    gymIncludes: '¿Tu gimnasio usa Allfit? Pro te sale incluido mientras sigas con ellos.',
    close: 'Cerrar',
    restore: 'Restaurar compras',
    terms: 'Términos',
    privacy: 'Privacidad',
  },
  purchase: {
    notTaken:
      'La tienda cobró, pero no pudimos confirmar tu compra. Vuelve a intentarlo con «Restaurar compras»; no se te cobrará otra vez.',
    storeFailed: 'La tienda no pudo completar la compra. Inténtalo de nuevo en un momento.',
    nothingToRestore: 'No encontramos compras de Allfit Pro en esta cuenta de la tienda.',
  },
  /** The carousel of what Pro opens, and the table side by side. */
  carousel: {
    title: 'Lo que abres con Pro',
    card: (at: number, total: number) => `Tarjeta ${String(at)} de ${String(total)}`,
    cards: [
      {
        label: 'Historial',
        title: 'TODO LO QUE\nHAS ENTRENADO.',
        pro: 'Cada sesión desde el primer día, a un toque.',
        free: 'Con Gratis ves el último mes. Lo anterior no se borra: sigue guardado y con Pro lo vuelves a ver.',
      },
      {
        label: 'Análisis',
        title: 'MIRA CUÁNTO\nHAS SUBIDO.',
        pro: 'Tus cargas, tu volumen y tu constancia, semana a semana o mes a mes.',
        free: 'Con Gratis tienes el resumen de cada sesión. Con Pro ves cómo suben tus cargas mes a mes.',
      },
      {
        label: 'Nutrición',
        title: 'UNA FOTO\nY LISTO.',
        pro: 'Tomas una foto de tu plato y la app reconoce lo que comes.',
        free: 'Con Gratis registras buscando tus alimentos y fijas tu meta.',
      },
      {
        label: 'Cuerpo',
        title: 'MÍRATE\nCAMBIAR.',
        pro: 'Medidas y fotos de tu progreso, solo para ti.',
        free: 'Con Gratis registras tu peso y tu estatura.',
      },
      {
        label: 'Programas',
        title: 'TODO EL\nCATÁLOGO.',
        pro: 'Todos los programas de Allfit, según tu objetivo y tu nivel.',
        free: 'Con Gratis tienes una selección para empezar.',
      },
      {
        label: 'Tus programas',
        title: 'CREA TODO\nLO QUE QUIERAS.',
        pro: 'Rutinas y programas propios sin límite, y duplicar rutinas.',
        free: 'Con Gratis, un programa propio a la vez y hasta tres rutinas.',
      },
    ],
    sessionsOf: 'de 86 sesiones a la vista',
    sessionsAll: 'sesiones, todas a la vista',
    lastMonth: 'Último mes',
    kept: 'Guardado · con Pro',
    comparePro: 'Comparar periodos es Pro',
    squatMonth: 'Sentadilla · en un mes',
    protein: (grams: number) => `${String(grams)} g proteína`,
    waist: 'Cintura',
    arm: 'Brazo',
    weight: 'Peso',
    activePrograms: 'Programas activos',
    ownRoutines: 'Rutinas propias',
    sideBySide: 'Lado a lado',
    rowLabel: (label: string, free: string, pro: string) =>
      `${label}. Gratis: ${free}. Pro: ${pro}.`,
  },
  /** «Planes de gimnasio»: what a gym sells, paid at its own gateway. */
  gym: {
    title: 'Planes de gimnasio',
    readFailed: 'No pudimos cargar tus planes. Inténtalo otra vez.',
    perMonth: 'al mes',
    perYear: 'al año',
    status: { active: 'Al día', suspended: 'En pausa', ended: 'Terminada' },
    paused: (gym: string) =>
      `${gym} pausó tu plan por un pago pendiente. Tus sesiones futuras con ellos quedan en pausa, pero no se borró nada: tu historial está completo y los permisos que diste siguen en pie. Cuando el pago se resuelva, todo vuelve sin que tengas que aceptar nada otra vez.`,
    cancellation: (gym: string) =>
      `Dejas de pagarle a ${gym}. Tu Fitness ID, tu historial y lo que registraste siguen siendo tuyos. Cancelar el pago no termina tu vínculo con el gimnasio ni le retira los permisos que le diste: si además quieres eso, se decide aparte.`,
    cancelThis: 'Cancelar este plan',
    noneTitle: 'No pagas ningún plan',
    noneBody:
      'Si tu gimnasio tiene planes, puedes verlos aquí abajo. Entrenar y pagar son cosas separadas: no hace falta un plan para seguir usando la app.',
    whereYouTrain: 'Dónde entrenas',
    seePlans: (gym: string) => `Ver los planes de ${gym}`,
    gatewayNote:
      'El cobro lo administra cada gimnasio en su propia pasarela. Allfit nunca guarda los datos de tu tarjeta.',
    cancelTitle: (gym: string) => `¿Cancelar tu plan con ${gym}?`,
    confirmCancel: 'Sí, cancelar el plan',
    leaveIt: 'Dejarlo como está',
    refusal: {
      notOffered:
        'Este plan ya no está disponible. Vuelve a cargar los planes del gimnasio para ver los que sí.',
      cannotCharge: (gym: string) =>
        `${gym} todavía no tiene cómo recibir el pago, o ya tienes un plan con ellos. Habla con el gimnasio: no es algo que puedas resolver desde aquí.`,
      alreadyPaying: (gym: string) => `Ya tienes un plan con ${gym}.`,
      unavailable:
        'No pudimos crear el plan. No se te cobró nada, así que puedes intentarlo otra vez.',
    },
    cancelRefusal: {
      notFound: 'Este plan ya no está. Vuelve a cargar tus planes para ver cómo están ahora.',
      unavailable:
        'No pudimos cancelar el plan. No se cambió nada, así que puedes intentarlo otra vez.',
    },
    offers: {
      readFailed: 'No pudimos cargar los planes. Inténtalo otra vez.',
      yourGym: 'tu gimnasio',
      subscribe: 'Suscribirme',
      noneTitle: 'Este gimnasio no tiene planes publicados',
      noneBody: 'Puedes seguir entrenando igual. Si esperabas un plan, pregúntale al gimnasio.',
      gatewayNote:
        'El pago se hace en la pasarela del gimnasio. Allfit nunca ve ni guarda los datos de tu tarjeta.',
      confirmTitle: (plan: string) => `¿Suscribirte al plan ${plan}?`,
      confirmBody: (price: string, period: string, gym: string) =>
        `Vas a pagarle ${price} ${period} a ${gym}. El precio queda fijo en el que ves ahora: si el gimnasio lo sube después, a ti no te cambia.`,
      notPermission:
        'Suscribirte no le da acceso a ninguno de tus datos. Lo que el gimnasio puede ver se decide solo cuando aceptas una relación, y eso no cambia aquí.',
      confirm: 'Sí, suscribirme',
      back: 'Volver',
    },
  },
}

/**
 * A gym's invitation: «Tu invitación» (INV-4) and when it is gone (INV-7), «Decide qué
 * pueden ver» (N-8a), the screen after onboarding (INV-3) and «Ya entrenas con…» (INV-5).
 */
export const invitation = {
  close: 'Cerrar',
  title: 'Tu invitación',
  openFailed: 'No pudimos abrir la invitación. Revisa tu conexión.',
  opening: 'Abriendo tu invitación…',
  invitedBy: (name: string) => `Te invita ${name}`,
  expires: (date: string) => `vence el ${date}`,
  decideEach: 'Decide cada cosa. No hay un «aceptar todo».',
  answer: { no: 'No', yes: 'Sí' },
  relationship: 'La relación',
  trainWith: (gym: string) => `Entrenar con ${gym}`,
  trainWithLabel: 'Entrenar con este gimnasio',
  proWhileWith: 'Incluye Allfit Pro mientras sigas con ellos',
  acceptSharesNothing: 'Aceptar no comparte ningún dato por sí solo.',
  whatTheySee: 'Lo que pueden ver',
  chooseShared: 'Elegir qué compartes',
  noRelationshipNoSharing: 'Sin relación no se comparte nada',
  asksNothing: 'No pide ningún dato',
  sharedOf: (shared: number, asked: number) => `Compartes ${String(shared)} de ${String(asked)}`,
  confirm: 'Confirmar mis decisiones',
  nothingUntilConfirm: 'Nada se comparte hasta que confirmes.',
  failure: {
    decision: 'No pudimos guardar tus decisiones. Revisa tu conexión e inténtalo de nuevo.',
    notOperating:
      'Este gimnasio no está recibiendo personas nuevas por ahora. Tu invitación sigue abierta: inténtalo más tarde.',
    noPlaces:
      'Este gimnasio no tiene lugares libres por ahora. Tu invitación sigue abierta: inténtalo más tarde.',
  },
  program: {
    heading: 'El programa que te proponen',
    off: 'Sin relación no hay programa',
    locked: 'Bloqueado',
    startLabel: (title: string) => `Empezar ${title}`,
    weeks: (weeks: number) => `${String(weeks)} ${weeks === 1 ? 'semana' : 'semanas'}`,
    repeats: 'Se repite cada semana',
    span: (length: string, day: string) => `${length} · empieza el ${day}`,
    shareFirst: (scope: string) => `Para que te lo pongan, primero comparte «${scope}».`,
    seeFrom: (day: string) => `Si confirmas, lo verás en Entrenar desde el ${day}.`,
    decide: 'Decide si quieres empezarlo.',
    needed: (title: string) => `Lo necesitan para ponerte «${title}».`,
    starts: (day: string) => `Empieza el ${day} · lo verás en Entrenar`,
    notGranted: 'No quedó puesto: no compartiste tu entrenamiento',
    withdrawn: 'Tu gimnasio retiró este programa antes de que respondieras',
  },
  /** For `calendarDay`, counted from Sunday; `month` is the short name from `common.months`. */
  weekdays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  calendarDay: (weekday: string, day: number, month: string) =>
    `${weekday} ${String(day)} ${month}`,
  unavailable: {
    title: 'Invitación',
    heading: 'Esta invitación ya no está disponible',
    body: 'Puede que haya vencido o que ya se haya usado. Pídele a tu gimnasio que te envíe una nueva.',
    enter: 'Entrar a Allfit',
  },
  share: {
    invites: 'te invita a entrenar con ellos',
    title: 'Decide qué pueden ver',
    intro: 'Aceptar la invitación no comparte nada por sí sola. Elige cada categoría.',
    shareLabel: (scope: string) => `Compartir ${scope}`,
    done: (shared: number, total: number) =>
      `Listo · compartes ${String(shared)} de ${String(total)}`,
    unchosen: 'Lo que no elijas no se comparte.',
  },
  done: {
    title: (gym: string) => `Ya entrenas con ${gym}`,
    coach: 'Tu gimnasio te asignará un coach.',
    pro: 'Allfit Pro activo',
    includedBy: (gym: string) => `Incluido por ${gym}`,
    shared: (shared: number, asked: number) =>
      `Compartes ${String(shared)} de ${String(asked)} categorías`,
    changeLater: 'Las cambias cuando quieras en Perfil',
    today: 'Ir a Hoy',
  },
  arrived: {
    title: (gym: string) => `${gym} te invitó`,
    email: 'La invitación llegó al correo con el que creaste tu cuenta.',
    team: (gym: string) => `Del equipo de ${gym}`,
    pro: 'Allfit Pro incluido',
    whileWith: (gym: string) => `Mientras sigas con ${gym}`,
    nothingYet: 'Todavía no aceptaste nada ni compartiste nada. Decides cada cosa por separado.',
    decide: 'Ver y decidir',
    notNow: 'Ahora no, entrar a Allfit',
    waits: (date: string) =>
      `Si entras sin decidir, la invitación te espera en Hoy hasta el ${date}.`,
  },
}

/** «Tus gimnasios» and one relationship's history, with the gym marks other screens reuse. */
export const gyms = {
  title: 'Tus gimnasios',
  loadFailed: 'No pudimos cargar tus gimnasios. Revisa tu conexión.',
  decideFailed: 'No pudimos guardar tu decisión. Inténtalo de nuevo.',
  wouldCover: (name: string) => `${name} te cubriría`,
  coverBody:
    'Mientras no decidas, no ve nada. Si aceptas, ve lo mismo que tu coach y solo en esas fechas.',
  reject: 'Rechazar',
  accept: 'Aceptar',
  none: 'Todavía no entrenas con ningún gimnasio.',
  active: 'Activos',
  ended: 'Terminados',
  activeBadge: 'Activo',
  coach: (name: string) => `Coach: ${name}`,
  noCoach: 'Todavía sin coach asignado',
  invitationNote:
    'Si un gimnasio te invita, la invitación te espera en Hoy. Aceptar no comparte nada por sí solo.',
  waiting: (gym: string) => `${gym} te espera al terminar`,
  invited: (gym: string) => `${gym} te invitó`,
  seeAndDecide: (expiry: string) => `Ver y decidir · ${expiry}`,
  relationship: {
    loadFailed: 'No pudimos cargar esta relación. Revisa tu conexión.',
    endFailed: 'No pudimos terminar la relación. Inténtalo de nuevo.',
    activeSince: (date: string) => `Activa desde el ${date}`,
    endedOn: (date: string) => `Terminó el ${date}`,
    yourCoach: (name: string) => `Tu coach: ${name}`,
    seesNothingNew: 'Ya no ven nada nuevo',
    whatHappened: 'Lo que ha pasado',
    note: 'Este registro no se edita ni se borra. Si el gimnasio declara un motivo al terminar, no lo ves, igual que ellos no ven el tuyo.',
    end: 'Terminar la relación',
    endWith: (name: string) => `¿Terminar con ${name}?`,
    endBody:
      'Desde hoy no reciben nada nuevo de ti. Lo que ya compartiste hasta hoy queda congelado, y tu historial sigue siendo tuyo.',
    stay: 'Seguir con ellos',
  },
}

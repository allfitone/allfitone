/** «Lo que compartes» (N-8b) and taking one category back (N-8c). */
export const sharing = {
  title: 'Lo que compartes',
  loadFailed: 'No pudimos cargar lo que compartes. Revisa tu conexión.',
  revokeFailed: 'No pudimos dejar de compartirlo. Inténtalo de nuevo.',
  none: 'No compartes nada con ningún gimnasio. Cuando uno te invite, decides aquí qué ve.',
  endedNote:
    'Aunque terminaste, aún pueden ver lo que les compartiste hasta esa fecha. Quítalo si no quieres que lo sigan viendo.',
  stop: 'Dejar de compartir',
  keep: 'Seguir compartiendo',
  nutrition: (gym: string) => `Alimentación · ${gym}`,
  remove: 'Quitar',
  removeLabel: (category: string) => `Dejar de compartir ${category}`,
  notShared: 'No compartes',
  line: {
    active: (level: string, date: string) => `${level} · desde el ${date}`,
    frozen: (date: string) => `Aún pueden ver lo compartido hasta el ${date}`,
    revoked: (date: string) => `Dejaste de compartirlo el ${date}`,
    declined: 'Elegiste no compartirlo',
  },
  caption: {
    ended: (date: string) => `Terminó el ${date} · ya no ven nada nuevo`,
    active: (date: string, shared: number, total: number) =>
      `Activa desde el ${date} · ${String(shared)} de ${String(total)} categorías`,
  },
  revoke: {
    title: (what: string, gym: string) => `¿Dejar de compartir ${what} con ${gym}?`,
    kept: (what: string) => `Dejan de conservar ${what}, también lo que ya les compartiste.`,
    seen: (what: string) => `Dejan de ver ${what} ahora mismo.`,
    apart: 'Lo demás que compartes no cambia: cada permiso es aparte.',
    nothingDeleted: 'No se borra nada tuyo. Sigue en tu Fitness ID.',
    final: 'No se puede deshacer: para volver a compartir hará falta un permiso nuevo.',
  },
}

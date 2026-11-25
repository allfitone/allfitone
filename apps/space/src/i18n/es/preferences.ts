/**
 * How things reach her: the channel for each kind of notice (`PF-13`, HU-SP-078) and
 * her units and language (`PF-14`, HU-SP-094). ADR-054.
 *
 * Each language is named in itself — «Español», «English» — in both dictionaries, so
 * somebody who chose the wrong one by mistake can still find her own.
 */
export const preferences = {
  channels: {
    title: 'Avisos',
    intro:
      'Elige por dónde te avisamos cada cosa. En la app los ves siempre, en Avisos; apagar un canal no detiene nada.',
    columns: { push: 'Push', email: 'Correo' },
    categories: {
      relationship: 'Tus gimnasios',
      assignment: 'Programas asignados',
      consent: 'Permisos',
      correction: 'Correcciones',
      nutrition: 'Nutrición',
      security: 'Seguridad',
    },
    alwaysOn: 'Siempre activo',
    note: 'El correo se activa cuando lo verifiques y el push cuando le des permiso al teléfono. Ningún gimnasio ve ni cambia estas preferencias.',
    enablePush: {
      title: 'Activar push en este teléfono',
      caption: 'Te pedimos permiso una sola vez.',
    },
    unreadable: 'No pudimos leer tus avisos. Revisa tu conexión e inténtalo otra vez.',
  },
  title: 'Preferencias',
  units: {
    label: 'Unidades',
    mass: 'Peso',
    kilograms: 'Kilos',
    pounds: 'Libras',
    distance: 'Distancia',
    kilometres: 'Kilómetros',
    miles: 'Millas',
    note: 'Cambiar unidades no cambia lo que registraste: se convierte al mostrarlo y el original se guarda.',
  },
  language: {
    label: 'Idioma',
    title: 'Idioma',
    names: { es: 'Español', en: 'English' },
    followsPhone: 'Como el teléfono',
    note: 'También es el idioma de tus correos y avisos.',
  },
  health: {
    label: 'Apps de salud · pronto',
    appleHealth: 'Publicar en Apple Health',
    caption: 'Tus entrenos salen hacia Apple Health. Nada entra.',
  },
  elsewhere: {
    label: 'También está en perfil',
    contact: 'Correo y teléfono',
    sharing: 'Lo que compartes',
    deleteData: 'Eliminar mis datos',
  },
  unreadable: 'No pudimos leer tus preferencias. Revisa tu conexión e inténtalo otra vez.',
  failures: {
    offline: 'No pudimos guardarlo. Revisa tu conexión; dejamos lo que tenías.',
    expired: 'Tu sesión venció. Vuelve a entrar para continuar.',
    refused: 'No se pudo guardar ese cambio; dejamos lo que tenías.',
    stale: 'Cambió desde otro sitio. Vuelve a abrir esta pantalla.',
  },
}

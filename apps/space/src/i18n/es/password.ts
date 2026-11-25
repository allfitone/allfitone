/** Changing the password (`PF-E18`): its rules, its refusals, and the screen that does it. */
export const password = {
  title: 'Contraseña',
  subtitle: 'Para cambiarla necesitamos la actual. Así nadie más puede hacerlo desde tu teléfono.',
  submit: 'Cambiar contraseña',
  current: 'Contraseña actual',
  next: 'Contraseña nueva',
  note: 'Al cambiarla cerramos tus sesiones en otros teléfonos. En este sigues dentro, y te avisamos por correo.',
  show: 'Mostrar',
  hide: 'Ocultar',
  /** «Mostrar contraseña actual»: the eye button, read with its field. */
  toggleLabel: (shown: boolean, field: string) =>
    `${shown ? 'Ocultar' : 'Mostrar'} ${field.toLowerCase()}`,
  changed: 'TU CONTRASEÑA CAMBIÓ',
  changedBody:
    'La próxima vez que entres, usa la nueva. Cerramos tus sesiones en otros teléfonos y te avisamos por correo.',
  done: 'Listo',
  rules: {
    length: 'Al menos 8 caracteres',
    cases: 'Una mayúscula y una minúscula',
    digit: 'Un número',
    different: 'Distinta de la actual',
  },
  failure: {
    generic: 'No pudimos cambiar tu contraseña. Inténtalo otra vez.',
    wrongPassword: 'La contraseña actual no es correcta.',
    weakPassword:
      'Esa contraseña es demasiado fácil de adivinar. Cámbiale algunas letras o alárgala.',
    rateLimited: 'Hiciste muchos intentos. Espera un rato y vuelve a intentarlo.',
    unavailable: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.',
  },
}

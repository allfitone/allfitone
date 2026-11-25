/**
 * The onboarding's own words: each step's title and lede, its failures, and the closing
 * screen. The pickers inside the steps speak through `fitness`.
 */
export const onboarding = {
  continue: 'Continuar',
  signIn: 'Iniciar sesión',
  backStep: 'Volver al paso anterior',
  expired: 'Tu sesión venció. Vuelve a entrar para guardar tu respuesta.',
  readFailed: 'No pudimos leer tus respuestas. Inténtalo otra vez.',
  saveFailed: 'No pudimos guardar tu respuesta. Inténtalo otra vez.',
  age: {
    title: 'Antes de\nempezar',
    lede: 'Allfit Space es solo para personas mayores de edad. No te pedimos tu fecha de nacimiento.',
    declaration: 'Declaro que tengo 18 años o más.',
    refused: 'No podemos continuar sin la declaración de mayoría de edad.',
    expired: 'Tu sesión venció. Inicia sesión otra vez.',
    saveFailed: 'No pudimos guardar tu declaración. Inténtalo otra vez.',
  },
  identity: {
    title: 'Cómo te\nllamas',
    lede: 'Tu nombre viaja con lo que decidas compartir. El usuario es tu identificador en Allfit.',
    given: 'Nombre',
    family: 'Apellido',
    signsInWith: 'Entras con',
    fixedHere: 'No se puede cambiar aquí.',
    username: 'Usuario',
    usernameRule:
      'De 3 a 30 caracteres, empezando con una letra. Solo letras, números y guion bajo.',
    seenAs: (username: string) => `Así te verán: @${username}`,
    taken: 'Ese usuario ya está en uso. Prueba con otro.',
    expired: 'Tu sesión venció. Vuelve a entrar para guardar tus datos.',
    saveFailed: 'No pudimos guardar tus datos. Inténtalo otra vez.',
  },
  goal: {
    title: '¿Qué quieres\nlograr?',
    lede: 'Elige uno. Es la dirección que toma tu entrenamiento, y puedes cambiarlo cuando quieras.',
  },
  focus: {
    title: '¿En qué te\nquieres centrar?',
    lede: 'Señala lo que más te importa. Es un énfasis: el resto del cuerpo sigue entrando.',
  },
  experience: { title: '¿Cuánto has\nentrenado?' },
  sex: {
    title: 'Tu sexo\nbiológico',
    lede: 'Calibra tu gasto energético y tus rangos de referencia. Es lo único para lo que lo usamos.',
    declineNote: 'Puedes añadirlo cuando quieras desde tu perfil. Nada más cambia.',
  },
  measures: {
    title: '¿Cuánto pesas\ny cuánto mides?',
    weight: 'Peso',
    weightHead: 'PESO',
    height: 'Estatura',
    heightHead: 'ESTATURA',
    unit: 'Unidad',
    /** Said out loud. `FT` is two letters a screen reader spells rather than reads. */
    spoken: { kg: 'Kilos', lb: 'Libras', cm: 'Centímetros', in: 'Pies' },
    note: 'Es tu primer registro de progreso. Podrás actualizarlo cuando quieras.',
    saveFailed: 'No pudimos guardar tus medidas. Inténtalo otra vez.',
  },
  continues: {
    ready: 'PERFIL LISTO',
    readyAs: (username: string) => `PERFIL LISTO · @${username}`,
    title: 'Aquí empieza\ntu historial',
    firstWeek: 'TU PRIMERA SEMANA',
    firstWeekLabel: 'Tu primera semana empieza hoy. Todavía no hay sesiones programadas.',
    today: 'HOY',
    /** Sunday first, as `Date.getDay()`; martes and miércoles are both `M` on purpose. */
    weekLetters: 'DLMMJVS',
    start: 'Empezar hoy',
    expired: 'Tu sesión venció. Vuelve a entrar para terminar.',
    activateFailed: 'No pudimos activar tu Fitness ID. Inténtalo otra vez.',
    activated: 'Tu Fitness ID está activo. Tu primer día de historial empieza hoy.',
  },
}

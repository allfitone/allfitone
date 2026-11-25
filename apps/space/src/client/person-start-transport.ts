/**
 * What the app does once a session holds — after sign-in, after verifying a new account,
 * and on every start that finds a session the API accepts. ADR-054.
 *
 * Her units and language go into the stores, so the app speaks as she chose; and this
 * phone's push token is refreshed if she already allowed push, as `OP-IDN-072` asks.
 * Neither is awaited by the caller: a slow answer must not hold the opening, and a failed
 * one leaves the phone's language and kilos, which is what she sees before choosing.
 */

import { loadPreferences } from './preferences-transport'
import { spacePush } from './push-transport'

export function startPersonSession(): void {
  void loadPreferences()
  void spacePush.refresh().catch(() => undefined)
}

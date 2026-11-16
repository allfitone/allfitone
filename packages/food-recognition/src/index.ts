export {
  DETAIL_BOUNDS,
  DETAIL_CODES,
  FOOD_GROUPS,
  RecognitionError,
  type DetailCode,
  type Estimate,
  type FoodGroup,
  type FoodRecognizer,
  type RecognisedItem,
  type Recognition,
  type RecognitionFailure,
} from './port.js'
export { createFoodRecognizer, type RecognizerSettings } from './recognizer.js'
export { createMemoryRecognizer, type MemoryRecognizer } from './adapters/memory.js'
export { createFoodRecognitionFromEnv, DEFAULT_MODEL, type FoodRecognition } from './factory.js'

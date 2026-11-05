/**
 * Reads `aws ecs describe-task-definition` output into the shape the renderer needs,
 * checking it instead of trusting it: a malformed definition must stop the deploy
 * here, not reach `register-task-definition` half-rewritten.
 */

import type {
  ContainerDefinition,
  DescribedTaskDefinition,
  KeyValue,
} from './render-task-definition.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isKeyValue = (value: unknown): value is KeyValue =>
  isRecord(value) && typeof value.name === 'string' && typeof value.value === 'string'

const isContainer = (value: unknown): value is ContainerDefinition =>
  isRecord(value) &&
  typeof value.image === 'string' &&
  (value.environment === undefined ||
    (Array.isArray(value.environment) && value.environment.every(isKeyValue)))

const isDescribed = (value: unknown): value is DescribedTaskDefinition =>
  isRecord(value) &&
  typeof value.family === 'string' &&
  Array.isArray(value.containerDefinitions) &&
  value.containerDefinitions.every(isContainer)

export function parseDescribed(json: string): DescribedTaskDefinition {
  const output: unknown = JSON.parse(json)
  const definition = isRecord(output) ? output.taskDefinition : undefined
  if (!isDescribed(definition))
    throw new Error('Input is not a describe-task-definition task definition')
  return definition
}

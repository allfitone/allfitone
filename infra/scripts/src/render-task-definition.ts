/**
 * Turns the task definition ECS is running into the next revision for a new image.
 *
 * Terraform owns everything in a task definition except which image it runs: the
 * pipeline decides that. So a deploy copies the latest revision of the family —
 * which already carries whatever Terraform last changed — and swaps only the tag.
 *
 * `describe-task-definition` returns read-only fields that `register-task-definition`
 * rejects, so the copy keeps an allowlist rather than deleting the ones known today:
 * a field AWS adds tomorrow is dropped instead of breaking every deploy.
 */

export interface KeyValue {
  readonly name: string
  readonly value: string
}

export interface ContainerDefinition {
  readonly image: string
  readonly environment?: readonly KeyValue[]
  readonly [key: string]: unknown
}

export interface DescribedTaskDefinition {
  readonly family: string
  readonly containerDefinitions: readonly ContainerDefinition[]
  readonly [key: string]: unknown
}

export interface RenderedTaskDefinition {
  readonly family: string
  readonly containerDefinitions: readonly ContainerDefinition[]
  readonly [key: string]: unknown
}

const REGISTRABLE = [
  'taskRoleArn',
  'executionRoleArn',
  'networkMode',
  'volumes',
  'placementConstraints',
  'requiresCompatibilities',
  'cpu',
  'memory',
  'pidMode',
  'ipcMode',
  'proxyConfiguration',
  'inferenceAccelerators',
  'ephemeralStorage',
  'runtimePlatform',
  'enableFaultInjection',
] as const

const COMMIT_SHA = /^[0-9a-f]{40}$/

function withTag(image: string, tag: string): string {
  const colon = image.lastIndexOf(':')
  // A colon before the last slash belongs to a registry port, not to a tag.
  const repository = colon > image.lastIndexOf('/') ? image.slice(0, colon) : image
  return `${repository}:${tag}`
}

function withRelease(environment: readonly KeyValue[], tag: string): KeyValue[] {
  return environment.map((entry) =>
    entry.name === 'RELEASE' ? { name: 'RELEASE', value: tag } : entry,
  )
}

export function renderTaskDefinition(
  described: DescribedTaskDefinition,
  tag: string,
): RenderedTaskDefinition {
  if (!COMMIT_SHA.test(tag)) throw new Error(`Image tag must be a full commit SHA, got "${tag}"`)
  if (described.containerDefinitions.length === 0) {
    throw new Error(`Task definition ${described.family} has no containers`)
  }

  const kept: Record<string, unknown> = {}
  for (const key of REGISTRABLE) {
    if (described[key] !== undefined) kept[key] = described[key]
  }

  return {
    ...kept,
    family: described.family,
    containerDefinitions: described.containerDefinitions.map((container) => ({
      ...container,
      image: withTag(container.image, tag),
      ...(container.environment ? { environment: withRelease(container.environment, tag) } : {}),
    })),
  }
}

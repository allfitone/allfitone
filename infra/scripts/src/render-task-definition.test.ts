import { describe, expect, test } from 'bun:test'

import { renderTaskDefinition } from './render-task-definition.js'

const REPOSITORY = '788208946198.dkr.ecr.us-east-1.amazonaws.com/allfitone/api'
const NEW_TAG = 'e2b45e6464f803aa36c885604e4e714bfc7f0426'

// The shape `aws ecs describe-task-definition` returns, read-only fields included.
const described = () => ({
  taskDefinitionArn:
    'arn:aws:ecs:us-east-1:788208946198:task-definition/allfitone-production-api:3',
  family: 'allfitone-production-api',
  revision: 3,
  status: 'ACTIVE',
  registeredAt: '2026-11-05T10:00:00.000Z',
  registeredBy: 'arn:aws:sts::788208946198:assumed-role/x/y',
  requiresAttributes: [{ name: 'com.amazonaws.ecs.capability.ecr-auth' }],
  compatibilities: ['EC2'],
  executionRoleArn: 'arn:aws:iam::788208946198:role/allfitone-production-execution',
  taskRoleArn: 'arn:aws:iam::788208946198:role/allfitone-production-api',
  networkMode: 'bridge',
  requiresCompatibilities: ['EC2'],
  containerDefinitions: [
    {
      name: 'api',
      image: `${REPOSITORY}:992c0792b64f3f2d767434778109773740e950e7`,
      environment: [
        { name: 'PORT', value: '8080' },
        { name: 'RELEASE', value: '992c0792b64f3f2d767434778109773740e950e7' },
      ],
      secrets: [
        {
          name: 'DATABASE_URL',
          valueFrom: 'arn:aws:secretsmanager:us-east-1:788208946198:secret:x:DATABASE_URL::',
        },
      ],
    },
  ],
})

describe('renderTaskDefinition', () => {
  test('points the container at the new tag of the same repository', () => {
    const rendered = renderTaskDefinition(described(), NEW_TAG)
    expect(rendered.containerDefinitions[0]?.image).toBe(`${REPOSITORY}:${NEW_TAG}`)
  })

  test('moves RELEASE to the new tag and keeps the rest of the environment and secrets', () => {
    const rendered = renderTaskDefinition(described(), NEW_TAG)
    const container = rendered.containerDefinitions[0]
    expect(container?.environment).toEqual([
      { name: 'PORT', value: '8080' },
      { name: 'RELEASE', value: NEW_TAG },
    ])
    expect(container?.secrets).toEqual(described().containerDefinitions[0]?.secrets)
  })

  test('does not add RELEASE to a container that never had it', () => {
    const input = described()
    const container = input.containerDefinitions[0]
    if (!container) throw new Error('fixture has a container')
    container.environment = [{ name: 'PORT', value: '8080' }]
    const rendered = renderTaskDefinition(input, NEW_TAG)
    expect(rendered.containerDefinitions[0]?.environment).toEqual([{ name: 'PORT', value: '8080' }])
  })

  test('keeps only what register-task-definition accepts', () => {
    const rendered = renderTaskDefinition(described(), NEW_TAG)
    expect(Object.keys(rendered).sort()).toEqual([
      'containerDefinitions',
      'executionRoleArn',
      'family',
      'networkMode',
      'requiresCompatibilities',
      'taskRoleArn',
    ])
  })

  test('leaves the described definition untouched', () => {
    const input = described()
    renderTaskDefinition(input, NEW_TAG)
    expect(input).toEqual(described())
  })

  test('refuses a tag that is not a commit SHA', () => {
    expect(() => renderTaskDefinition(described(), 'latest')).toThrow('commit SHA')
    expect(() => renderTaskDefinition(described(), '')).toThrow('commit SHA')
  })

  test('refuses a definition without containers', () => {
    const input = { ...described(), containerDefinitions: [] }
    expect(() => renderTaskDefinition(input, NEW_TAG)).toThrow('no containers')
  })
})

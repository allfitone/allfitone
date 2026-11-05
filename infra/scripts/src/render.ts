/**
 * Pipeline entry point:
 *   aws ecs describe-task-definition --task-definition <family> \
 *     | bun infra/scripts/src/render.ts <commit-sha> > next.json
 *   aws ecs register-task-definition --cli-input-json file://next.json
 */

import { parseDescribed } from './parse-described.js'
import { renderTaskDefinition } from './render-task-definition.js'

const tag = process.argv[2] ?? ''
const described = parseDescribed(await Bun.stdin.text())
process.stdout.write(JSON.stringify(renderTaskDefinition(described, tag)))

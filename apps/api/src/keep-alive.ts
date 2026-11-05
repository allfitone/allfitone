/**
 * How long the API keeps an idle connection open behind the load balancer.
 *
 * The load balancer reuses connections to the containers and drops one after
 * 60 s of silence. Node's default is to drop it after 5 s. When the container
 * closes first, a request the load balancer sends down that connection at the
 * same moment fails with a 502 that no log on our side explains. Outlasting the
 * load balancer leaves the closing to it.
 *
 * headersTimeout must exceed keepAliveTimeout, or Node can cut a reused
 * connection while it is still waiting for the next request's headers.
 */

import type { ServerOptions } from 'node:http'

export const LOAD_BALANCER_IDLE_TIMEOUT_MS = 60_000

export const keepAliveOptions: ServerOptions = {
  keepAliveTimeout: LOAD_BALANCER_IDLE_TIMEOUT_MS + 5_000,
  headersTimeout: LOAD_BALANCER_IDLE_TIMEOUT_MS + 6_000,
}

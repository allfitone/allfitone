/**
 * What the container does on SIGTERM, which ECS sends before replacing a task.
 *
 * Registering a SIGTERM listener stops Node from exiting on its own, so the
 * listener has to finish the job: stop accepting connections, let requests in
 * flight complete, flush telemetry, and exit. Without the exit the open
 * database pool keeps the process alive until the orchestrator kills it, which
 * cuts whatever was still being answered.
 */

export interface ClosableServer {
  close(callback: (error?: Error) => void): unknown
}

export async function shutdownGracefully(options: {
  server: ClosableServer
  flush: () => Promise<void>
  exit: (code: number) => void
}): Promise<void> {
  await new Promise<void>((resolve) => options.server.close(() => resolve()))
  try {
    await options.flush()
  } catch {
    // Losing the last telemetry batch must not keep a stopped task alive.
  }
  options.exit(0)
}

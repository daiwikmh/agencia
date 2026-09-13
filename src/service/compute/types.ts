export interface SandboxSpec {
  cpu: number;
  memMb: number;
  ttlSeconds: number;
  image: string;
}

export interface SandboxHandle {
  provider: string;
  ref: string;
  endpoint?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ComputeProvider {
  id: string;
  label: string;
  region?: string;
  available(): Promise<boolean>;
  costPerSecondHbar(spec: SandboxSpec): number;
  start(spec: SandboxSpec, leaseId: string): Promise<SandboxHandle>;
  exec(handle: SandboxHandle, command: string, timeoutMs: number): Promise<ExecResult>;
  extend(handle: SandboxHandle, seconds: number): Promise<void>;
  stop(handle: SandboxHandle): Promise<void>;
}

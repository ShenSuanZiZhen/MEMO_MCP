export interface ClockPort {
  now(): Date;
}

export interface IdPort {
  newId(scope: string): string;
}

export interface DomainPorts {
  readonly clock: ClockPort;
  readonly ids: IdPort;
}

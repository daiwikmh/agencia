import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../../config.js";

export interface Identity {
  accountId: string;
  email: string | null;
  label: string | null;
  firstSeen: string;
  lastSeen: string;
  leases: number;
  hbarSpent: number;
}

let identities: Identity[] = load();

function load(): Identity[] {
  try {
    return JSON.parse(readFileSync(config.compute.identityStore, "utf8")) as Identity[];
  } catch {
    return [];
  }
}

function persist() {
  try {
    mkdirSync(dirname(config.compute.identityStore), { recursive: true });
    writeFileSync(config.compute.identityStore, JSON.stringify(identities, null, 2));
  } catch {
    return;
  }
}

export function touchIdentity(accountId: string): Identity {
  const now = new Date().toISOString();
  let identity = identities.find((i) => i.accountId === accountId);
  if (!identity) {
    identity = {
      accountId,
      email: null,
      label: null,
      firstSeen: now,
      lastSeen: now,
      leases: 0,
      hbarSpent: 0,
    };
    identities.push(identity);
  }
  identity.lastSeen = now;
  persist();
  return identity;
}

export function getIdentity(accountId: string): Identity | undefined {
  return identities.find((i) => i.accountId === accountId);
}

export function setContact(accountId: string, email?: string, label?: string): Identity {
  const identity = touchIdentity(accountId);
  if (email !== undefined) {
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("invalid email");
    identity.email = email || null;
  }
  if (label !== undefined) identity.label = label || null;
  persist();
  return identity;
}

export function recordSpend(accountId: string, hbar: number, leaseOpened = false): void {
  const identity = touchIdentity(accountId);
  identity.hbarSpent = Number((identity.hbarSpent + hbar).toFixed(8));
  if (leaseOpened) identity.leases += 1;
  persist();
}

export function listIdentities(): Identity[] {
  return identities;
}

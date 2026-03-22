'use client';

const API_KEY_LS = 'aeg-control-api-key';
const SESSION_LS = 'aeg-control-session-id';

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(API_KEY_LS) ?? '';
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(API_KEY_LS, key);
}

export function getStoredSessionId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SESSION_LS) ?? 'control-demo-session';
}

export function setStoredSessionId(id: string): void {
  localStorage.setItem(SESSION_LS, id);
}

export function controlHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = getStoredApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function controlFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { ...controlHeaders(), ...(init?.headers as Record<string, string>) },
  });
}

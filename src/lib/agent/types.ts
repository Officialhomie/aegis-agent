/**
 * Types for multi-mode agent: AgentMode and AgentModeContext.
 */

import type { AgentConfig } from './index';
import type { Observation } from './observe';
import type { Decision } from './reason/schemas';

export interface AgentMode {
  id: string;
  name: string;
  config: AgentConfig;
  observe: () => Promise<Observation[]>;
  reason: (observations: unknown[], memories: unknown[]) => Promise<Decision>;
  onStart?: () => Promise<void>;
}

export interface AgentModeContext {
  mode: AgentMode;
  config: AgentConfig;
}

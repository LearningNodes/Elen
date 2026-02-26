export interface AgentIdentity {
  agent_id: string;
  name: string;
  provider: string;
  domains: string[];
  trust_score: number;
  decisions_validated: number;
  created_at: string;
}

export interface CompetencyProfile {
  agent_id: string;
  domains: string[];
  strengths: string[];
  weaknesses: string[];
  updated_at: string;
}

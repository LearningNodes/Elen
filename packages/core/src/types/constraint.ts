export type ConstraintType = 'requirement' | 'assumption' | 'boundary';

export interface Constraint {
  constraint_id: string;
  decision_id: string;
  type: ConstraintType;
  description: string;
  source?: string;
  locked: boolean;
}

import { ZodError, type ZodIssue } from 'zod';

/**
 * Convert input-validation failures into a readable invalid_input message:
 * "<field>: <reason>" in plain words, never raw zod JSON.
 */
export function invalidInputMessageFromZod(err: ZodError): string {
  const issue: ZodIssue | undefined = err.issues[0];
  if (!issue) return 'input: is invalid';
  const field = issue.path.length > 0 ? issue.path.join('.') : 'input';
  return `${field}: ${plainReason(issue)}`;
}

function plainReason(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': {
      const t = issue as { expected?: string; received?: string };
      if (t.received === 'undefined') return 'is required';
      return `must be a ${t.expected || 'valid value'}`;
    }
    case 'too_small': {
      const t = issue as { minimum?: number | bigint; type?: string; inclusive?: boolean };
      const min = t.minimum != null ? String(t.minimum) : '';
      if (t.type === 'string') return min === '1' ? 'must not be empty' : `must be at least ${min} characters`;
      if (t.type === 'array') return min === '1' ? 'must not be empty' : `must contain at least ${min} items`;
      if (t.type === 'number') return `must be at least ${min}`;
      return 'is too small';
    }
    case 'too_big': {
      const t = issue as { maximum?: number | bigint; type?: string };
      const max = t.maximum != null ? String(t.maximum) : '';
      if (t.type === 'string') return `must be at most ${max} characters`;
      if (t.type === 'array') return `must contain at most ${max} items`;
      if (t.type === 'number') return `must be at most ${max}`;
      return 'is too large';
    }
    case 'invalid_value':
      return 'has an unsupported value';
    case 'invalid_format':
      return 'has an invalid format';
    default:
      // Zod's own message is plain prose for other codes; strip any JSON-looking payload.
      return issue.message && !issue.message.startsWith('[') && !issue.message.startsWith('{')
        ? issue.message
        : 'is invalid';
  }
}

/** Returns { error, message } for a tool failure, mapping validation errors to invalid_input. */
export function toolErrorBody(err: unknown): { error: string; message: string } {
  if (err instanceof ZodError) {
    return { error: 'invalid_input', message: invalidInputMessageFromZod(err) };
  }
  const message = err instanceof Error ? err.message : String(err);
  // Manual validators in legacy/competency tools throw plain-word validation errors.
  const missing = message.match(/^missing required field:\s*(\S+)$/);
  if (missing) {
    return { error: 'invalid_input', message: `${missing[1]}: is required` };
  }
  if (message.startsWith('Invalid input:')) {
    const rest = message.slice('Invalid input:'.length).trim();
    // e.g. "agentId must be a string" -> "agentId: must be a string"
    const m = rest.match(/^(\S+)\s+(must be .+)$/);
    if (m) return { error: 'invalid_input', message: `${m[1]}: ${m[2]}` };
    return { error: 'invalid_input', message: rest };
  }
  if (/^(limit|minConfidence) must be a number$/.test(message)) {
    const field = message.split(' ')[0];
    return { error: 'invalid_input', message: `${field}: must be a number` };
  }
  if (message === 'invalid search input') {
    return { error: 'invalid_input', message: 'input: must be an object' };
  }
  // Errors already shaped by lower layers (e.g. cloud v2Fetch) keep their code.
  const coded = err as { error?: string } | null;
  if (coded && typeof coded.error === 'string' && coded.error) {
    return { error: coded.error, message };
  }
  return { error: 'tool_error', message };
}

/** MCP CallTool error result: isError with JSON {"error":..., "message":...} text. */
export function toolErrorResult(err: unknown): {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
} {
  const body = toolErrorBody(err);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body) }]
  };
}

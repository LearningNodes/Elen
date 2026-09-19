export { elenCommitTool, handleCommit, commitInputSchema } from './commit';
export { elenSuggestTool, handleSuggest, suggestInputSchema } from './suggest';
export { elenExpandTool, handleExpand, expandInputSchema } from './expand';
export { elenSupersedeTool, handleSupersede, supersedeInputSchema } from './supersede';
export { elenGetCompetencyTool, handleGetCompetency, validateCompetencyInput } from './competency';
export { elenGetContextTool, handleGetContext, contextInputSchema } from './context';
export {
  elenLogDecisionTool,
  elenSearchPrecedentsTool,
  handleLogDecision,
  handleSearchPrecedents,
  validateLogDecisionInput,
  validateSearchInput
} from './legacy';
export { elenStatusTool, handleStatus } from './status';
export { elenConsolidateTool, handleConsolidate, consolidateInputSchema } from './consolidate';
export { elenTeamSearchTool, handleTeamSearch, teamSearchInputSchema } from './team-search';
export { elenIncomingTool, handleIncoming, incomingInputSchema } from './incoming';

export const ELEN_TOOLS = [
  'elen_commit',
  'elen_suggest',
  'elen_expand',
  'elen_supersede',
  'elen_get_competency',
  'elen_get_context',
  'elen_status',
  'elen_consolidate',
  'elen_log_decision',
  'elen_search_precedents',
  'elen_team_search',
  'elen_incoming'
] as const;

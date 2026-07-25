export const AGENT_CONFIG = {
  planner: { label: 'Planner', icon: '◆', desc: 'Breaks the goal into a task plan and selects agents.', group: 'core' },
  verifier: { label: 'Verifier', icon: '✓', desc: 'Fact-checks and validates the final result.', group: 'core' },
  research: { label: 'Research', icon: '◈', desc: 'Gathers and cross-checks information on the topic.', group: 'specialist' },
  coding: { label: 'Coding', icon: '◇', desc: 'Writes, explains, or debugs code.', group: 'specialist' },
  data: { label: 'Data Analyst', icon: '▤', desc: 'Analyzes data, finds patterns and statistics.', group: 'specialist' },
  document: { label: 'Document', icon: '▥', desc: 'Reads and extracts from documents or files.', group: 'specialist' },
  websearch: { label: 'Web Search', icon: '◎', desc: 'Pulls in current, up-to-date information.', group: 'specialist' },
  content: { label: 'Content', icon: '✎', desc: 'Drafts and structures the written output.', group: 'specialist' },
  security: { label: 'Security', icon: '⛨', desc: 'Detects prompt injection and protects sensitive data.', group: 'specialist' }
};

export const LEVEL_LABEL = { fast: 'FAST', medium: 'MEDIUM', normal: 'NORMAL' };
export const LEVEL_ORDER = ['fast', 'medium', 'normal'];

export const SELECTABLE_AGENTS = ['research', 'coding', 'data', 'document', 'websearch', 'content'];

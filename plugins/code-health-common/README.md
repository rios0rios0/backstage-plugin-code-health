# @rios0rios0/backstage-plugin-code-health-common

Types and pure helpers shared by the Code Health frontend and backend plugins.

This package holds the HTTP wire contract between them, plus the handful of pure
functions both sides need to derive presentation state from it. It has no runtime
dependencies and no side effects.

`ClaudeMetrics` and its helpers describe informational token consumption separately
from scoring. The optional `claudeMetrics` summary field and `claude` capability
allow older backends to remain readable without inventing measured zero usage.

See the [repository README](https://github.com/rios0rios0/backstage-plugin-code-health#readme).

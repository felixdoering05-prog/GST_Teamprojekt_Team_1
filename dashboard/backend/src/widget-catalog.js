// Stable IDs for account layouts; the web app can add content without changing stored instances.
const widgetCatalog = Object.freeze([
  'issues', 'issue-status', 'priority', 'activity', 'buildings', 'model', 'map',
  'climate', 'metadata', 'metrics', 'trend', 'warnings', 'rooms', 'system', 'links', 'tasks',
]);
module.exports = { widgetCatalog };

const defaultDatabasePaths = {
  development: 'data/weather-ai.development.sqlite',
  test: 'data/weather-ai.test.sqlite',
  production: 'data/weather-ai.production.sqlite',
} as const;

type NodeEnv = keyof typeof defaultDatabasePaths;

export function getDefaultDatabasePath(nodeEnv?: string): string {
  if (nodeEnv && nodeEnv in defaultDatabasePaths) {
    return defaultDatabasePaths[nodeEnv as NodeEnv];
  }

  return defaultDatabasePaths.development;
}

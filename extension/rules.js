export const rulePrefix = 'volume-rule:';

export function createRule(url, scope, names) {
  const params = scope === 'query'
    ? [...names].sort().map(name => [name, url.searchParams.get(name)])
    : [];
  return { scope, host: url.hostname, path: scope === 'host' ? '' : url.pathname, params };
}

export function matchesRule(rule, url) {
  return !!url && rule.host === url.hostname &&
    (rule.scope === 'host' || rule.path === url.pathname) &&
    rule.params.every(([name, value]) => {
      const values = url.searchParams.getAll(name);
      return values.length === 1 && values[0] === value;
    });
}

export function ruleKey({ scope, host, path, params }) {
  return rulePrefix + JSON.stringify([scope, host, path, params]);
}

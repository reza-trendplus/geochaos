import { mapLimited, type IP2LocationClient } from './geo.js';
import type { Classification, Dependency, GeoRecord, JourneyResult, NormalizedConfig, Scenario } from './types.js';

export function classify(values: (string | null)[], missingObservation = false): Classification {
  const known = [...new Set(values.filter((v): v is string => !!v))].sort();
  if (!known.length) return {state:'unknown', values:[]};
  if (known.length > 1) return {state:'mixed', values:known};
  return {state:missingObservation || values.some(v => !v) ? 'partial' : 'known', values:known};
}
export async function buildDependencies(
  baseline: JourneyResult[], config: NormalizedConfig, client: IP2LocationClient | null
): Promise<Dependency[]> {
  const all = new Map<string, Dependency>();
  for (const run of baseline) for (const o of run.origins) {
    let d = all.get(o.origin);
    if (!d) {
      d = {...o, ips:[], requests:0, responses:0, failedRequests:0, blockedRequests:0,
        httpErrors:[], resourceTypes:[], addressMisses:0, journeys:[], geo:[],
        excluded:config.firstPartyOrigins.includes(o.origin) ? 'first-party' :
          config.excludeOrigins.includes(o.origin) ? 'user-excluded' : null,
        country:{state:'unknown',values:[]}, asn:{state:'unknown',values:[]}};
      all.set(o.origin, d);
    }
    d.ips = [...new Set([...d.ips,...o.ips])].sort();
    d.journeys = [...new Set([...d.journeys,run.journey])];
    d.resourceTypes = [...new Set([...d.resourceTypes,...o.resourceTypes])].sort();
    d.httpErrors = [...new Set([...d.httpErrors,...o.httpErrors])].sort();
    d.requests += o.requests; d.responses += o.responses;
    d.failedRequests += o.failedRequests; d.addressMisses += o.addressMisses;
  }
  return mapLimited([...all.values()].sort((a,b) => a.origin.localeCompare(b.origin)), 4, async d => {
    if (d.excluded) {
      d.country = d.asn = {state:'excluded',values:[]};
      return d;
    }
    const fixture = config.geo.mode === 'synthetic' ? config.geo.fixtures[d.origin] : undefined;
    if (fixture) {
      d.geo = [{ip:d.ips.join(', ') || 'unobserved', ...fixture, source:'synthetic', status:'ok'}];
    } else if (config.geo.mode === 'synthetic') {
      d.geo = [{ip:d.ips.join(', ') || 'unobserved',source:'none',status:'unknown',
        countryCode:null,countryName:null,asn:null,asName:null,reason:'No synthetic label for this origin.'}];
    } else if (client) {
      d.geo = await mapLimited(d.ips, 2, ip => client.lookup(ip));
    }
    const missing = !fixture && (d.addressMisses > 0 || d.failedRequests > 0 || !d.ips.length ||
      d.requests > d.responses + d.failedRequests);
    d.country = classify(d.geo.map((g:GeoRecord) => g.countryCode), missing);
    d.asn = classify(d.geo.map((g:GeoRecord) => g.asn), missing);
    return d;
  });
}
export interface ScenarioPlan {scenarios:Scenario[]; warnings:string[]; completeCoverage:boolean;}
export function buildScenarios(dependencies: Dependency[], config: NormalizedConfig): ScenarioPlan {
  const candidates: Scenario[] = [], warnings: string[] = [];
  let completeCoverage = true;
  const external = dependencies.filter(d => !d.excluded);
  for (const groupBy of config.groupBy) {
    const groups = new Map<string,string[]>();
    const filters = groupBy === 'country' ? config.countries : config.asns;
    for (const d of external) {
      const classification = d[groupBy];
      if (classification.state !== 'known') {
        completeCoverage = false;
        warnings.push(`${d.origin}: ${groupBy} classification is ${classification.state}; excluded from automatic ${groupBy} scenarios.`);
        continue;
      }
      const value = classification.values[0]!;
      if (filters.length && !filters.includes(value)) continue;
      groups.set(value, [...(groups.get(value) ?? []), d.origin]);
    }
    for (const value of filters) if (!groups.has(value)) {
      completeCoverage = false;
      warnings.push(`No fully classified baseline dependencies matched ${groupBy} ${value}.`);
    }
    for (const [value,origins] of [...groups.entries()].sort(([a],[b]) => a.localeCompare(b))) {
      candidates.push({id:`${groupBy}-${value}`,groupBy,value,
        name:groupBy === 'country' ? `Reported country ${value} unavailable` : `Network AS${value} unavailable`,
        origins:origins.sort()});
    }
  }
  if (candidates.length > config.maxScenarios) {
    completeCoverage = false;
    warnings.push(`Scenario limit: testing ${config.maxScenarios} of ${candidates.length} selected groups. Increase maxScenarios or narrow the filters.`);
  }
  if (!candidates.length) {
    completeCoverage = false;
    warnings.push('No eligible failure scenarios. This is not evidence that the application is resilient.');
  }
  return {scenarios:candidates.slice(0,config.maxScenarios),warnings,completeCoverage};
}

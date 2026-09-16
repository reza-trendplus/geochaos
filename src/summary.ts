import type { Dependency, JourneyResult, MatrixCell, ReportSummary, Scenario } from './types.js';

export function buildMatrix(journeys: string[], scenarios: Scenario[], results: JourneyResult[],
  dependencies: Dependency[]): MatrixCell[] {
  return scenarios.flatMap(scenario => journeys.map(journey => {
    const runs = results.filter(r => r.journey === journey && r.scenarioId === scenario.id);
    const relevant = dependencies.some(d => scenario.origins.includes(d.origin) && d.journeys.includes(journey));
    if (!relevant) return {journey, scenarioId:scenario.id, status:'not-applicable' as const,
      blockedRequests:0,runIds:[],reason:'This journey did not request any targeted origin in its baselines.'};
    const states = new Set(runs.map(r => r.status));
    const status = !runs.length || states.size !== 1 || states.has('inconclusive')
      ? 'inconclusive' : runs[0]!.status;
    return {journey,scenarioId:scenario.id,status,blockedRequests:runs.reduce((n,r) => n+r.blockedRequests,0),
      runIds:runs.map(r => r.id),
      ...(status === 'inconclusive' ? {reason:!runs.length ? 'Scenario was not executed.' :
        states.size > 1 ? 'Repeated attempts disagreed; treat the result as inconclusive.' :
        runs.find(r => r.reason)?.reason ?? 'Insufficient evidence.'} : {})};
  }));
}
export function summarize(baseline:JourneyResult[], matrix:MatrixCell[], dependencies:Dependency[],
  completeCoverage:boolean, expectedBaselineRuns:number, expectedScenarioRuns = 1):ReportSummary {
  const baselinePassed = baseline.length === expectedBaselineRuns && baseline.every(r => r.status === 'passed');
  const regressions = baselinePassed ? matrix.filter(c => c.status === 'failed').length : 0;
  const passedCells = matrix.filter(c => c.status === 'passed').length;
  const inconclusiveCells = matrix.filter(c => c.status === 'inconclusive').length;
  const notApplicableCells = matrix.filter(c => c.status === 'not-applicable').length;
  const completeAttempts = matrix.every(c => c.status === 'not-applicable' || c.runIds.length === expectedScenarioRuns);
  const eligible = dependencies.filter(d => !d.excluded);
  const fullyTested = baselinePassed && completeCoverage && completeAttempts && matrix.length > 0 && inconclusiveCells === 0;
  const outcome = regressions ? 'regressions' : fullyTested ? 'passed' : 'inconclusive';
  return {outcome,exitCode:outcome === 'regressions' ? 1 : outcome === 'passed' ? 0 : 2,
    baselinePassed,regressions,passedCells,inconclusiveCells,notApplicableCells,
    dependencyCount:eligible.length,classifiedCount:eligible.filter(d => d.country.state === 'known' || d.asn.state === 'known').length,
    completeCoverage:completeCoverage && completeAttempts && baselinePassed && inconclusiveCells === 0};
}

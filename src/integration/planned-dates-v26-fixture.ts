// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-137 release 2 — a project exactly as v0.80.0 (schema 26) wrote it to local storage: made on
 * `5acc753` through that build's own store, its own Status rule (the grid's `statusUpdatesFor`,
 * with the page's schedule) and its own local save, by Review 33's verification seat. Kept byte
 * for byte (md5 3ba6f0027217a2682c06a434b7607e74), so the tests that load it meet what a real
 * v0.80.0 tab left behind.
 *
 * Rows: Alpha Complete 10-05..10-23 (dated by the rule, then a typed finish); Bravo In Progress since
 * 10-19 (dated by the rule — an early start, Alpha not finished); Lima In Progress and Kilo Complete
 * from before v0.80.0 (a count only); Charlie, Delta, Echo and Foxtrot Planned. Links a→b, b→c, d→e,
 * e→f, a→l, finish-to-start. Each row Uniform 9–11; Start Date Monday 2026-10-05; dependencies on.
 * None carries a Planned date: v0.80.0 had none to write.
 */
export const PLANNED_DATES_V26_FIXTURE = `{"id":"b2b30e09-5bd0-4bb7-9c8b-80541eca0c87","name":"R33 Legacy","createdAt":"2026-10-19T12:00:00.000Z","schemaVersion":26,"owner":null,"scenarios":[{"id":"2f376569-b35f-4ecd-b277-f84d5b2aed91","name":"Baseline","startDate":"2026-10-05","activities":[{"id":"a","name":"Alpha","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"complete","actualStartDate":"2026-10-05","actualFinishDate":"2026-10-23","actualDuration":15},{"id":"b","name":"Bravo","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"inProgress","actualStartDate":"2026-10-19","actualDuration":1},{"id":"l","name":"Lima","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"inProgress","actualDuration":3},{"id":"k","name":"Kilo","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"complete","actualDuration":8},{"id":"c","name":"Charlie","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"planned"},{"id":"d","name":"Delta","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"planned"},{"id":"e","name":"Echo","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"planned"},{"id":"f","name":"Foxtrot","min":9,"mostLikely":10,"max":11,"confidenceLevel":"mediumConfidence","distributionType":"uniform","status":"planned"}],"dependencies":[{"fromActivityId":"a","toActivityId":"b","type":"FS","lagDays":0},{"fromActivityId":"b","toActivityId":"c","type":"FS","lagDays":0},{"fromActivityId":"d","toActivityId":"e","type":"FS","lagDays":0},{"fromActivityId":"e","toActivityId":"f","type":"FS","lagDays":0},{"fromActivityId":"a","toActivityId":"l","type":"FS","lagDays":0}],"milestones":[],"settings":{"defaultConfidenceLevel":"mediumConfidence","defaultDistributionType":"triangular","trialCount":50000,"rngSeed":"c525e01b-deac-4fec-805b-49321de0e693","probabilityTarget":0.5,"projectProbabilityTarget":0.95,"heuristicEnabled":false,"heuristicMinPercent":75,"heuristicMaxPercent":200,"dependencyMode":true,"parkinsonsLawEnabled":true},"bands":[]}]}`;

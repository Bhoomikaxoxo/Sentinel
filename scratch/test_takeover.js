const heuristicEngine = require('../server/services/heuristicEngine');

const testFactors = [
  { id: 'recently_reissued_cert' }
];

const result = heuristicEngine.calculateScore(testFactors);
console.log('--- Heuristics Takeover Test ---');
console.log('Score:', result.score);
console.log('Reasons:', result.reasons);
if (result.score === 90 && result.reasons.includes('Recently reissued certificate on a pre-existing domain — possible takeover or repurposing.')) {
  console.log('SUCCESS: Takeover rule deduction and description are correct!');
} else {
  console.error('FAIL: Heuristics output did not match expectations.');
}

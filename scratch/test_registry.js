const reputationService = require('../server/services/reputationService');
const registryService = require('../server/services/registryService');

async function test() {
  console.log("Starting debug test...");
  try {
    const res = await registryService.buildRegistryRecord("www.netflix.com");
    console.log("Success!", JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Error!", e);
  }
}

test();

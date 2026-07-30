const scanService = require('../server/services/scanService');

async function run() {
  console.log("Starting scan integration test...");
  try {
    const result = await scanService.scanUrl("netflix.com");
    console.log("Scan Success!");
    console.log("IP:", result.registryRecord?.ip?.ip);
    console.log("Open Ports:", JSON.stringify(result.openPorts));
    console.log("Resolved Subdomains:", JSON.stringify(result.resolvedSubdomains));
    console.log("SSL Info:", JSON.stringify(result.sslInfo));
  } catch (e) {
    console.error("Scan Failed!", e);
  }
}

run();

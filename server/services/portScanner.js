const net = require('net');

const PORT_SERVICES = {
  80: 'HTTP',
  443: 'HTTPS',
  22: 'SSH',
  21: 'FTP',
  8080: 'HTTP-ALT'
};

async function scanPorts(hostname) {
  const ports = [80, 443, 22, 21, 8080];
  
  const checkPort = (port) => {
    return new Promise((resolve) => {
      const service = PORT_SERVICES[port] || 'UNKNOWN';
      const socket = new net.Socket();
      
      socket.setTimeout(1200);
      
      socket.on('connect', () => {
        resolve({ port, open: true, service });
        socket.destroy();
      });
      
      socket.on('error', () => {
        resolve({ port, open: false, service });
        socket.destroy();
      });
      
      socket.on('timeout', () => {
        resolve({ port, open: false, service });
        socket.destroy();
      });
      
      socket.connect({ host: hostname, port });
    });
  };

  try {
    const promises = ports.map(port => checkPort(port));
    const results = await Promise.allSettled(promises);
    return results.map((res, i) => {
      if (res.status === 'fulfilled') {
        return res.value;
      }
      const port = ports[i];
      return { port, open: false, service: PORT_SERVICES[port] || 'UNKNOWN' };
    });
  } catch (err) {
    console.error('[portScanner] Unexpected failure during port scan:', err);
    return ports.map(port => ({
      port,
      open: false,
      service: PORT_SERVICES[port] || 'UNKNOWN'
    }));
  }
}

exports.scanPorts = scanPorts;

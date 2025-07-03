#!/usr/bin/env node

/**
 * Simple test script for the Sentry Sensei MCP Server
 * This demonstrates how to interact with the MCP server programmatically
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test function to send MCP requests
function testMCPServer() {
  console.log('🧪 Testing Sentry Sensei MCP Server...\n');

  // Start the MCP server process
  const serverPath = join(__dirname, '..', 'src', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Test: List tools request
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  };

  console.log('📝 Sending list tools request...');
  console.log(JSON.stringify(listToolsRequest, null, 2));

  server.stdin.write(`${JSON.stringify(listToolsRequest)}\n`);

  // Handle server response
  server.stdout.on('data', data => {
    const response = data.toString().trim();
    if (response) {
      try {
        const parsed = JSON.parse(response);
        console.log('\n✅ Server response:');
        console.log(JSON.stringify(parsed, null, 2));

        if (parsed.result && parsed.result.tools) {
          console.log(`\n🔧 Found ${parsed.result.tools.length} available tools:`);
          parsed.result.tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
          });
        }
      } catch (e) {
        console.log('📄 Raw response:', response);
      }
    }
  });

  server.stderr.on('data', data => {
    console.log('🔍 Server info:', data.toString());
  });

  // Clean up after a few seconds
  setTimeout(() => {
    console.log('\n🛑 Stopping test server...');
    server.kill();
    console.log('✅ Test complete!');
  }, 3000);
}

// Run the test
testMCPServer();

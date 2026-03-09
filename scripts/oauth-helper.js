#!/usr/bin/env node
/**
 * OAuth Helper for headless MCP server authentication
 * 
 * Usage:
 *   node oauth-helper.js init <mcp-url>     - Register client and generate auth URL
 *   node oauth-helper.js exchange <callback-url> - Exchange callback URL for tokens
 *   node oauth-helper.js refresh             - Refresh expired tokens
 *   node oauth-helper.js test                - Test current tokens
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '.oauth-state.json');
const TOKENS_FILE = path.join(process.env.HOME, '.mcporter', 'autosend', 'tokens.json');

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function init(mcpUrl) {
  console.log('🔐 Initializing OAuth for:', mcpUrl);
  
  // Fetch OAuth discovery
  const discoveryUrl = new URL('/.well-known/oauth-authorization-server', mcpUrl);
  const discovery = await httpRequest({
    hostname: discoveryUrl.hostname,
    path: discoveryUrl.pathname,
    method: 'GET'
  });
  
  if (discovery.status !== 200) {
    console.error('Failed to fetch OAuth discovery:', discovery.data);
    process.exit(1);
  }
  
  const { authorization_endpoint, token_endpoint, registration_endpoint } = discovery.data;
  console.log('✓ Found OAuth endpoints');
  
  // Register dynamic client
  const registerData = JSON.stringify({
    client_name: "OpenClaw MCP Skill",
    redirect_uris: ["http://127.0.0.1:8765/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post"
  });
  
  const regUrl = new URL(registration_endpoint);
  const clientRes = await httpRequest({
    hostname: regUrl.hostname,
    path: regUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(registerData)
    }
  }, registerData);
  
  if (clientRes.status !== 200 && clientRes.status !== 201) {
    console.error('Failed to register client:', clientRes.data);
    process.exit(1);
  }
  
  const { client_id, client_secret } = clientRes.data;
  console.log('✓ Client registered:', client_id);
  
  // Generate PKCE
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  
  // Save state
  const oauthState = {
    verifier,
    state,
    client_id,
    client_secret,
    token_endpoint,
    mcp_url: mcpUrl
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(oauthState, null, 2), { mode: 0o600 });
  
  // Build auth URL
  const authUrl = new URL(authorization_endpoint);
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', 'http://127.0.0.1:8765/callback');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'mcp:full');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  
  console.log('\n' + '='.repeat(60));
  console.log('AUTHORIZATION URL:');
  console.log('='.repeat(60));
  console.log(authUrl.toString());
  console.log('='.repeat(60));
  console.log('\n1. Open this URL in your browser');
  console.log('2. Log in and authorize the application');
  console.log('3. Copy the callback URL and run:');
  console.log('   node oauth-helper.js exchange "<callback-url>"');
}

async function exchange(callbackUrl) {
  if (!fs.existsSync(STATE_FILE)) {
    console.error('No OAuth state found. Run "init" first.');
    process.exit(1);
  }
  
  const oauthState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (state !== oauthState.state) {
    console.error('State mismatch! Possible CSRF attack.');
    process.exit(1);
  }
  
  console.log('🔄 Exchanging code for tokens...');
  
  const postData = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'http://127.0.0.1:8765/callback',
    client_id: oauthState.client_id,
    client_secret: oauthState.client_secret,
    code_verifier: oauthState.verifier
  }).toString();
  
  const tokenUrl = new URL(oauthState.token_endpoint);
  const tokenRes = await httpRequest({
    hostname: tokenUrl.hostname,
    path: tokenUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);
  
  if (tokenRes.status !== 200 || !tokenRes.data.access_token) {
    console.error('Failed to exchange code:', tokenRes.data);
    process.exit(1);
  }
  
  const tokens = {
    ...tokenRes.data,
    client_id: oauthState.client_id,
    client_secret: oauthState.client_secret,
    token_endpoint: oauthState.token_endpoint,
    mcp_url: oauthState.mcp_url,
    obtained_at: Date.now()
  };
  
  // Save tokens
  const tokensDir = path.dirname(TOKENS_FILE);
  fs.mkdirSync(tokensDir, { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });

  console.log('✅ Tokens saved to:', TOKENS_FILE);
  console.log('   - access_token: ***masked***');
  console.log('   - expires_in:', tokens.expires_in, 'seconds');
  console.log('   - refresh_token:', tokens.refresh_token ? 'present' : 'none');
  
  // Cleanup state file
  fs.unlinkSync(STATE_FILE);
}

async function refresh() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error('No tokens found. Run OAuth flow first.');
    process.exit(1);
  }
  
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  
  if (!tokens.refresh_token) {
    console.error('No refresh token available.');
    process.exit(1);
  }
  
  console.log('🔄 Refreshing tokens...');
  
  const postData = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: tokens.client_id,
    client_secret: tokens.client_secret
  }).toString();
  
  const tokenUrl = new URL(tokens.token_endpoint || 'https://mcp.autosend.com/oauth/token');
  const tokenRes = await httpRequest({
    hostname: tokenUrl.hostname,
    path: tokenUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);
  
  if (tokenRes.status !== 200 || !tokenRes.data.access_token) {
    console.error('Failed to refresh:', tokenRes.data);
    process.exit(1);
  }
  
  const newTokens = {
    ...tokens,
    ...tokenRes.data,
    obtained_at: Date.now()
  };
  
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(newTokens, null, 2), { mode: 0o600 });
  console.log('✅ Tokens refreshed!');
}

async function test() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error('No tokens found. Run OAuth flow first.');
    process.exit(1);
  }
  
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  console.log('🧪 Testing MCP connection...');
  
  const postData = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  });
  
  const res = await httpRequest({
    hostname: 'mcp.autosend.com',
    path: '/',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);
  
  if (res.status === 200 && res.data.result?.tools) {
    console.log('✅ Connection successful!');
    console.log('   Tools available:', res.data.result.tools.length);
    console.log('   Tools:', res.data.result.tools.map(t => t.name).join(', '));
  } else {
    console.error('❌ Connection failed:', res.data);
  }
}

// CLI
const [,, command, arg] = process.argv;

switch (command) {
  case 'init':
    init(arg || 'https://mcp.autosend.com/').catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  case 'exchange':
    if (!arg) {
      console.error('Usage: node oauth-helper.js exchange "<callback-url>"');
      process.exit(1);
    }
    exchange(arg).catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  case 'refresh':
    refresh().catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  case 'test':
    test().catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  default:
    console.log(`
OAuth Helper for headless MCP authentication

Usage:
  node oauth-helper.js init [mcp-url]      - Start OAuth flow
  node oauth-helper.js exchange <url>      - Exchange callback URL for tokens
  node oauth-helper.js refresh             - Refresh expired tokens
  node oauth-helper.js test                - Test current tokens

Default MCP URL: https://mcp.autosend.com/
    `);
}

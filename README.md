# AutoSend MCP Skill

An [OpenClaw](https://github.com/openclaw/openclaw) skill for connecting to [AutoSend](https://autosend.com) email platform via MCP.

## What is this?

This skill enables AI agents (Claude, OpenClaw, etc.) to manage email campaigns, templates, and contacts through AutoSend's MCP server using [mcporter](https://github.com/steipete/mcporter).

## Quick Start

```bash
# Install mcporter
npm install -g mcporter

# Add AutoSend server
mcporter config add autosend https://mcp.autosend.com/ --auth oauth

# Authenticate
mcporter auth autosend

# Test
mcporter call autosend.list_templates
```

## Headless Server Setup

For servers without a browser, use the OAuth helper:

```bash
node scripts/oauth-helper.js init      # Get auth URL
# → Open URL in browser, authorize, copy callback URL
node scripts/oauth-helper.js exchange "http://127.0.0.1:8765/callback?code=XXX"
node scripts/oauth-helper.js test      # Verify
```

## Available Tools

21 tools for managing:
- Email templates
- Campaigns
- Contact lists & segments
- Senders
- Suppression groups
- Analytics

See [SKILL.md](./SKILL.md) for full documentation.

## License

MIT

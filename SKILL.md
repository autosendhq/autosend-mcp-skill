---
name: autosend-mcp
description: Connect to AutoSend email MCP server from OpenClaw using mcporter. Use for managing email campaigns, templates, contacts, and senders via AI.
version: 0.1.0
metadata:
  openclaw:
    requires:
      bins:
        - mcporter
        - node
    install:
      - kind: node
        package: mcporter
        bins: [mcporter]
    emoji: "📧"
    homepage: https://docs.autosend.com/ai/mcp-server
---

# AutoSend MCP Skill

Connect OpenClaw to [AutoSend](https://autosend.com) email platform via MCP using [mcporter](https://github.com/steipete/mcporter).

**MCP URL:** `https://mcp.autosend.com/`
**Transport:** Streamable HTTP + OAuth 2.0
**Docs:** https://docs.autosend.com/ai/mcp-server

## Available Tools (21)

| Category | Tools |
|----------|-------|
| Lists & Segments | `get_lists_and_segments` |
| Templates | `list_templates`, `search_templates`, `get_template`, `create_template`, `update_template`, `delete_template` |
| Senders | `list_senders`, `get_sender` |
| Suppression Groups | `list_suppression_groups`, `get_suppression_group` |
| Campaigns | `list_campaigns`, `get_campaign`, `create_campaign`, `update_campaign`, `delete_campaign`, `duplicate_campaign`, `send_campaign` |
| Analytics | `get_campaign_analytics`, `get_email_activity_analytics` |
| Testing | `send_test_email` |

### Guided Workflows
- `create-campaign` — Step-by-step campaign creation
- `create-template` — Step-by-step template creation

## Prerequisites

- Node.js 18+
- AutoSend account (https://autosend.com)

## Setup

### 1. Install mcporter

```bash
npm install -g mcporter
```

### 2. Add AutoSend server

```bash
mcporter config add autosend https://mcp.autosend.com/ --auth oauth
```

Or manually create `config/mcporter.json`:
```json
{
  "mcpServers": {
    "autosend": {
      "baseUrl": "https://mcp.autosend.com/",
      "auth": "oauth",
      "description": "AutoSend email MCP"
    }
  }
}
```

### 3. Authenticate

#### Option A: Desktop (has browser)
```bash
mcporter auth autosend
# Browser opens → Log in → Authorize → Done
```

#### Option B: Headless Server (human-in-the-loop)

Use the included helper script:

```bash
# 1. Generate auth URL
node scripts/oauth-helper.js init

# 2. Open URL in browser, authorize, copy callback URL

# 3. Exchange for tokens
node scripts/oauth-helper.js exchange "http://127.0.0.1:8765/callback?code=XXX&state=YYY"

# 4. Verify connection
node scripts/oauth-helper.js test
```

**How it works:**
1. Agent generates OAuth URL and sends to human
2. Human opens URL, logs in, authorizes
3. Human copies callback URL (page won't load — that's OK)
4. Agent exchanges code for tokens

### 4. Test Connection

```bash
mcporter call autosend.list_templates
```

## Usage

```bash
# List templates
mcporter call autosend.list_templates

# Create template
mcporter call autosend.create_template \
  templateName="Welcome Email" \
  subject="Welcome!" \
  emailTemplate="<html>..."

# List campaigns
mcporter call autosend.list_campaigns

# Get analytics
mcporter call autosend.get_email_activity_analytics
```

## Token Management

Tokens are stored in `~/.mcporter/autosend/tokens.json`

```bash
# Refresh expired tokens
node scripts/oauth-helper.js refresh

# Test current tokens
node scripts/oauth-helper.js test
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Token expired | Run `node scripts/oauth-helper.js refresh` |
| Invalid credentials | Re-run full OAuth flow |
| Connection timeout | Check network and token validity |

## References

- [AutoSend MCP Docs](https://docs.autosend.com/ai/mcp-server)
- [mcporter GitHub](https://github.com/steipete/mcporter)
- [mcporter on ClawHub](https://clawhub.ai/steipete/mcporter)
- [MCP Specification](https://modelcontextprotocol.io/)

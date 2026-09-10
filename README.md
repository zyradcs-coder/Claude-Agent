# WhatsApp AI Agent

A full-stack WhatsApp AI agent built with Next.js. It receives messages through the
Meta WhatsApp Business API, generates AI replies via OpenRouter, stores everything in
Supabase, and ships a real-time dashboard for viewing and managing every conversation.

Each conversation can run in one of two modes:

- **AI (agent) mode** – incoming messages are answered automatically by the model.
- **Human mode** – incoming messages are stored only; a human replies from the dashboard.

You can also send manual messages from the dashboard in either mode.

## Architecture

```
User sends WhatsApp message
  -> Meta forwards it to POST /api/webhook
  -> Message stored in Supabase (conversation found/created by phone number)
  -> If conversation mode = agent:
       last 20 messages -> AI model (OpenRouter)
       -> AI reply sent back via Meta Graph API
       -> reply stored in Supabase
  -> If conversation mode = human: stored only, no auto-reply
  -> Dashboard updates in real-time via Supabase Realtime
```

Only text messages are processed; other message types and status callbacks are ignored.
Duplicate deliveries from Meta are de-duplicated on `messages.whatsapp_msg_id`.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript, React 19)
- **Database:** Supabase (PostgreSQL + Realtime)
- **AI:** OpenRouter API through the OpenAI SDK (OpenAI-compatible)
- **Styling:** Tailwind CSS v4

## Project Structure

```
src/
  app/
    page.tsx                       Dashboard UI (client component)
    layout.tsx                     Root layout
    api/
      webhook/route.ts             GET verify + POST receive WhatsApp messages
      conversations/route.ts       GET list conversations with last message
      conversations/[id]/route.ts          PATCH conversation mode
      conversations/[id]/messages/route.ts GET messages for a conversation
      conversations/[id]/send/route.ts     POST manual message from dashboard
  lib/
    ai.ts                          OpenRouter client + getAIResponse()
    system-prompt.ts               The AI assistant's system prompt
    whatsapp.ts                    sendWhatsAppMessage() via Meta Graph API
    supabase.ts                    Server-side Supabase client (service role)
    types.ts                       Shared TypeScript types
supabase-schema.sql               Database schema (run in Supabase SQL Editor)
.mcp.json.example                 Template for the optional Supabase MCP server config
```

### Optional: Supabase MCP

`.mcp.json` configures the [Supabase MCP server](https://supabase.com/docs) so an agent
can apply migrations and inspect the database directly. It's optional and gitignored.
To use it, copy the template and fill in your project ref and a Supabase personal
access token:

```bash
cp .mcp.json.example .mcp.json
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Permanent token from Meta Business > System Users |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta App > WhatsApp > API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Any string you choose; must match the value set in the Meta webhook config |
| `OPENROUTER_API_KEY` | API key from [openrouter.ai](https://openrouter.ai/keys) |
| `AI_MODEL` | Model ID (e.g. `anthropic/claude-sonnet-4-20250514`). Defaults to `anthropic/claude-sonnet-4-20250514` if unset |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (used by the browser for Realtime) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (used by API routes) |
| `PORT` | Optional dev server port (default `3000`) |
| `NEXT_PUBLIC_APP_URL` | Optional public app URL |

> **Security:** `.env.local` and `.mcp.json` are gitignored and only hold placeholders in
> version control. Never commit real credentials. Earlier revisions of this repo contained
> live keys — if you cloned from such a revision, rotate the Meta access token, OpenRouter
> key, Supabase anon + service-role keys, and Supabase MCP token.

### 3. Set up the database

Run [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor. It creates
the `conversations` and `messages` tables, their indexes, and enables Realtime:

```sql
create table conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  created_at timestamp with time zone default now()
);

create index idx_messages_conversation on messages(conversation_id);
create index idx_conversations_updated on conversations(updated_at desc);

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
```

### 4. Run the dev server

```bash
npm run dev
```

The app starts on http://localhost:3000. You should see the dashboard with an empty
conversation list.

### 5. Expose your local server

Meta needs a public HTTPS URL for webhooks. Use ngrok (or deploy to Vercel):

```bash
ngrok http 3000
```

### 6. Configure the Meta webhook

1. Go to [Meta App Dashboard](https://developers.facebook.com) > your app > WhatsApp > Configuration
2. Set the callback URL to `https://your-url.com/api/webhook`
3. Set the verify token to match your `WHATSAPP_VERIFY_TOKEN`
4. Subscribe to the **messages** field

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/webhook` | Meta webhook verification (returns `hub.challenge`) |
| POST | `/api/webhook` | Receive incoming WhatsApp messages |
| GET | `/api/conversations` | List all conversations with last message |
| PATCH | `/api/conversations/[id]` | Update conversation mode (`agent` / `human`) |
| GET | `/api/conversations/[id]/messages` | Get messages for a conversation |
| POST | `/api/conversations/[id]/send` | Send a manual message from the dashboard |

## Dashboard Features

- **Sidebar:** all conversations sorted by latest activity, with mode badges (AI / You)
- **Chat panel:** WhatsApp-style bubbles with timestamps
- **Mode toggle:** switch a conversation between AI and Human mode
- **Manual send:** type and send messages from the dashboard in either mode
- **Real-time:** new messages and mode changes appear instantly via Supabase Realtime

## Customizing the AI

The assistant's behavior is defined by the system prompt in
[`src/lib/system-prompt.ts`](src/lib/system-prompt.ts). It ships with a sample prompt for
a **dental clinic assistant** (`DENTIST_SYSTEM_PROMPT`), including placeholder clinic
details. Edit that file to change the persona, tone, business information, and boundaries.

Model selection and request options live in [`src/lib/ai.ts`](src/lib/ai.ts). Only the
last 20 messages of a conversation are sent as context; adjust the `.limit(20)` in
[`src/app/api/webhook/route.ts`](src/app/api/webhook/route.ts) to change the window.

## Deployment

Deploy to Vercel:

```bash
vercel
```

Add all environment variables in the Vercel project settings, then update the Meta
webhook callback URL to point at your Vercel domain.

---

## Step-by-Step Setup Guide

Follow these steps in order to go from zero to a working WhatsApp AI agent.

### Step 1: Create a Meta Business App

1. Go to https://developers.facebook.com and log in
2. Click **My Apps** > **Create App**
3. Select **Business** as the app type
4. Give it a name (e.g. "WhatsApp AI Agent") and click **Create**
5. On the app dashboard, find **WhatsApp** and click **Set Up**
6. You'll be assigned a test phone number and a temporary access token

### Step 2: Get a Permanent Access Token

The temporary token expires in 24 hours. To get a permanent one:

1. Go to https://business.facebook.com/settings/system-users
2. Click **Add** to create a new System User (Admin role)
3. Click **Add Assets** > select your app > toggle **Full Control**
4. Click **Generate Token** > select your app > check `whatsapp_business_messaging` and `whatsapp_business_management`
5. Copy the token — this is your `WHATSAPP_ACCESS_TOKEN`

### Step 3: Get Your Phone Number ID

1. Go to https://developers.facebook.com > your app > WhatsApp > **API Setup**
2. Under "From", you'll see your test phone number and its **Phone Number ID**
3. Copy it — this is your `WHATSAPP_PHONE_NUMBER_ID`

### Step 4: Create a Supabase Project

1. Go to https://supabase.com and create a new project
2. Once created, go to **Project Settings** > **API**
3. Copy these values:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** -> `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **SQL Editor** and run [`supabase-schema.sql`](supabase-schema.sql)

### Step 5: Get an OpenRouter API Key

1. Go to https://openrouter.ai and create an account
2. Go to https://openrouter.ai/keys and create a new API key
3. Copy it — this is your `OPENROUTER_API_KEY`
4. Choose a model ID for `AI_MODEL` (e.g. `anthropic/claude-sonnet-4-20250514`, `openai/gpt-4o`)

### Step 6: Configure the Project

1. Clone this repo and install dependencies:
   ```bash
   git clone <repo-url>
   cd Whatsapp-Agent-main
   npm install
   ```

2. Create your `.env.local` file:
   ```bash
   cp .env.example .env.local
   ```

3. Fill in all the values you collected in Steps 2-5, and pick a `WHATSAPP_VERIFY_TOKEN`

### Step 7: Start the App

```bash
npm run dev
```

The app starts on http://localhost:3000. Open it in your browser — you should see the
dashboard with an empty conversation list.

### Step 8: Expose Your Local Server

Meta needs a public HTTPS URL to send webhooks to. Use ngrok:

```bash
# Install ngrok if you haven't: https://ngrok.com/download
ngrok http 3000
```

Copy the `https://` forwarding URL (e.g. `https://abc123.ngrok-free.app`).

### Step 9: Configure the Webhook in Meta

1. Go to https://developers.facebook.com > your app > WhatsApp > **Configuration**
2. Under "Webhook", click **Edit**
3. Set the **Callback URL** to: `https://your-ngrok-url.ngrok-free.app/api/webhook`
4. Set the **Verify Token** to the same value as your `WHATSAPP_VERIFY_TOKEN`
5. Click **Verify and Save**
6. Under "Webhook Fields", click **Manage** and subscribe to **messages**

### Step 10: Add Your Phone Number to Recipients

If using the Meta test phone number:

1. Go to WhatsApp > API Setup
2. Under "To", add your personal WhatsApp phone number
3. Enter the verification code you receive on WhatsApp

### Step 11: Send a Test Message

1. Open WhatsApp on your phone
2. Send a message to the Meta test phone number (shown in API Setup)
3. You should receive an AI-generated reply within a few seconds
4. Open the dashboard at http://localhost:3000 — the conversation appears in the sidebar

### Step 12: Deploy to Production (Optional)

1. Push your code to GitHub
2. Import the project on https://vercel.com
3. Add all your environment variables in Vercel's project settings
4. Deploy — Vercel gives you a production URL
5. Go back to Meta > WhatsApp > Configuration and update the webhook URL to your Vercel URL

## Troubleshooting

| Problem | Solution |
|---|---|
| Webhook verification fails | Confirm `WHATSAPP_VERIFY_TOKEN` matches in both `.env.local` and the Meta dashboard |
| Messages received but no AI reply | Check `OPENROUTER_API_KEY` and `AI_MODEL` are valid; check the conversation isn't in Human mode |
| Dashboard shows no conversations | Confirm the app port (check terminal output) and that the schema was applied |
| Dashboard doesn't update live | Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set and Realtime is enabled for both tables |
| Duplicate replies | Meta retries if the webhook doesn't respond within 5 seconds — check logs for slow AI responses |
| "Message failed to send" | Verify `WHATSAPP_ACCESS_TOKEN` hasn't expired and `WHATSAPP_PHONE_NUMBER_ID` is correct |

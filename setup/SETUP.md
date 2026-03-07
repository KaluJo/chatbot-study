# Chatbot Study - Complete Setup Guide

This guide walks you through setting up your own instance of the Chatbot Study research toolkit from scratch.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20+** installed ([download](https://nodejs.org/))
- **pnpm** package manager (`npm install -g pnpm`)
- A **GitHub account** (for cloning the repository)
- A **credit card** for API services (all have free tiers)

## Step 1: Create a Supabase Project

[Supabase](https://supabase.com) provides the PostgreSQL database and authentication infrastructure.

1. Go to [https://supabase.com](https://supabase.com) and sign up/log in
2. Click **"New Project"**
3. Fill in the project details:
   - **Name**: `chatbot-study` (or your preferred name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose the closest to your participants
4. Click **"Create new project"** and wait ~2 minutes for setup

### Get Your Supabase Credentials

Once your project is ready:

1. Go to **Settings** → **API** in the left sidebar
2. Copy these values (you'll need them for `.env.local`):
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** key: `eyJhbGciOiJIUzI1NiIs...`

## Step 2: Run the Database Setup Script

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open `setup/database.sql` from this repository
4. Copy the **entire contents** and paste into the SQL Editor
5. Click **"Run"** (or press Cmd/Ctrl + Enter)

You should see "Success. No rows returned" - this is expected!

> **Important:** This script is **idempotent** (safe to run multiple times). After pulling updates from the repository, **always re-run this script** to apply any new database functions, tables, or policies. Your existing data will not be affected.
>
> Common symptom of missing database updates: errors like `Could not find the function public.function_name(...) in the schema cache`

### Verify the Setup

To verify tables were created:

1. Go to **Table Editor** in the left sidebar
2. You should see all tables: `value_graph_users`, `chatlog`, `topics`, etc.
3. Click on `contexts` - you should see 6 default contexts (Work, Leisure, etc.)

## Step 3: Create Your First Admin User

In the **SQL Editor**, run:

```sql
INSERT INTO value_graph_users (name, email, access_code, is_admin)
VALUES ('Your Name', 'your@email.com', 'your-secret-admin-code', TRUE);
```

**Important**: Replace:
- `Your Name` with your actual name
- `your@email.com` with your email
- `your-secret-admin-code` with a memorable but secure code (this is your login!)

Save this access code - you'll use it to log into the admin dashboard.

## Step 4: Get API Keys

You'll need API keys from at least one LLM provider. Here's how to get each:

### Anthropic Claude (Required for Chat)

1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Sign up/log in
3. Go to **API Keys** and create a new key
4. Copy the key (starts with `sk-ant-...`)

### Google Gemini (Required for Strategy Generation)

1. Go to [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key

### OpenAI (Optional - for Embeddings)

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign up/log in
3. Click **"Create new secret key"**
4. Copy the key (starts with `sk-...`)

**Note**: OpenAI embeddings are optional. The system will fall back to text-based similarity if not configured.

## Step 5: Configure Environment Variables

1. In the repository root, copy the example environment file:

```bash
cp .env.example .env.local
```

2. Open `.env.local` in your editor and fill in the values:

```bash
# Required: Supabase (client-side, must be NEXT_PUBLIC_)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Required: Anthropic Claude (server-side only, NOT exposed to browser)
ANTHROPIC_API_KEY=sk-ant-your-key
CLAUDE_MODEL=claude-sonnet-4-20250514

# Required: Google Gemini (server-side only)
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_PRO=gemini-2.5-pro

# Optional: OpenAI (server-side only)
OPENAI_API_KEY=sk-your-key
```

## Step 6: Install Dependencies and Run

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## Step 7: First-Time Setup Wizard

When you first open the app with an empty database, you'll be automatically redirected to the **Setup Wizard** (`/setup`):

1. **Service Check**: The wizard verifies which APIs are configured:
   - ✓ Supabase (required) - database connection
   - ✓ Claude (required) - chat functionality  
   - ○ Gemini (recommended) - personalized strategies
   - ○ OpenAI (optional) - semantic embeddings

2. **Create Admin Account**: Enter your admin name and access code

3. **Done!**: You'll be redirected to login with your new admin credentials

### What Happens Without Optional APIs?

| Missing API | What Happens |
|-------------|--------------|
| **Gemini** | Chat works with generic conversation strategies (no personalization) |
| **OpenAI** | Topic similarity uses text-matching instead of semantic search |

Both fallbacks work fine - you just get reduced functionality.

### Manual Access

You can always access the setup wizard at `/setup` to:
- Re-check your API configuration
- Create additional admin accounts
- Troubleshoot connection issues

## Production Deployment

### Deploy to Vercel (Recommended)

1. Push your repository to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add all environment variables in Vercel's project settings
4. Deploy!

### Environment Variables in Production

In Vercel, go to **Settings** → **Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` |
| `GEMINI_API_KEY` | Your Gemini key |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GEMINI_MODEL_PRO` | `gemini-2.5-pro` |
| `OPENAI_API_KEY` | Your OpenAI key (optional) |

## Troubleshooting

### "Invalid access code" on login

- Verify the access code was inserted correctly in the database
- Check the `value_graph_users` table in Supabase Table Editor
- Access codes are case-sensitive

### Chat not responding

- Check browser console for API errors
- Verify `ANTHROPIC_API_KEY` is set correctly in your environment
- Check Anthropic console for API usage/errors

### Strategy generation fails

- Verify `GEMINI_API_KEY` is set correctly in your environment
- Check Google AI Studio for API quotas

### "Could not find the function" error

If you see an error like `Could not find the function public.some_function(...) in the schema cache`:

1. This means your database is missing functions added in recent updates
2. **Solution:** Re-run `setup/database.sql` in the Supabase SQL Editor
3. The script is idempotent - it won't affect your existing data

### Vector similarity not working

- If using OpenAI embeddings, verify the key is set
- Without OpenAI, the system uses text-based fallback (still works, less accurate)
- Check that the `vector` extension is enabled in Supabase

### Database connection issues

- Verify Supabase project is active (not paused)
- Check that URL and anon key are correct
- Ensure no firewall blocking connections

## Security Notes

### API Keys in Browser

This toolkit uses `NEXT_PUBLIC_*` environment variables, which are exposed to the browser. This is intentional for research transparency and ease of setup.

**For production studies**, consider:

1. Moving API calls to server-side routes
2. Implementing rate limiting
3. Using Supabase Edge Functions for sensitive operations

### Row Level Security (RLS)

The database uses RLS to ensure:
- Users can only access their own data
- Admins can access all data
- The `chat_backup` table is exempt (failsafe for data recovery)

## Next Steps

Once setup is complete:

1. Read the [Architecture Documentation](../docs/ARCHITECTURE.md)
2. Customize the chatbot persona in `app/chat/services/claude-service.ts`
3. Modify conversation strategies in `app/chat/services/strategy-service.ts`
4. Review the [Admin Guide](../docs/ADMIN_GUIDE.md) for managing participants

---

Need help? Open an issue on GitHub or check the main README for more resources.

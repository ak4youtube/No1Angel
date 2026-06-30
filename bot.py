import os
import datetime
import discord
from discord.ext import commands
from google import genai
from google.genai import types

# ----------------------------------------------------------------
# Initialization & Setup
# ----------------------------------------------------------------
intents = discord.Intents.default()
intents.members = True
intents.message_content = True

# Read configurations securely from Railway Environment Variables
TOKEN = os.getenv("DISCORD_TOKEN")
OWNER_ID = int(os.getenv("OWNER_ID", 0))
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

bot = commands.Bot(owner_id=OWNER_ID, intents=intents)

# Setup Gemini AI Client if key exists
ai_client = genai.Client(api_key=GEMINI_KEY) if GEMINI_KEY else None

# In-memory storage structures for AFK tracking and automated escalation logs
afk_users = {}       # Format: {user_id: {"message": str}}
infractions = {}     # Format: {user_id: count_int}

# ----------------------------------------------------------------
# Pillars 2, 3 & AFK Monitoring (Active Message Interception)
# ----------------------------------------------------------------
BANNED_WORDS = ["scamlink.com", "freediscordnitro", "hacktool"] # Hardcoded basic examples

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    # --- AFK Logic ---
    # 1. Clear AFK status if user types a new message
    if message.author.id in afk_users:
        del afk_users[message.author.id]
        await message.channel.send(f"👋 Welcome back {message.author.mention}, I have removed your AFK status.")

    # 2. Check if a mentioned user is AFK
    for mention in message.mentions:
        if mention.id in afk_users:
            details = afk_users[mention.id]
            await message.channel.send(f"📌 {mention.name} is currently AFK: *{details['message']}*", delete_after=10)

    # --- Pillar 2: Active Auto-Mod (Hard Filter) ---
    content_lower = message.content.lower()
    for word in BANNED_WORDS:
        if word in content_lower:
            try:
                await message.delete()
            except Exception:
                pass
            await handle_infraction(message.author, message.channel, "Sending blacklisted terms / scam phrases.")
            return

    # --- Pillar 3: AI-Assisted Context Flagging ---
    # Scans messages longer than 15 characters to flag toxicity patterns natively
    if len(message.content) > 15 and ai_client:
        try:
            prompt = f"Analyze if the following text contains extreme toxicity, severe slurs, harassment, or grooming behavior. Reply with only one word: 'SAFE' or 'TOXIC'.\nText: {message.content}"
            response = ai_client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
            if "TOXIC" in response.text.upper():
                try:
                    await message.delete()
                except Exception:
                    pass
                await handle_infraction(message.author, message.channel, "AI Flagged Content (Toxicity/Harassment Context).")
        except Exception:
            pass # Keep bot resilient if external AI API experiences latency

# --- Pillar 4: Graduated Escalation Handler ---
async def handle_infraction(user: discord.Member, channel: discord.TextChannel, reason: str):
    uid = user.id
    infractions[uid] = infractions.get(uid, 0) + 1
    count = infractions[uid]

    if count == 1:
        await channel.send(f"⚠️ {user.mention}, Warning 1/3: {reason}", delete_after=15)
    elif count == 2:
        try:
            # Mute for 10 minutes
            await user.timeout_for(datetime.timedelta(minutes=10), reason=reason)
            await channel.send(f"🔇 {user.name} has been muted for 10 minutes following Warning 2/3.", delete_after=15)
        except Exception:
            await channel.send(f"⚠️ {user.mention}, Warning 2/3: {reason}", delete_after=15)
    elif count >= 3:
        try:
            await user.ban(reason=f"Automated System: Exceeded max infractions. Reason: {reason}")
            await channel.send(f"🔨 {user.name} has been permanently banned from the server for reaching max infractions.")
        except Exception:
            await channel.send(f"❌ Failed to execute system ban on {user.name}. Ensure bot has proper permissions.")

# ----------------------------------------------------------------
# Core Bot Commands (AFK, AI Search, Admin & Owner Tools)
# ----------------------------------------------------------------
@bot.slash_command(description="Set your status to AFK.")
async def afk(ctx: discord.ApplicationContext, reason: str = "Away from keyboard"):
    afk_users[ctx.author.id] = {"message": reason}
    await ctx.respond(f"💤 {ctx.author.mention} is now AFK: **{reason}**")

@bot.slash_command(description="Query Gemini AI to answer a question or search information.")
async def search(ctx: discord.ApplicationContext, prompt: str):
    if not ai_client:
        return await ctx.respond("❌ Gemini Search API key is missing or not configured in variables.", ephemeral=True)
    
    await ctx.defer() # Avoids the 3-second Discord response timeout limit
    try:
        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=400)
        )
        clean_text = response.text[:1900] # Stay within Discord's 2000 character limit
        await ctx.followup.send(f"🤖 **Gemini AI Search Result:**\n\n{clean_text}")
    except Exception as e:
        await ctx.followup.send(f"⚠️ Failed to query AI model: {str(e)}")

@bot.slash_command(description="[OWNER ONLY] Display current health telemetry data.")
@commands.is_owner()
async def status(ctx: discord.ApplicationContext):
    embed = discord.Embed(title="⚙️ Bot Diagnostics Dashboard", color=discord.Color.brand_green())
    embed.add_field(name="Ping Latency", value=f"`{round(bot.latency * 1000)}ms`", inline=True)
    embed.add_field(name="Monitored Servers", value=f"`{len(bot.guilds)}`", inline=True)
    embed.add_field(name="Cached AFK Tracks", value=f"`{len(afk_users)}`", inline=True)
    embed.add_field(name="Current Session Infractions", value=f"`{len(infractions)}`", inline=True)
    embed.set_footer(text="Privileged execution authorized.")
    await ctx.respond(embed=embed)

@status.error
async def status_error(ctx: discord.ApplicationContext, error: discord.DiscordException):
    if isinstance(error, commands.NotOwner):
        await ctx.respond("⛔ Access Denied: This diagnostics vector is strictly reserved for the Bot Owner.", ephemeral=True)

# ----------------------------------------------------------------
# Execution Entrypoint
# ----------------------------------------------------------------
@bot.event
async def on_ready():
    print(f"Logged in and active as {bot.user} (ID: {bot.user.id})")

if __name__ == "__main__":
    if not TOKEN:
        print("CRITICAL LOG ERROR: DISCORD_TOKEN is missing. System terminating.")
    else:
        bot.run(TOKEN)

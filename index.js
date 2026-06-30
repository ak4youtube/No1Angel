import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { GoogleGenAI } from '@google/genai';

// ----------------------------------------------------------------
// Initialization & Configurations Securely Extracted
// ----------------------------------------------------------------
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Setup official Google Gen AI Client
const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

// In-memory runtime tracking caches
const afkUsers = new Map();     // Structure: userID -> { reason: string }
const infractions = new Map();  // Structure: userID -> infractionCount (int)

const BANNED_WORDS = ["scamlink.com", "freediscordnitro", "hacktool"];

// ----------------------------------------------------------------
// Pillars 2, 3 & AFK Monitoring (Active Chat Interception)
// ----------------------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const authorId = message.author.id;

    // --- AFK Logic ---
    // 1. Return active user from AFK status
    if (afkUsers.has(authorId)) {
        afkUsers.delete(authorId);
        const reply = await message.channel.send(`👋 Welcome back ${message.author}, I have removed your AFK status.`);
        setTimeout(() => reply.delete().catch(() => {}), 8000);
    }

    // 2. Identify if a user tagged someone who is away
    if (message.mentions.users.size > 0) {
        message.mentions.users.forEach(async (user) => {
            if (afkUsers.has(user.id)) {
                const details = afkUsers.get(user.id);
                const afkReply = await message.channel.send(`📌 **${user.username}** is currently AFK: *${details.reason}*`);
                setTimeout(() => afkReply.delete().catch(() => {}), 10000);
            }
        });
    }

    // --- Pillar 2: Hard-coded Word Filters ---
    const contentLower = message.content.toLowerCase();
    const containsBadWord = BANNED_WORDS.some(word => contentLower.includes(word));
    
    if (containsBadWord) {
        await message.delete().catch(() => {});
        await handleInfraction(message.member, message.channel, "Sending blacklisted terms / scam phrases.");
        return;
    }

    // --- Pillar 3: AI Sentiment Context Evaluation ---
    if (message.content.length > 15 && ai) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Analyze if the following text contains extreme toxicity, severe slurs, harassment, or grooming behavior. Reply with only one word: 'SAFE' or 'TOXIC'.\nText: ${message.content}`
            });

            if (response.text && response.text.toUpperCase().includes('TOXIC')) {
                await message.delete().catch(() => {});
                await handleInfraction(message.member, message.channel, "AI Flagged Content (Contextual Toxicity/Harassment).");
            }
        } catch (error) {
            // Keep your core thread safe if the AI API experiences latency spikes
        }
    }
});

// --- Pillar 4: Graduated Escalation Handler ---
async function handleInfraction(member, channel, reason) {
    if (!member) return;
    const uid = member.id;
    
    const currentCount = (infractions.get(uid) || 0) + 1;
    infractions.set(uid, currentCount);

    if (currentCount === 1) {
        await channel.send(`⚠️ ${member}, Warning 1/3: ${reason}`);
    } else if (currentCount === 2) {
        try {
            // Timeout for 10 minutes (600,000 ms)
            await member.timeout(10 * 60 * 1000, reason);
            await channel.send(`🔇 **${member.user.username}** has been muted for 10 minutes following Warning 2/3.`);
        } catch (err) {
            await channel.send(`⚠️ ${member}, Warning 2/3: ${reason}`);
        }
    } else if (currentCount >= 3) {
        try {
            await member.ban({ reason: `Automated System: Exceeded max infractions. Reason: ${reason}` });
            await channel.send(`🔨 **${member.user.username}** has been permanently banned for reaching max infractions.`);
        } catch (err) {
            await channel.send(`❌ Failed to execute system ban on ${member.user.username}. Check bot permissions hierarchy.`);
        }
    }
}

// ----------------------------------------------------------------
// Registration & Dynamic Interaction / Slash Mapping
// ----------------------------------------------------------------
client.on('ready', async () => {
    console.log(`Node Engine active. Logged in as ${client.user.tag}`);

    // Build structure parameters for register arrays
    const commands = [
        new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Set your status to AFK.')
            .addStringOption(opt => opt.setName('reason').setDescription('Why are you going away?')),
        new SlashCommandBuilder()
            .setName('search')
            .setDescription('Query Gemini AI to search patterns or answer questions.')
            .addStringOption(opt => opt.setName('query').setDescription('The prompt to send to Gemini').setRequired(true)),
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('[OWNER ONLY] Display current bot execution analytics dashboard.')
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        // Registers slash commands globally across all connected servers
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) {
        console.error("Error deployment layout:", err);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- Slash Command: /afk ---
    if (commandName === 'afk') {
        const reason = interaction.options.getString('reason') || 'Away from keyboard';
        afkUsers.set(interaction.user.id, { reason });
        return interaction.reply(`💤 ${interaction.user} is now AFK: **${reason}**`);
    }

    // --- Slash Command: /search ---
    if (commandName === 'search') {
        if (!ai) {
            return interaction.reply({ content: '❌ Gemini API Key is missing inside environment variables.', ephemeral: true });
        }
        await interaction.deferReply();
        try {
            const query = interaction.options.getString('query');
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: query
            });

            const cleanText = response.text ? response.text.substring(0, 1900) : "No result returned.";
            await interaction.editReply(`🤖 **Gemini AI Search Result:**\n\n${cleanText}`);
        } catch (err) {
            await interaction.editReply(`⚠️ Failed to complete AI generation query: ${err.message}`);
        }
    }

    // --- Slash Command: /status [OWNER ONLY] ---
    if (commandName === 'status') {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '⛔ Access Denied: This diagnostic data is exclusively reserved for the Bot Owner.', ephemeral: true });
        }

        const statusEmbed = new EmbedBuilder()
            .setTitle('⚙️ Node Bot Diagnostics Dashboard')
            .setColor(0x57F287)
            .addFields(
                { name: 'WebSocket Ping', value: `\`${client.ws.ping}ms\``, inline: true },
                { name: 'Active Guilds Count', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: 'Cached AFK Profiles', value: `\`${afkUsers.size}\``, inline: true },
                { name: 'Total Session Infractions', value: `\`${infractions.size}\``, inline: true }
            )
            .setFooter({ text: 'Privileged Node execution authorized.' });

        return interaction.reply({ embeds: [statusEmbed] });
    }
});

// Run Bot
if (!TOKEN) {
    console.error("CRITICAL ERROR: DISCORD_TOKEN is completely missing.");
} else {
    client.login(TOKEN);
}

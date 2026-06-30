import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
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
const dynamicBannedWords = new Set(["scamlink.com", "freediscordnitro", "hacktool"]);

// ----------------------------------------------------------------
// Pillars 2, 3 & AFK Monitoring (Active Chat Interception)
// ----------------------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const authorId = message.author.id;

    // --- AFK Logic ---
    if (afkUsers.has(authorId)) {
        afkUsers.delete(authorId);
        const reply = await message.channel.send(`👋 Welcome back ${message.author}, I have removed your AFK status.`);
        setTimeout(() => reply.delete().catch(() => {}), 8000);
    }

    if (message.mentions.users.size > 0) {
        message.mentions.users.forEach(async (user) => {
            if (afkUsers.has(user.id)) {
                const details = afkUsers.get(user.id);
                const afkReply = await message.channel.send(`📌 **${user.username}** is currently AFK: *${details.reason}*`);
                setTimeout(() => afkReply.delete().catch(() => {}), 10000);
            }
        });
    }

    // --- Pillar 2: Word Filters ---
    const contentLower = message.content.toLowerCase();
    const containsBadWord = Array.from(dynamicBannedWords).some(word => contentLower.includes(word));
    
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
                contents: `Analyze if the following text contains extreme toxicity, severe slurs, harassment, or grooming behavior. Reply with only one word: 'SAFE' or 'TOXIC'.\nText: {message.content}`
            });

            if (response.text && response.text.toUpperCase().includes('TOXIC')) {
                await message.delete().catch(() => {});
                await handleInfraction(message.member, message.channel, "AI Flagged Content (Contextual Toxicity/Harassment).");
            }
        } catch (error) {
            // Failsafe catch for API timeouts
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
            await member.timeout(10 * 60 * 1000, reason);
            await channel.send(`🔇 **${member.user.username}** has been muted for 10 minutes following Warning 2/3.`);
        } catch (err) {
            await channel.send(`⚠️ ${member}, Warning 2/3: ${reason}`);
        }
    } else if (currentCount >= 3) {
        try {
            await member.ban({ reason: `Automated System: Exceeded max infractions. Reason: {reason}` });
            await channel.send(`🔨 **${member.user.username}** has been permanently banned for reaching max infractions.`);
        } catch (err) {
            await channel.send(`❌ Failed to execute system ban on ${member.user.username}. Check bot permissions hierarchy.`);
        }
    }
}

// ----------------------------------------------------------------
// Registration & Dynamic Slash Command Builder Arrays
// ----------------------------------------------------------------
client.on('ready', async () => {
    console.log(`Node Engine active. Logged in as ${client.user.tag}`);

    const commands = [
        // Public & Utility
        new SlashCommandBuilder().setName('help').setDescription('Displays a guide listing all available commands.'),
        new SlashCommandBuilder().setName('afk').setDescription('Set your status to AFK.').addStringOption(opt => opt.setName('reason').setDescription('Why are you going away?')),
        new SlashCommandBuilder().setName('search').setDescription('Query Gemini AI to search patterns or answer questions.').addStringOption(opt => opt.setName('query').setDescription('The prompt to send to Gemini').setRequired(true)),
        new SlashCommandBuilder().setName('status').setDescription('[OWNER ONLY] Display current bot execution analytics dashboard.'),
        new SlashCommandBuilder().setName('avatar').setDescription('Fetches a users profile image.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)),
        new SlashCommandBuilder().setName('userinfo').setDescription('Displays technical metadata regarding a user account.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)),
        new SlashCommandBuilder().setName('serverinfo').setDescription('Shows an analytical data snapshot of the current server.'),

        // Moderation Core - Guarded with explicit native Discord Application Permissions
        new SlashCommandBuilder().setName('history').setDescription('Displays a specified users session infractions.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('warn').setDescription('Officially warns a user for a rule violation.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('mute').setDescription('Temporarily places a member on timeout.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Duration of timeout in minutes').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for mute')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('unmute').setDescription('Removes an active timeout from a member early.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('warnclear').setDescription('Resets a users session infractions back to zero.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('kick').setDescription('Disconnects a member from the guild server.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for kick')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
        new SlashCommandBuilder().setName('ban').setDescription('Permanently bans a user from the server guild.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for ban')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        new SlashCommandBuilder().setName('unban').setDescription('Removes a user from the server ban list.').addStringOption(opt => opt.setName('userid').setDescription('Raw Discord String User ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        
        // Chat Management & Lockdown Tools
        new SlashCommandBuilder().setName('purge').setDescription('Bulk-deletes a specified number of recent chat messages.').addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to clear (1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new SlashCommandBuilder().setName('lock').setDescription('Locks down the current channel, blocking members from typing.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        new SlashCommandBuilder().setName('unlock').setDescription('Restores messaging permissions back to a locked channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        new SlashCommandBuilder().setName('slowmode').setDescription('Sets a custom message cooldown delay on the current channel.').addIntegerOption(opt => opt.setName('seconds').setDescription('Cooldown in seconds (0 to turn off)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        new SlashCommandBuilder().setName('filteradd').setDescription('Dynamically adds a temporary custom string token to Pillar 2 filters.').addStringOption(opt => opt.setName('word').setDescription('Keyword phrase to target').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder().setName('filterlist').setDescription('Prints out all current blacklisted keywords active in Pillar 2.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) {
        console.error("Error deployment layout:", err);
    }
});

// ----------------------------------------------------------------
// Interaction Engine Router Execution
// ----------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, channel, guild } = interaction;

    // --- /help ---
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📚 Mod Bot Command Matrix Directory')
            .setColor(0x3498DB)
            .setDescription('System access permissions are enforced via native API verification wrappers.')
            .addFields(
                { name: '🌐 General Utilities', value: '`/help`, `/afk`, `/search`, `/avatar`, `/userinfo`, `/serverinfo`', inline: false },
                { name: '🛡️ Moderation Desk', value: '`/history`, `/warn`, `/mute`, `/unmute`, `/warnclear`, `/kick`, `/ban`, `/unban`', inline: false },
                { name: '🧹 Management & Filters', value: '`/purge`, `/lock`, `/unlock`, `/slowmode`, `/filteradd`, `/filterlist`', inline: false }
            );
        return interaction.reply({ embeds: [helpEmbed] });
    }

    // --- /afk ---
    if (commandName === 'afk') {
        const reason = options.getString('reason') || 'Away from keyboard';
        afkUsers.set(interaction.user.id, { reason });
        return interaction.reply(`💤 ${interaction.user} is now AFK: **${reason}**`);
    }

    // --- /search ---
    if (commandName === 'search') {
        if (!ai) return interaction.reply({ content: '❌ Gemini API Key configuration missing.', ephemeral: true });
        await interaction.deferReply();
        try {
            const query = options.getString('query');
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: query });
            return interaction.editReply(`🤖 **Gemini AI Search Result:**\n\n${(response.text || "Empty trace.").substring(0, 1900)}`);
        } catch (err) {
            return interaction.editReply(`⚠️ Process Execution Fault: ${err.message}`);
        }
    }

    // --- /status ---
    if (commandName === 'status') {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '⛔ Security Fault: Reserved for deployment bot owner.', ephemeral: true });
        const embed = new EmbedBuilder().setTitle('⚙️ Diagnostics Panel').setColor(0x57F287)
            .addFields(
                { name: 'Ping Latency', value: `\`${client.ws.ping}ms\``, inline: true },
                { name: 'Guild Size', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: 'AFK Memory Tracker', value: `\`${afkUsers.size}\``, inline: true }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // --- /avatar ---
    if (commandName === 'avatar') {
        const target = options.getUser('target');
        return interaction.reply({ content: `🖼️ **${target.username}'s Avatar:**\n${target.displayAvatarURL({ dynamic: true, size: 1024 })}` });
    }

    // --- /userinfo ---
    if (commandName === 'userinfo') {
        const targetUser = options.getUser('target');
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        const embed = new EmbedBuilder().setTitle(`👤 Trace Details: ${targetUser.username}`).setColor(0x9B59B6)
            .addFields(
                { name: 'User ID ID', value: `\`${targetUser.id}\``, inline: true },
                { name: 'Created Profile', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Server Joined', value: targetMember ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>` : 'Not in server', inline: true }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // --- /serverinfo ---
    if (commandName === 'serverinfo') {
        const embed = new EmbedBuilder().setTitle(`📊 Cluster Server Profile: ${guild.name}`).setColor(0xE67E22)
            .addFields(
                { name: 'Total Accounts', value: `\`${guild.memberCount}\``, inline: true },
                { name: 'Created Date', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // --- /history ---
    if (commandName === 'history') {
        const target = options.getUser('target');
        const count = infractions.get(target.id) || 0;
        return interaction.reply({ content: `📊 User history profile for **${target.username}**: \`${count}\` current session infraction logs.` });
    }

    // --- /warn ---
    if (commandName === 'warn') {
        const target = options.getUser('target');
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        const reason = options.getString('reason');
        await interaction.reply({ content: `✅ Logged tracking warning entry against alignment index for ${target.username}.` });
        return handleInfraction(targetMember, channel, reason);
    }

    // --- /mute ---
    if (commandName === 'mute') {
        const targetMember = await guild.members.fetch(options.getUser('target').id).catch(() => null);
        const minutes = options.getInteger('minutes');
        const reason = options.getString('reason') || 'No explicit reason parsed.';
        if (!targetMember) return interaction.reply({ content: '❌ Target profile missing.', ephemeral: true });
        
        await targetMember.timeout(minutes * 60 * 1000, reason);
        return interaction.reply({ content: `🔇 **${targetMember.user.username}** has been restricted for ${minutes} minutes. Reason: ${reason}` });
    }

    // --- /unmute ---
    if (commandName === 'unmute') {
        const targetMember = await guild.members.fetch(options.getUser('target').id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: '❌ Profile signature evaluation invalid.', ephemeral: true });
        
        await targetMember.timeout(null);
        return interaction.reply({ content: `🔊 Lifted text and voice timeouts early from **${targetMember.user.username}**.` });
    }

    // --- /warnclear ---
    if (commandName === 'warnclear') {
        const target = options.getUser('target');
        infractions.set(target.id, 0);
        return interaction.reply({ content: `🔄 Purged and reset all volatile runtime session records to zero for **${target.username}**.` });
    }

    // --- /kick ---
    if (commandName === 'kick') {
        const targetMember = await guild.members.fetch(options.getUser('target').id).catch(() => null);
        const reason = options.getString('reason') || 'No explicit tracking reason specified.';
        if (!targetMember) return interaction.reply({ content: '❌ Member profile trace unavailable.', ephemeral: true });
        
        await targetMember.kick(reason);
        return interaction.reply({ content: `👢 **${targetMember.user.username}** was disconnected from the server environment.` });
    }

    // --- /ban ---
    if (commandName === 'ban') {
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'No explicit context parsed.';
        
        await guild.members.ban(targetUser.id, { reason });
        return interaction.reply({ content: `🔨 **${targetUser.username}** has been completely blacklisted and banned.` });
    }

    // --- /unban ---
    if (commandName === 'unban') {
        const userId = options.getString('userid');
        try {
            await guild.members.unban(userId);
            return interaction.reply({ content: `🔓 Revoked ban profile database configuration matching identity tracker sequence ID: \`${userId}\`.` });
        } catch {
            return interaction.reply({ content: '❌ Error: Identity signature mismatch or ID was never banned.', ephemeral: true });
        }
    }

    // --- /purge ---
    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '❌ Provide bounds between 1 and 100 entries.', ephemeral: true });
        
        const deleted = await channel.bulkDelete(amount, true).catch(() => []);
        return interaction.reply({ content: `🧹 Successfully scrubbed and dropped \`${deleted.size}\` chat message lines cleanly.`, ephemeral: true });
    }

    // --- /lock ---
    if (commandName === 'lock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return interaction.reply({ content: '🔒 **Channel Closed:** Everyone permission mappings evaluated to locked status.' });
    }

    // --- /unlock ---
    if (commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return interaction.reply({ content: '🔓 **Channel Reopened:** Default messaging streams reset.' });
    }

    // --- /slowmode ---
    if (commandName === 'slowmode') {
        const seconds = options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        return interaction.reply({ content: `⏳ Channel slowmode cycle limit reassigned to **${seconds}** seconds.` });
    }

    // --- /filteradd ---
    if (commandName === 'filteradd') {
        const word = options.getString('word').toLowerCase();
        dynamicBannedWords.add(word);
        return interaction.reply({ content: `📥 Appended phrase entry \`${word}\` securely inside active auto-mod dictionaries.` });
    }

    // --- /filterlist ---
    if (commandName === 'filterlist') {
        const list = Array.from(dynamicBannedWords).map(w => `\`${w}\``).join(', ');
        return interaction.reply({ content: `📋 **Active Hardcoded Blacklisted Strings Engine Filters:**\n${list || '_None_'}` });
    }
});

// Run Bot Engine Core Execution
if (!TOKEN) {
    console.error("CRITICAL RUNTIME PREPARATION EXCEPTION: DISCORD_TOKEN is completely missing.");
} else {
    client.login(TOKEN);
}

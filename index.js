import { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} from 'discord.js';

// ----------------------------------------------------------------
// Initialization & Core Configurations
// ----------------------------------------------------------------
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const afkUsers = new Map();       
const notifyQueue = new Map();     
const infractions = new Map();    

async function getLogChannel(guild, channelName) {
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'No1Angel Logs');
    if (!category) return null;
    return guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === channelName && c.parentId === category.id);
}

async function dispatchLog(guild, channelName, embed) {
    try {
        const logChannel = await getLogChannel(guild, channelName);
        if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error(`Logging Dispatch Failure on channel ${channelName}:`, err);
    }
}

// ----------------------------------------------------------------
// Core Gateway Events: Interactive AFK Engine & Chat Interception
// ----------------------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const authorId = message.author.id;

    if (afkUsers.has(authorId)) {
        afkUsers.delete(authorId);
        
        const containerMessage = `>>> 🟢 **WELCOME BACK!**\n` +
            `👋 Welcome back ${message.author}! Your **AFK Status** has been automatically revoked.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            
        const reply = await message.channel.send({ content: containerMessage });
        setTimeout(() => reply.delete().catch(() => {}), 8000);

        if (notifyQueue.has(authorId)) {
            const usersToNotify = notifyQueue.get(authorId);
            usersToNotify.forEach(async (id) => {
                try {
                    const user = await client.users.fetch(id);
                    const alertContainer = `>>> 🔔 **USER RETURN ALERT**\n` +
                        `👤 **${message.author.username}** has returned and is active in server: **${message.guild.name}**.`;
                    await user.send({ content: alertContainer });
                } catch {}
            });
            notifyQueue.delete(authorId);
        }
    }

    if (message.mentions.users.size > 0) {
        for (const [id, user] of message.mentions.users) {
            if (afkUsers.has(id)) {
                const details = afkUsers.get(id);
                
                const afkEmbed = new EmbedBuilder()
                    .setTitle('📌 User is Currently Away')
                    .setDescription(`>>> **${user.username}** went AFK:\n\n💬 *"${details.reason}"*\n\nChoose an action below to connect with them:`)
                    .setColor(0x3498DB)
                    .setFooter({ text: 'No1Angel Interaction Hub' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`afk_message_${id}`)
                        .setLabel('Leave a Message')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✉️'),
                    new ButtonBuilder()
                        .setCustomId(`afk_notify_${id}`)
                        .setLabel('Notify When Back')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔔')
                );

                const afkReply = await message.channel.send({ embeds: [afkEmbed], components: [row] });
                setTimeout(() => afkReply.delete().catch(() => {}), 20000);
            }
        }
    }
});

// ----------------------------------------------------------------
// Multi-Stream Highly Informative Audit Logger Events
// ----------------------------------------------------------------

client.on('messageDelete', async (message) => {
    if (message.partial || !message.guild || message.author?.bot) return;
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Advanced Audit Log: Message Purged')
        .setColor(0xED4245)
        .setDescription(
            `🔹 **Author Profile:** ${message.author} (\`${message.author.id}\`)\n` +
            `🔹 **Channel Source:** ${message.channel} (\`${message.channel.id}\`)\n` +
            `🔹 **Created At:** <t:${Math.floor(message.createdTimestamp / 1000)}:F>\n\n` +
            `📝 **Raw Captured Message Contents:**\n\`\`\`\n${message.content || '[Attachment / Embed File Data Only]'}\n\`\`\``
        )
        .setTimestamp();
    await dispatchLog(message.guild, 'no1angel-message-logs', embed);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.partial || !oldMessage.guild || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 Advanced Audit Log: Message Modification Intercepted')
        .setColor(0xFEE75C)
        .setDescription(
            `🔹 **Author Profile:** ${oldMessage.author} (\`${oldMessage.author.id}\`)\n` +
            `🔹 **Channel Source:** ${oldMessage.channel} (\`${oldMessage.channel.id}\`)\n` +
            `🔹 **Message Permanent URL:** [Jump to Message](${newMessage.url})\n\n` +
            `📉 **Prior Content State:**\n\`\`\`\n${oldMessage.content || '_No readable text string_'}\n\`\`\`\n` +
            `📈 **New Content State:**\n\`\`\`\n${newMessage.content || '_No readable text string_'}\n\`\`\``
        )
        .setTimestamp();
    await dispatchLog(oldMessage.guild, 'no1angel-message-logs', embed);
});

client.on('guildMemberAdd', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('📥 Advanced Audit Log: New Identity Verification')
        .setColor(0x57F287)
        .setThumbnail(member.user.displayAvatarURL())
        .setDescription(
            `🔹 **Identity Name:** ${member.user.tag}\n` +
            `🔹 **Global Unique ID:** \`${member.id}\`\n` +
            `🔹 **Mention Token:** ${member}\n\n` +
            `📆 **Discord Registration Age:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F> (<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>)\n` +
            `🧬 **Total Server Member Count:** \`${member.guild.memberCount}\``
        )
        .setTimestamp();
    await dispatchLog(member.guild, 'no1angel-member-logs', embed);
});

client.on('guildMemberRemove', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('📤 Advanced Audit Log: Identity Departed Guild')
        .setColor(0xED4245)
        .setDescription(
            `🔹 **Identity Name:** \`${member.user.tag}\`\n` +
            `🔹 **Global Unique ID:** \`${member.id}\`\n` +
            `🔹 **Mention Token:** ${member}\n\n` +
            `📆 **Server Join Date Was:** ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : '`Cached Data Corrupted`'}\n` +
            `📉 **Remaining Active Population:** \`${member.guild.memberCount}\``
        )
        .setTimestamp();
    await dispatchLog(member.guild, 'no1angel-member-logs', embed);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = oldState.guild;
    const member = oldState.member;
    if (!member) return;

    let embed = new EmbedBuilder().setTimestamp().setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() });

    if (!oldState.channelId && newState.channelId) {
        embed.setTitle('🔊 Advanced Audit Log: Voice Interface Connected')
            .setColor(0x57F287)
            .setDescription(
                `🔹 **User Identity:** ${member} (\`${member.id}\`)\n` +
                `📥 **Target Allocation Room:** \`${newState.channel?.name}\` (\`${newState.channelId}\`)\n` +
                `👥 **Connected Users Inside Room:** \`${newState.channel?.members.size}\``
            );
    } else if (oldState.channelId && !newState.channelId) {
        embed.setTitle('🔇 Advanced Audit Log: Voice Interface Disconnected')
            .setColor(0xED4245)
            .setDescription(
                `🔹 **User Identity:** ${member} (\`${member.id}\`)\n` +
                `📤 **Disconnected Room:** \`${oldState.channel?.name}\` (\`${oldState.channelId}\`)`
            );
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        embed.setTitle('🔀 Advanced Audit Log: Voice Vector Handshake Routing')
            .setColor(0x3498DB)
            .setDescription(
                `🔹 **User Identity:** ${member} (\`${member.id}\`)\n\n` +
                `❌ **Old Access Point:** \`${oldState.channel?.name}\` (\`${oldState.channelId}\`)\n` +
                `➔ **New Access Point:** \`${newState.channel?.name}\` (\`${newState.channelId}\`)\n\n` +
                `👥 **Target Room Headcount:** \`${newState.channel?.members.size}\` Users`
            );
    } else {
        return; // Filter out system mutes
    }
    await dispatchLog(guild, 'no1angel-voice-logs', embed);
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setTitle('🆕 Advanced Audit Log: Interface Pipeline Manifested')
        .setColor(0x57F287)
        .setDescription(
            `🔹 **Channel Designation:** ${channel} (\`#${channel.name}\`)\n` +
            `🔹 **Unique Allocation ID:** \`${channel.id}\`\n` +
            `🔹 **Pipeline Type Matrix:** \`${ChannelType[channel.type]}\` (Type \`${channel.type}\`)\n` +
            `📂 **Category Parent Shell:** \`${channel.parent ? channel.parent.name : 'Independent Framework'}\``
        )
        .setTimestamp();
    await dispatchLog(channel.guild, 'no1angel-channel-logs', embed);
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setTitle('❌ Advanced Audit Log: Interface Pipeline Terminated')
        .setColor(0xED4245)
        .setDescription(
            `🔹 **Legacy Channel Name:** \`#${channel.name}\`\n` +
            `🔹 **Legacy Target ID:** \`${channel.id}\`\n` +
            `🔹 **Pipeline Type Matrix:** \`${ChannelType[channel.type]}\` (Type \`${channel.type}\`)\n` +
            `📂 **Category Shell Context:** \`${channel.parentId || 'Independent Global Layer'}\``
        )
        .setTimestamp();
    await dispatchLog(channel.guild, 'no1angel-channel-logs', embed);
});

client.on('roleCreate', async (role) => {
    const embed = new EmbedBuilder()
        .setTitle('🟢 Advanced Audit Log: Cryptographic Permissions Matrix Role Spawned')
        .setColor(0x57F287)
        .setDescription(
            `🔹 **Role Registry Label:** \`${role.name}\` (${role})\n` +
            `🔹 **Unique Access ID Token:** \`${role.id}\`\n` +
            `🎨 **Color Identifier Index:** \`${role.hexColor}\` (Int: \`${role.color}\`)\n` +
            `📊 **Hierarchy Layer Level:** Position \`${role.position}\` of server architecture`
        )
        .setTimestamp();
    await dispatchLog(role.guild, 'no1angel-role-logs', embed);
});

client.on('roleDelete', async (role) => {
    const embed = new EmbedBuilder()
        .setTitle('🔴 Advanced Audit Log: Cryptographic Role System Terminated')
        .setColor(0xED4245)
        .setDescription(
            `🔹 **Destroyed Registry Label:** \`${role.name}\`\n` +
            `🔹 **Destroyed Access ID Token:** \`${role.id}\`\n` +
            `🎨 **Color Index Cleaned:** \`${role.hexColor}\` (Int: \`${role.color}\`)\n` +
            `📊 **Prior Layer Level:** Position \`${role.position}\` across core server`
        )
        .setTimestamp();
    await dispatchLog(role.guild, 'no1angel-role-logs', embed);
});

// ----------------------------------------------------------------
// Registration Framework Matrix
// ----------------------------------------------------------------
client.on('ready', async () => {
    console.log(`No1Angel Log Engine Active: Connected as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('help').setDescription('Displays a guide listing all available commands.'),
        new SlashCommandBuilder().setName('afk').setDescription('Set your status to AFK.').addStringOption(opt => opt.setName('reason').setDescription('Why are you going away?')),
        new SlashCommandBuilder().setName('avatar').setDescription('Fetches a users profile image.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)),
        new SlashCommandBuilder().setName('userinfo').setDescription('Displays technical metadata regarding a user account.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)),
        new SlashCommandBuilder().setName('serverinfo').setDescription('Shows an analytical data snapshot of the current server.'),
        new SlashCommandBuilder().setName('status').setDescription('[OWNER ONLY] Dynamically update the bot\'s custom playing status.').addStringOption(opt => opt.setName('text').setDescription('The new status text for the bot').setRequired(true)),
        new SlashCommandBuilder().setName('autologs').setDescription('Automatically configures the No1Angel Logs category suite.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('history').setDescription('Displays a specified users session infractions.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('warn').setDescription('Officially warns a user for a rule violation.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('mute').setDescription('Temporarily places a member on timeout.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Duration of timeout in minutes').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for mute')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('unmute').setDescription('Removes an active timeout from a member early.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('warnclear').setDescription('Resets a users session infractions back to zero.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        new SlashCommandBuilder().setName('kick').setDescription('Disconnects a member from the guild server.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for kick')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
        new SlashCommandBuilder().setName('ban').setDescription('Permanently bans a user from the server guild.').addUserOption(opt => opt.setName('target').setDescription('Select user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason for ban')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        new SlashCommandBuilder().setName('unban').setDescription('Removes a user from the server ban list.').addStringOption(opt => opt.setName('userid').setDescription('Raw Discord String User ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        new SlashCommandBuilder().setName('purge').setDescription('Bulk-deletes a specified number of recent chat messages.').addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to clear (1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new SlashCommandBuilder().setName('lock').setDescription('Locks down the current channel, blocking members from typing.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        new SlashCommandBuilder().setName('unlock').setDescription('Restores messaging permissions back to a locked channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        new SlashCommandBuilder().setName('slowmode').setDescription('Sets a custom message cooldown delay on the current channel.').addIntegerOption(opt => opt.setName('seconds').setDescription('Cooldown in seconds (0 to turn off)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) {
        console.error("Error deployment layout:", err);
    }
});

// ----------------------------------------------------------------
// Interaction Engine Component & Command Routing Router
// ----------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const [prefix, action, targetId] = interaction.customId.split('_');
        if (prefix !== 'afk') return;

        if (action === 'notify') {
            if (interaction.user.id === targetId) {
                return interaction.reply({ content: '>>> ❌ **SYSTEM SECURITY FAULT:**\nYou cannot sign up for return alerts directed to yourself.', ephemeral: true });
            }
            if (!notifyQueue.has(targetId)) notifyQueue.set(targetId, new Set());
            notifyQueue.get(targetId).add(interaction.user.id);
            return interaction.reply({ content: '>>> 🔔 **CONNECTION LOCK REGISTERED!**\nI will send you a DM as soon as this user wakes up their messaging interface.', ephemeral: true });
        }

        if (action === 'message') {
            const modal = new ModalBuilder()
                .setCustomId(`afk_modal_${targetId}`)
                .setTitle('✉️ Relay Private Message');

            const textInput = new TextInputBuilder()
                .setCustomId('afk_text_input')
                .setLabel('Message Body')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type the content you want dispatched to their inbox...')
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            return await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        const [prefix, action, targetId] = interaction.customId.split('_');
        if (prefix === 'afk' && action === 'modal') {
            await interaction.deferReply({ ephemeral: true });
            const msgContent = interaction.fields.getTextInputValue('afk_text_input');
            
            try {
                const targetUser = await client.users.fetch(targetId);
                const dmEmbed = new EmbedBuilder()
                    .setTitle('📬 New Offline Message Left for You')
                    .setDescription(`>>> While you were marked away, **${interaction.user.tag}** left a message for you from channel **#${interaction.channel.name}**:\n\n💬 *"${msgContent}"*`)
                    .setColor(0x9B59B6)
                    .setTimestamp();
                
                await targetUser.send({ embeds: [dmEmbed] });
                return interaction.editReply({ content: '>>> ✅ **DISPATCH COMPLETED:**\nMessage delivered directly to their private inbox securely.' });
            } catch {
                return interaction.editReply({ content: '>>> ❌ **DISPATCH ERROR:**\nUnable to send direct message. The recipient might have locked DMs.' });
            }
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel, guild } = interaction;

    // --- /help ---
    if (commandName === 'help') {
        const out = `>>> ⚔️ **NO1ANGEL ARCHITECTURE PROTOCOLS & USER DIRECTORY**\n` +
            `Welcome to the core operations handbook. Commands must be initialized with a slash (\`/\`).\n\n` +
            `🌐 **GENERAL COMMANDS SYSTEM** (Public Utilities)\n` +
            `🔹 \`/help\` — Displays this structural operations system layout.\n` +
            `🔹 \`/afk [reason]\` — Temporarily toggles your away profile state (Clears automatically upon your next message entry).\n` +
            `🔹 \`/avatar <target>\` — Fetches a high-resolution canvas link to any chosen account icon.\n` +
            `🔹 \`/userinfo <target>\` — Queries metadata registries for account registration dates.\n` +
            `🔹 \`/serverinfo\` — Generates diagnostic analytics regarding active headcount populations.\n\n` +
            `🛡️ **ADMINISTRATIVE & MODERATION MATRIX** (Permissions Required)\n` +
            `🔸 \`/history <target>\` — Pulls data logs detailing current local session warnings.\n` +
            `🔸 \`/warn <target> <reason>\` — Registers a permanent warning strike flag to an identity databank.\n` +
            `🔸 \`/mute <target> <minutes> [reason]\` — Triggers a cryptographic network timeout restriction.\n` +
            `🔸 \`/unmute <target>\` — Clears active restriction states prior to schedule expiration clocks.\n` +
            `🔸 \`/warnclear <target>\` — Flushes local infraction arrays back to clean base parity.\n` +
            `🔸 \`/kick <target> [reason]\` — Forces an identity connection disconnect packet off the server guild.\n` +
            `🔸 \`/ban <target> [reason]\` — Purges access profiles and permanently blocks account handshakes.\n` +
            `🔸 \`/unban <userid>\` — Strips a specific user identifier string off the global ban registry.\n\n` +
            `🧹 **INFRASTRUCTURE MANAGEMENT LAYERS** (Staff Utilities)\n` +
            `🔹 \`/purge <amount>\` — Drops up to 100 historical message strings from local channel lines.\n` +
            `🔹 \`/lock\` — Freezes messaging write permissions on the immediate room coordinate.\n` +
            `🔹 \`/unlock\` — Synchronizes and re-establishes default message transmission rates.\n` +
            `🔹 \`/slowmode <seconds>\` — Throttles pipeline entry speeds by forcing write cooldown clocks.\n` +
            `🔹 \`/autologs\` — Automatically builds, assigns categories to, and deploys the entire logging suite.\n\n` +
            `📖 **OPERATIONS SYNTAX GUIDE**\n` +
            `• Angle parameters \`< parameter >\` imply **Strictly Mandatory Data Inputs**.\n` +
            `• Square parameters \`[ parameter ]\` mean the parameter can be **Safely Left Blank**.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        return interaction.reply({ content: out });
    }

    // --- /afk ---
    if (commandName === 'afk') {
        const reason = options.getString('reason') || 'Away from keyboard';
        afkUsers.set(interaction.user.id, { reason, timestamp: Date.now() });
        const out = `>>> 💤 **AFK ANNOUNCEMENT CONTAINER**\n` +
            `👤 **Member:** ${interaction.user}\n` +
            `📝 **Reason Matrix:** *"${reason}"*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        return interaction.reply({ content: out });
    }

    // --- /status ---
    if (commandName === 'status') {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '>>> ⛔ **ACCESS VIOLATION:**\nReserved configuration command blocked for non-owners.', ephemeral: true });
        }
        const text = options.getString('text');
        client.user.setActivity(text, { type: 0 });
        return interaction.reply({ content: `>>> ✅ **PRESENCE ENGINE UPDATE:**\nSystem status activity text set to **Playing ${text}**.` });
    }

    // --- /avatar ---
    if (commandName === 'avatar') {
        const target = options.getUser('target');
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ Profile Avatar: ${target.username}`)
            .setImage(target.displayAvatarURL({ size: 1024 }))
            .setColor(0x3498DB);
        return interaction.reply({ embeds: [embed] });
    }

    // --- /userinfo ---
    if (commandName === 'userinfo') {
        const target = options.getUser('target');
        const member = await guild.members.fetch(target.id).catch(() => null);
        const out = `>>> 👤 **IDENTITY RECONNAISSANCE MATRIX REPORT**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔹 **Target Account:** ${target} (\`${target.tag}\`)\n` +
            `🔹 **User Registration Unique ID:** \`${target.id}\`\n` +
            `📆 **Discord Profiling Inception:** <t:${Math.floor(target.createdTimestamp / 1000)}:F> (<t:${Math.floor(target.createdTimestamp / 1000)}:R>)\n` +
            `📥 **Guild Server Deployment Date:** ${member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '`Not present in guild data`'}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        return interaction.reply({ content: out });
    }

    // --- /serverinfo ---
    if (commandName === 'serverinfo') {
        const out = `>>> 📊 **GUILD SERVER INFRASTRUCTURE PROFILE ANALYTICS**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔹 **Guild Server Identity:** \`${guild.name}\`\n` +
            `🔹 **Internal Databank Target ID:** \`${guild.id}\`\n` +
            `👥 **Total Synced Population Headcount:** \`${guild.memberCount}\` Registered Accounts\n` +
            `📆 **System Deployment Genesis Date:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        return interaction.reply({ content: out });
    }

    // --- /autologs ---
    if (commandName === 'autologs') {
        await interaction.deferReply();
        try {
            let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'No1Angel Logs');
            if (!category) {
                category = await guild.channels.create({
                    name: 'No1Angel Logs',
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
                    ]
                });
            }

            const targetChannels = [
                'no1angel-message-logs', 'no1angel-member-logs', 'no1angel-server-logs',
                'no1angel-voice-logs', 'no1angel-channel-logs', 'no1angel-role-logs', 'no1angel-mod-logs'
            ];

            for (const name of targetChannels) {
                const check = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name && c.parentId === category.id);
                if (!check) {
                    await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id });
                }
            }

            const out = `>>> ⚙️ **SUITE AUTOMATION ARCHITECTURE SETUP COMPLETE**\n` +
                `The complete **No1Angel Logs** structural core and nested data feeds have been deployment-verified.`;
            return interaction.editReply({ content: out });
        } catch (err) {
            return interaction.editReply({ content: `>>> ⚠️ **AUTOMATION SETUP ABORT EXCEPTION:**\n${err.message}` });
        }
    }

    // --- /history ---
    if (commandName === 'history') {
        const target = options.getUser('target');
        const count = infractions.get(target.id) || 0;
        const out = `>>> 📊 **INFRACTION MANAGEMENT REGISTRY SUMMARY**\n` +
            `👤 **Target Account:** ${target}\n` +
            `🔢 **Active Session Violation Count:** \`${count}\` Incident Flags.`;
        return interaction.reply({ content: out });
    }

    async function logModAction(title, color, description) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(description)
            .setTimestamp();
        await dispatchLog(guild, 'no1angel-mod-logs', embed);
    }

    // --- /warn ---
    if (commandName === 'warn') {
        const target = options.getUser('target');
        const reason = options.getString('reason');
        const count = (infractions.get(target.id) || 0) + 1;
        infractions.set(target.id, count);

        const out = `>>> ⚠️ **SECURITY MATRIX WARNING LOG ACTION**\n` +
            `👤 **Sanctioned User:** ${target}\n` +
            `📝 **Reason Logged:** \`${reason}\`\n` +
            `🔢 **Active Session Tracker Threshold:** \`${count}\` Flags Issued.`;
        await interaction.reply({ content: out });
        return logModAction('🔨 Incident Logged: Warning Issued', 0xFEE75C, `>>> **Target:** ${target}\n**Moderator:** ${interaction.user}\n**Reason Given:** ${reason}\n**Total Tracker:** \`${count}\``);
    }

    // --- /mute ---
    if (commandName === 'mute') {
        const targetUser = options.getUser('target');
        const minutes = options.getInteger('minutes');
        const reason = options.getString('reason') || 'No explicit tracking reason specified.';
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '>>> ❌ **TARGET VERIFICATION FAULT:** Profile database parsing error.', ephemeral: true });
        await member.timeout(minutes * 60 * 1000, reason);

        const out = `>>> 🔇 **TIMEOUT RESTRICTION CONTAINER CONFIGURED**\n` +
            `👤 **Target Restricted User:** \`${targetUser.username}\` (${targetUser})\n` +
            `⏳ **Duration Window Assigned:** \`${minutes}\` Minutes\n` +
            `📝 **Reason Node:** \`${reason}\``;
        await interaction.reply({ content: out });
        return logModAction('🔇 Incident Logged: Timeout Applied', 0xED4245, `>>> **Target Member:** ${targetUser}\n**Action Taken By:** ${interaction.user}\n**Duration Assigned:** ${minutes} min\n**Reason:** ${reason}`);
    }

    // --- /unmute ---
    if (commandName === 'unmute') {
        const targetUser = options.getUser('target');
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '>>> ❌ **TARGET VERIFICATION FAULT:** Profile database parsing error.', ephemeral: true });
        await member.timeout(null);

        const out = `>>> 🔊 **RESTRICTION OVERRIDE: TIMEOUT STRIPPED EARLY**\n` +
            `👤 **Target Restored User:** \`${targetUser.username}\` has been re-allocated text communication capabilities.`;
        await interaction.reply({ content: out });
        return logModAction('🔊 Incident Logged: Timeout Lifted', 0x57F287, `>>> **Target Member:** ${targetUser}\n**Action Taken By:** ${interaction.user}`);
    }

    // --- /warnclear ---
    if (commandName === 'warnclear') {
        const target = options.getUser('target');
        infractions.set(target.id, 0);
        const out = `>>> 🔄 **INCIDENT TRACKER FILE PURGED RE-INDEX**\n` +
            `👤 **Target Account:** \`${target.username}\` has had all active temporary session points set back to zero.`;
        await interaction.reply({ content: out });
        return logModAction('🔄 History Cleared', 0x3498DB, `>>> **Target Member:** ${target}\n**Action Taken By:** ${interaction.user}`);
    }

    // --- /kick ---
    if (commandName === 'kick') {
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'No explicit context parsed.';
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '>>> ❌ **TARGET VERIFICATION FAULT:** Profile database parsing error.', ephemeral: true });
        await member.kick(reason);

        const out = `>>> 👢 **SERVER ENVIRONMENT FORCEFUL DISCONNECT DISPATCHED**\n` +
            `👤 **Expelled User Profile:** \`${targetUser.username}\` (${targetUser})\n` +
            `📝 **Reason Context Node:** \`${reason}\``;
        await interaction.reply({ content: out });
        return logModAction('👢 Incident Logged: Kick Executed', 0xE67E22, `>>> **Target Member:** ${targetUser.tag}\n**Action Taken By:** ${interaction.user}\n**Reason:** ${reason}`);
    }

    // --- /ban ---
    if (commandName === 'ban') {
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'No explicit context parsed.';

        await guild.members.ban(targetUser.id, { reason });
        const out = `>>> 🔨 **PERMANENT GUILD INTERFACES EXCLUSION BAN BANISHED**\n` +
            `👤 **Banned Core Identity:** \`${targetUser.username}\` (${targetUser})\n` +
            `📝 **Reason Context Node:** \`${reason}\``;
        await interaction.reply({ content: out });
        return logModAction('🔨 Incident Logged: Ban Executed', 0xED4245, `>>> **Target User:** ${targetUser.tag} (\`${targetUser.id}\`)\n**Action Taken By:** ${interaction.user}\n**Reason:** ${reason}`);
    }

    // --- /unban ---
    if (commandName === 'unban') {
        const userId = options.getString('userid');
        try {
            await guild.members.unban(userId);
            const out = `>>> 🔓 **RESTRICTION OVERRIDE: ID MANUALLY REVOKED FROM BANLIST**\n` +
                `👤 **Identity ID Hash:** \`${userId}\` configuration cleared back into user entry pool.`;
            await interaction.reply({ content: out });
            return logModAction('🔓 Incident Logged: Unban Executed', 0x57F287, `>>> **Target ID Signature:** \`${userId}\`\n**Action Taken By:** ${interaction.user}`);
        } catch {
            return interaction.reply({ content: '>>> ❌ **UNBAN PIPELINE FAULT:** ID input string mismatch, or matching hash was not present on data ban arrays.', ephemeral: true });
        }
    }

    // --- /purge ---
    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '>>> ❌ **BOUND EVALUATION FAULT:** Stream count boundaries must sit between 1 and 100 indices.', ephemeral: true });

        const deleted = await channel.bulkDelete(amount, true).catch(() => []);
        const out = `>>> 🧹 **BULK CHAT SEGMENT DEPLETION CLEANED**\n` +
            `Dropped \`${deleted.size}\` historical message traces completely from current memory pipelines.`;
        await interaction.reply({ content: out, ephemeral: true });
        return logModAction('🧹 Messages Purged', 0x3498DB, `>>> **Channel Target:** ${channel}\n**Action Taken By:** ${interaction.user}\n**Cleaned Lines:** \`${deleted.size}\``);
    }

    // --- /lock ---
    if (commandName === 'lock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        const out = `>>> 🔒 **EMERGENCY CONTAINER: CHANNEL FLOW DISPATCH CRIPPLED**\n` +
            `Public messaging pathways have been sealed on this specific endpoint coordinate.`;
        await interaction.reply({ content: out });
        return logModAction('🔒 Channel Locked', 0xED4245, `>>> **Channel Locked:** ${channel}\n**Action Taken By:** ${interaction.user}`);
    }

    // --- /unlock ---
    if (commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        const out = `>>> 🔓 **EMERGENCY RESOLVED: CHANNEL ACCESS RETURNED TO PARITY**\n` +
            `Public default typing protocols have been safely synchronized and re-activated.`;
        await interaction.reply({ content: out });
        return logModAction('🔓 Channel Unlocked', 0x57F287, `>>> **Channel Opened:** ${channel}\n**Action Taken By:** ${interaction.user}`);
    }

    // --- /slowmode ---
    if (commandName === 'slowmode') {
        const seconds = options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        const out = `>>> ⏳ **COOLDOWN SYSTEM INTERVAL RESTATED**\n` +
            `Users must pause exactly \`${seconds}\` seconds between transmission packets in this room coordinate.`;
        await interaction.reply({ content: out });
        return logModAction('⏳ Slowmode Cooldown Updated', 0xFEE75C, `>>> **Channel:** ${channel}\n**Action Taken By:** ${interaction.user}\n**Delay Threshold:** \`${seconds}\` seconds`);
    }
});

if (!TOKEN) {
    console.error("CRITICAL RUNTIME EXCEPTION: DISCORD_TOKEN configuration missing.");
} else {
    client.login(TOKEN);
}

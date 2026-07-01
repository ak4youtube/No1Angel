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

// Stateful Runtime Memory Maps
const afkUsers = new Map();       // userID -> { reason: string, timestamp: number }
const notifyQueue = new Map();     // afkUserID -> Set(userIDs to notify)
const infractions = new Map();    // userID -> warningCount (int)

// Helper function to dynamically locate logged target channels inside No1Angel Logs category
async function getLogChannel(guild, channelName) {
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'No1Angel Logs');
    if (!category) return null;
    return guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === channelName && c.parentId === category.id);
}

// Helper function to drop logs safely into the system
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

    // --- Return State: Clear AFK ---
    if (afkUsers.has(authorId)) {
        afkUsers.delete(authorId);
        
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🟢 Welcome Back!')
            .setDescription(`Welcome back ${message.author}, your AFK status has been cleared.`)
            .setColor(0x57F287)
            .setTimestamp();
            
        const reply = await message.channel.send({ embeds: [welcomeEmbed] });
        setTimeout(() => reply.delete().catch(() => {}), 8000);

        // Process Notification Queue
        if (notifyQueue.has(authorId)) {
            const usersToNotify = notifyQueue.get(authorId);
            usersToNotify.forEach(async (id) => {
                try {
                    const user = await client.users.fetch(id);
                    const alertEmbed = new EmbedBuilder()
                        .setTitle('🟢 User Return Notification')
                        .setDescription(`**${message.author.username}** has returned and is active in **${message.guild.name}**.`)
                        .setColor(0x57F287)
                        .setTimestamp();
                    await user.send({ embeds: [alertEmbed] });
                } catch {}
            });
            notifyQueue.delete(authorId);
        }
    }

    // --- Interception State: Tagging an AFK User ---
    if (message.mentions.users.size > 0) {
        for (const [id, user] of message.mentions.users) {
            if (afkUsers.has(id)) {
                const details = afkUsers.get(id);
                
                const afkEmbed = new EmbedBuilder()
                    .setTitle('📌 User is Currently Away')
                    .setDescription(`**${user.username}** is currently AFK:\n👉 *${details.reason}*\n\nChoose an action below to connect with them:`)
                    .setColor(0x3498DB)
                    .setFooter({ text: 'No1Angel Interaction Hub' });

                // Interactive Buttons
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
// Multi-Stream Audit Logger Events
// ----------------------------------------------------------------

// Message Deletion Log
client.on('messageDelete', async (message) => {
    if (message.partial || !message.guild || message.author?.bot) return;
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Message Deleted')
        .setColor(0xED4245)
        .addFields(
            { name: 'Author', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
            { name: 'Channel', value: `${message.channel}`, inline: true },
            { name: 'Content', value: message.content || '_No readable text content_' }
        )
        .setTimestamp();
    await dispatchLog(message.guild, 'no1angel-message-logs', embed);
});

// Message Modification Log
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.partial || !oldMessage.guild || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 Message Edited')
        .setColor(0xFEE75C)
        .addFields(
            { name: 'Author', value: `${oldMessage.author} (\`${oldMessage.author.id}\`)`, inline: true },
            { name: 'Channel', value: `${oldMessage.channel}`, inline: true },
            { name: 'Before', value: oldMessage.content || '_None_' },
            { name: 'After', value: newMessage.content || '_None_' }
        )
        .setTimestamp();
    await dispatchLog(oldMessage.guild, 'no1angel-message-logs', embed);
});

// Member Joining Log
client.on('guildMemberAdd', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('📥 Member Joined')
        .setColor(0x57F287)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'User', value: `${member.user.tag} (${member})`, inline: true },
            { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setTimestamp();
    await dispatchLog(member.guild, 'no1angel-member-logs', embed);
});

// Member Leaving Log
client.on('guildMemberRemove', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('📤 Member Left')
        .setColor(0xED4245)
        .addFields(
            { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true }
        )
        .setTimestamp();
    await dispatchLog(member.guild, 'no1angel-member-logs', embed);
});

// Voice State Log
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = oldState.guild;
    const member = oldState.member;
    let embed = new EmbedBuilder().setTimestamp().setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() });

    if (!oldState.channelId && newState.channelId) {
        embed.setTitle('🔊 Voice Joined').setColor(0x57F287).setDescription(`${member} connected to ${newState.channel}`);
    } else if (oldState.channelId && !newState.channelId) {
        embed.setTitle('🔇 Voice Left').setColor(0xED4245).setDescription(`${member} disconnected from ${oldState.channel}`);
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        embed.setTitle('🔀 Voice Switch').setColor(0x3498DB).setDescription(`${member} moved from ${oldState.channel} to ${newState.channel}`);
    } else {
        return; // Filter out local mute/deafens
    }
    await dispatchLog(guild, 'no1angel-voice-logs', embed);
});

// Channel Tracking Log
client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setTitle('🆕 Channel Created')
        .setColor(0x57F287)
        .setDescription(`Channel ${channel} (\`${channel.id}\`) of type **${channel.type}** was spawned.`)
        .setTimestamp();
    await dispatchLog(channel.guild, 'no1angel-channel-logs', embed);
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setTitle('❌ Channel Deleted')
        .setColor(0xED4245)
        .setDescription(`Channel **#${channel.name}** (\`${channel.id}\`) was removed from the server.`)
        .setTimestamp();
    await dispatchLog(channel.guild, 'no1angel-channel-logs', embed);
});

// Role State Log
client.on('roleCreate', async (role) => {
    const embed = new EmbedBuilder()
        .setTitle('🟢 Role Created')
        .setColor(0x57F287)
        .setDescription(`Role **${role.name}** (\`${role.id}\`) created.`)
        .setTimestamp();
    await dispatchLog(role.guild, 'no1angel-role-logs', embed);
});

client.on('roleDelete', async (role) => {
    const embed = new EmbedBuilder()
        .setTitle('🔴 Role Deleted')
        .setColor(0xED4245)
        .setDescription(`Role **${role.name}** (\`${role.id}\`) was deleted.`)
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
        
        // Automated Category Matrix Generator
        new SlashCommandBuilder().setName('autologs').setDescription('Automatically configures the No1Angel Logs category suite.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        // Manual Moderation Core
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
    
    // --- Context Routing Component: Interactive Buttons & Modals ---
    if (interaction.isButton()) {
        const [prefix, action, targetId] = interaction.customId.split('_');
        if (prefix !== 'afk') return;

        if (action === 'notify') {
            if (interaction.user.id === targetId) {
                return interaction.reply({ content: '❌ You cannot sign up for your own return alerts.', ephemeral: true });
            }
            if (!notifyQueue.has(targetId)) notifyQueue.set(targetId, new Set());
            notifyQueue.get(targetId).add(interaction.user.id);
            return interaction.reply({ content: '🔔 Connection Lock Registered! I will private message you when they send a message.', ephemeral: true });
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
                    .setDescription(`While you were marked away, **${interaction.user.tag}** left a message for you from channel **#${interaction.channel.name}**:`)
                    .addFields({ name: 'Message Content', value: `"${msgContent}"` })
                    .setColor(0x9B59B6)
                    .setTimestamp();
                
                await targetUser.send({ embeds: [dmEmbed] });
                return interaction.editReply({ content: '✅ Message delivered directly to their private inbox.' });
            } catch {
                return interaction.editReply({ content: '❌ Unable to send a direct message. The target user might have their private messages disabled.' });
            }
        }
    }

    // --- Slash Command Router Execution ---
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel, guild } = interaction;

    // --- /help ---
    if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📚 Mod Bot Command Matrix Directory')
            .setColor(0x3498DB)
            .addFields(
                { name: '🌐 General Utilities', value: '`/help`, `/afk`, `/avatar`, `/userinfo`, `/serverinfo`', inline: false },
                { name: '🛡️ Moderation Desk', value: '`/history`, `/warn`, `/mute`, `/unmute`, `/warnclear`, `/kick`, `/ban`, `/unban`', inline: false },
                { name: '🧹 Management & Category Setup', value: '`/purge`, `/lock`, `/unlock`, `/slowmode`, `/autologs`', inline: false },
                { name: '⚙️ Owner Only', value: '`/status`', inline: false }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // --- /afk ---
    if (commandName === 'afk') {
        const reason = options.getString('reason') || 'Away from keyboard';
        afkUsers.set(interaction.user.id, { reason, timestamp: Date.now() });
        const embed = new EmbedBuilder()
            .setDescription(`💤 ${interaction.user} is now marked **AFK**: *${reason}*`)
            .setColor(0x3498DB);
        return interaction.reply({ embeds: [embed] });
    }

    // --- /status [OWNER ONLY] ---
    if (commandName === 'status') {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '⛔ Security Fault: Reserved for deployment bot owner.', ephemeral: true });
        }
        const text = options.getString('text');
        client.user.setActivity(text, { type: 0 });
        return interaction.reply({ content: `✅ Presence updated to: **Playing ${text}**` });
    }

    // --- /avatar ---
    if (commandName === 'avatar') {
        const target = options.getUser('target');
        const embed = new EmbedBuilder().setTitle(`${target.username}'s Avatar`).setImage(target.displayAvatarURL({ size: 1024 })).setColor(0x3498DB);
        return interaction.reply({ embeds: [embed] });
    }

    // --- /userinfo ---
    if (commandName === 'userinfo') {
        const target = options.getUser('target');
        const member = await guild.members.fetch(target.id).catch(() => null);
        const embed = new EmbedBuilder().setTitle(`👤 User Details: ${target.username}`).setColor(0x9B59B6)
            .addFields(
                { name: 'User ID', value: `\`${target.id}\``, inline: true },
                { name: 'Created Profile', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Server Joined', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Not in server', inline: true }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // --- /serverinfo ---
    if (commandName === 'serverinfo') {
        const embed = new EmbedBuilder().setTitle(`📊 Server Profile: ${guild.name}`).setColor(0xE67E22)
            .addFields(
                { name: 'Total Accounts', value: `\`${guild.memberCount}\``, inline: true },
                { name: 'Created Date', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
            );
        return interaction.reply({ embeds: [embed] });
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

            const cleanSuccess = new EmbedBuilder().setTitle('⚙️ Suite Deployment Completed').setDescription('The **No1Angel Logs** framework has been successfully generated and secured. All logging operations are now routing updates.').setColor(0x57F287);
            return interaction.editReply({ embeds: [cleanSuccess] });
        } catch (err) {
            return interaction.editReply({ content: `⚠️ Deployment Failed: ${err.message}` });
        }
    }

    // --- /history ---
    if (commandName === 'history') {
        const target = options.getUser('target');
        const count = infractions.get(target.id) || 0;
        const embed = new EmbedBuilder().setDescription(`📊 **${target.username}** has accrued \`${count}\` manual session warnings.`).setColor(0x3498DB);
        return interaction.reply({ embeds: [embed] });
    }

    // --- Manual Command Log Dispatch Helper ---
    async function logModAction(title, color, description) {
        const embed = new EmbedBuilder().setTitle(title).setColor(color).setDescription(description).setTimestamp();
        await dispatchLog(guild, 'no1angel-mod-logs', embed);
    }

    // --- /warn ---
    if (commandName === 'warn') {
        const target = options.getUser('target');
        const reason = options.getString('reason');
        const count = (infractions.get(target.id) || 0) + 1;
        infractions.set(target.id, count);

        const embed = new EmbedBuilder().setDescription(`⚠️ ${target} has been warned for: **${reason}** (Total Session Count: \`${count}\`)`).setColor(0xFEE75C);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔨 Incident Logged: Warning Issued', 0xFEE75C, `**Target:** ${target}\n**Moderator:** ${interaction.user}\n**Reason:** ${reason}\n**Session Warnings:** ${count}`);
    }

    // --- /mute ---
    if (commandName === 'mute') {
        const targetUser = options.getUser('target');
        const minutes = options.getInteger('minutes');
        const reason = options.getString('reason') || 'No explicit tracking reason specified.';
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '❌ Target profile missing.', ephemeral: true });
        await member.timeout(minutes * 60 * 1000, reason);

        const embed = new EmbedBuilder().setDescription(`🔇 **${targetUser.username}** has been placed on timeout for ${minutes} minutes.`).setColor(0xED4245);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔇 Incident Logged: Timeout Applied', 0xED4245, `**Target:** ${targetUser}\n**Moderator:** ${interaction.user}\n**Duration:** ${minutes} minutes\n**Reason:** ${reason}`);
    }

    // --- /unmute ---
    if (commandName === 'unmute') {
        const targetUser = options.getUser('target');
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '❌ Target profile missing.', ephemeral: true });
        await member.timeout(null);

        const embed = new EmbedBuilder().setDescription(`🔊 Active timeout lifted early from **${targetUser.username}**.`).setColor(0x57F287);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔊 Incident Logged: Timeout Lifted', 0x57F287, `**Target:** ${targetUser}\n**Moderator:** ${interaction.user}`);
    }

    // --- /warnclear ---
    if (commandName === 'warnclear') {
        const target = options.getUser('target');
        infractions.set(target.id, 0);
        const embed = new EmbedBuilder().setDescription(`🔄 Purged session infraction counter back to zero for **${target.username}**.`).setColor(0x57F287);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔄 History Cleared', 0x3498DB, `**Target:** ${target}\n**Moderator:** ${interaction.user}`);
    }

    // --- /kick ---
    if (commandName === 'kick') {
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'No explicit context parsed.';
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '❌ Target profile missing.', ephemeral: true });
        await member.kick(reason);

        const embed = new EmbedBuilder().setDescription(`👢 **${targetUser.username}** has been disconnected from the server environment.`).setColor(0xE67E22);
        await interaction.reply({ embeds: [embed] });
        return logModAction('👢 Incident Logged: Kick Executed', 0xE67E22, `**Target:** ${targetUser.tag}\n**Moderator:** ${interaction.user}\n**Reason:** ${reason}`);
    }

    // --- /ban ---
    if (commandName === 'ban') {
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'No explicit context parsed.';

        await guild.members.ban(targetUser.id, { reason });
        const embed = new EmbedBuilder().setDescription(`🔨 **${targetUser.username}** has been permanently banned from the server.`).setColor(0xED4245);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔨 Incident Logged: Ban Executed', 0xED4245, `**Target:** ${targetUser.tag} (\`${targetUser.id}\`)\n**Moderator:** ${interaction.user}\n**Reason:** ${reason}`);
    }

    // --- /unban ---
    if (commandName === 'unban') {
        const userId = options.getString('userid');
        try {
            await guild.members.unban(userId);
            const embed = new EmbedBuilder().setDescription(`🔓 Lifted server restriction from identity ID: \`${userId}\`.`).setColor(0x57F287);
            await interaction.reply({ embeds: [embed] });
            return logModAction('🔓 Incident Logged: Unban Executed', 0x57F287, `**Target ID:** \`${userId}\`\n**Moderator:** ${interaction.user}`);
        } catch {
            return interaction.reply({ content: '❌ Identity signature mismatch or ID was never banned.', ephemeral: true });
        }
    }

    // --- /purge ---
    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '❌ Provide bounds between 1 and 100 entries.', ephemeral: true });

        const deleted = await channel.bulkDelete(amount, true).catch(() => []);
        const embed = new EmbedBuilder().setDescription(`🧹 Successfully dropped \`${deleted.size}\` chat messages cleanly.`).setColor(0x57F287);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return logModAction('🧹 Messages Purged', 0x3498DB, `**Channel:** ${channel}\n**Moderator:** ${interaction.user}\n**Messages Deleted:** ${deleted.size}`);
    }

    // --- /lock ---
    if (commandName === 'lock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        const embed = new EmbedBuilder().setDescription('🔒 **Channel Closed:** Message stream restricted for normal accounts.').setColor(0xED4245);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔒 Channel Locked', 0xED4245, `**Channel:** ${channel}\n**Moderator:** ${interaction.user}`);
    }

    // --- /unlock ---
    if (commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        const embed = new EmbedBuilder().setDescription('🔓 **Channel Reopened:** Message streams reset back to default.').setColor(0x57F287);
        await interaction.reply({ embeds: [embed] });
        return logModAction('🔓 Channel Unlocked', 0x57F287, `**Channel:** ${channel}\n**Moderator:** ${interaction.user}`);
    }

    // --- /slowmode ---
    if (commandName === 'slowmode') {
        const seconds = options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        const embed = new EmbedBuilder().setDescription(`⏳ Channel slowmode limit updated to **${seconds}** seconds.`).setColor(0xFEE75C);
        await interaction.reply({ embeds: [embed] });
        return logModAction('⏳ Slowmode Cooldown Updated', 0xFEE75C, `**Channel:** ${channel}\n**Moderator:** ${interaction.user}\n**Delay Set:** ${seconds} seconds`);
    }
});

if (!TOKEN) {
    console.error("CRITICAL RUNTIME EXCEPTION: DISCORD_TOKEN configuration missing.");
} else {
    client.login(TOKEN);
}

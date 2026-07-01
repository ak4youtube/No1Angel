const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ChannelType, 
    ComponentType, 
    TextInputStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    ActionRowBuilder 
} = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// Helper functions to manage local configuration database state
const getConfig = () => JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const saveConfig = (config) => fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

// Global UI Helper: Renders all system messages in pristine Component V2 layout structures
const sendComponentV2Reply = async (interaction, title, content, isEphemeral = true, color = 5793266) => {
    const payload = {
        flags: isEphemeral ? 64 : undefined,
        components: [
            {
                type: 17, // Modern Container Layout component
                accent_color: color,
                components: [
                    { type: 10, content: `### ${title}` },
                    { type: 14, divider: true, spacing: 1 },
                    { type: 10, content: content }
                ]
            }
        ]
    };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
    } else {
        await interaction.reply(payload);
    }
};

// Log Dispatcher: Formats server telemetry directly into beautiful target containers
const dispatchLog = async (guild, logType, title, content, color) => {
    const config = getConfig();
    const channelId = config.channels?.[logType];
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    await channel.send({
        components: [
            {
                type: 17,
                accent_color: color,
                components: [
                    { type: 10, content: `### ${title}` },
                    { type: 14, divider: true, spacing: 1 },
                    { type: 10, content: content }
                ]
            }
        ]
    });
};

client.once('ready', async () => {
    console.log(`📡 System Core Active // Logged in as ${client.user.tag}`);
    
    // Register Application Deployment Commands with native role permission filters
    const commands = [
        new SlashCommandBuilder()
            .setName('autologs')
            .setDescription('Automatically deploys and routes the No1Angel Logs infrastructure matrix.')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        
        new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Sets your terminal state to away.')
            .addStringOption(opt => opt.setName('status').setDescription('Custom status message to leave behind.').setRequired(false))
    ];

    await client.application.commands.set(commands);
});

/* ==========================================================
   💾 COMMAND HANDLING DISPATCHERS
   ========================================================== */
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const config = getConfig();

    if (interaction.commandName === 'autologs') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Instantiate Category Container
            const category = await interaction.guild.channels.create({
                name: 'No1Angel Logs',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] } // Keep hidden globally
                ]
            });

            const channelsToCreate = [
                { key: 'message', name: 'no1angel-message-logs' },
                { key: 'member', name: 'no1angel-member-logs' },
                { key: 'server', name: 'no1angel-server-logs' },
                { key: 'voice', name: 'no1angel-voice-logs' },
                { key: 'channel', name: 'no1angel-channel-logs' },
                { key: 'role', name: 'no1angel-role-logs' },
                { key: 'mod', name: 'no1angel-mod-logs' }
            ];

            config.channels = config.channels || {};
            config.logsCategory = category.id;

            for (const target of channelsToCreate) {
                const createdChan = await interaction.guild.channels.create({
                    name: target.name,
                    type: ChannelType.GuildText,
                    parent: category.id
                });
                config.channels[target.key] = createdChan.id;
            }

            saveConfig(config);
            await sendComponentV2Reply(interaction, '✅ Core Blueprint Implemented', 'The `No1Angel Logs` category cluster and all seven monitoring streams have been safely built and routed.', true, 5793266);
        } catch (err) {
            await sendComponentV2Reply(interaction, '❌ Initialization Failure', `An error occurred compiling the channel configurations:\n\`\`\`${err.message}\`\`\``, true, 15548997);
        }
    }

    if (interaction.commandName === 'afk') {
        const status = interaction.options.getString('status') || 'Away from terminal.';
        config.afk = config.afk || {};
        
        config.afk[interaction.user.id] = {
            status: status,
            timestamp: Math.floor(Date.now() / 1000),
            notifications: [],
            messages: []
        };
        
        saveConfig(config);
        await sendComponentV2Reply(interaction, '💤 AFK Matrix Engaged', `Your profile is marked away. Status: *"${status}"*`, false, 3447003);
    }
});

/* ==========================================================
   🛏️ INTERACTIVE BUTTONS & MODALS (AFK LOGIC CORE)
   ========================================================== */
client.on('interactionCreate', async (interaction) => {
    const config = getConfig();

    if (interaction.isButton()) {
        const [action, targetUserId] = interaction.customId.split('_');
        if (action !== 'afk') return;

        // Prevent users from queueing automated alerts or messages onto themselves
        if (interaction.user.id === targetUserId) {
            return await interaction.reply({ content: 'You cannot execute interactions against your own profile status loop.', ephemeral: true });
        }

        if (interaction.customId.startsWith('afk_leave_msg')) {
            const modal = new ModalBuilder()
                .setCustomId(`afk_modal_${targetUserId}`)
                .setTitle('Leave a Message');

            const textInput = new TextInputBuilder()
                .setCustomId('message_content')
                .setLabel('Your Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type the details you want to send directly to their inbox...')
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            await interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('afk_notify_return')) {
            if (!config.afk[targetUserId]) {
                return await interaction.reply({ content: 'This user is no longer away.', ephemeral: true });
            }

            if (config.afk[targetUserId].notifications.includes(interaction.user.id)) {
                return await interaction.reply({ content: 'You are already registered to receive a notification upon their return.', ephemeral: true });
            }

            config.afk[targetUserId].notifications.push(interaction.user.id);
            saveConfig(config);

            await interaction.reply({ content: '🔔 Connection monitored. You will receive a direct message when they clear their AFK matrix.', ephemeral: true });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('afk_modal_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const messageContent = interaction.fields.getTextInputValue('message_content');

            if (!config.afk[targetUserId]) {
                return await interaction.reply({ content: 'This user returned while you were filling out the form.', ephemeral: true });
            }

            // Route data securely into local storage array
            config.afk[targetUserId].messages.push({ sender: interaction.user.id, content: messageContent });
            saveConfig(config);

            // Flash the direct payload out to the away user's mailbox instantly
            const targetUser = await client.users.fetch(targetUserId).catch(() => null);
            if (targetUser) {
                await targetUser.send({
                    components: [
                        {
                            type: 17,
                            accent_color: 3447003,
                            components: [
                                { type: 10, content: `### 📩 Incoming Memo Received` },
                                { type: 14, divider: true, spacing: 1 },
                                { type: 10, content: `**Sender:** <@${interaction.user.id}>\n\n**Message Content:**\n> ${messageContent}` }
                            ]
                        }
                    ]
                }).catch(() => null);
            }

            await interaction.reply({ content: '✅ Message transmitted and cached securely for their return review.', ephemeral: true });
        }
    }
});

/* ==========================================================
   🚨 CHAT MATRIX INTERCEPTOR (PING DEFLECTION & RETURN TRACING)
   ========================================================== */
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const config = getConfig();

    // 1. CLEAR AFK STATUS ON CHAT DETECT
    if (config.afk?.[message.author.id]) {
        const data = config.afk[message.author.id];
        delete config.afk[message.author.id];
        saveConfig(config);

        // Frame the return notification message beautifully
        await message.channel.send({
            components: [
                {
                    type: 17,
                    accent_color: 5793266,
                    components: [
                        { type: 10, content: `### 👋 Welcome Back // Terminal Restored` },
                        { type: 14, divider: true, spacing: 1 },
                        { type: 10, content: `<@${message.author.id}> has returned to the keyboard and cleared their away parameters.` }
                    ]
                }
            ]
        });

        // Loop through the registration arrays and beam out private notifications
        for (const notifierId of data.notifications) {
            const user = await client.users.fetch(notifierId).catch(() => null);
            if (user) {
                await user.send({
                    components: [
                        {
                            type: 17,
                            accent_color: 5793266,
                            components: [
                                { type: 10, content: `### 🔔 Return Notification Link` },
                                { type: 14, divider: true, spacing: 1 },
                                { type: 10, content: `<@${message.author.id}> is now active on the network.` }
                            ]
                        }
                    ]
                }).catch(() => null);
            }
        }
    }

    // 2. DEFLECT PINGS TARGETING OUT-OF-OFFICE USERS
    if (message.mentions.users.size > 0) {
        for (const [id, user] of message.mentions.users) {
            if (config.afk?.[id]) {
                const data = config.afk[id];
                await message.reply({
                    components: [
                        {
                            type: 17,
                            accent_color: 3447003,
                            components: [
                                { type: 10, content: `### 💤 User Currently Away` },
                                { type: 14, divider: true, spacing: 1 },
                                { type: 10, content: `<@${id}> went AFK <t:${data.timestamp}:R>.\n\n**Status left:**\n> *"${data.status}"*` }
                            ]
                        },
                        {
                            type: 1,
                            components: [
                                { type: 2, style: 2, label: 'Leave a Message', custom_id: `afk_leave_msg_${id}`, emoji: { name: '📩' } },
                                { type: 2, style: 2, label: 'Notify When Back', custom_id: `afk_notify_return_${id}`, emoji: { name: '🔔' } }
                            ]
                        }
                    ]
                });
            }
        }
    }
});

/* ==========================================================
   📡 SERVER MONITORING LOOPS (NO1ANGEL TELEMETRY PORTS)
   ========================================================== */

// --- MESSAGE LOGS ---
client.on('messageDelete', async (message) => {
    if (message.author?.bot || !message.guild) return;
    await dispatchLog(
        message.guild, 'message', '🗑️ Message Erased from History',
        `**Author:** <@${message.author.id}> (\`${message.author.id}\`)\n**Channel:** <#${message.channel.id}>\n\n**Content Payload:**\n\`\`\`${message.content || '[No Text Content / Dynamic Layout Data Found]'}\`\`\``,
        15548997
    );
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (oldMsg.author?.bot || !oldMsg.guild || oldMsg.content === newMsg.content) return;
    await dispatchLog(
        oldMsg.guild, 'message', '📝 Content Payload Altered',
        `**Author:** <@${oldMsg.author.id}>\n**Channel:** <#${oldMsg.channel.id}>\n\n**Original:**\n\`\`\`${oldMsg.content}\`\`\`\n**Revised:**\n\`\`\`${newMsg.content}\`\`\``,
        3447003
    );
});

// --- MEMBER LOGS ---
client.on('guildMemberAdd', async (member) => {
    await dispatchLog(
        member.guild, 'member', '📥 Account Entry Registered',
        `**User:** <@${member.user.id}> (\`${member.user.id}\`)\n**Tag:** \`${member.user.tag}\`\n**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
        5793266
    );
});

client.on('guildMemberRemove', async (member) => {
    await dispatchLog(
        member.guild, 'member', '📤 Account Departure Logged',
        `**User:** <@${member.user.id}> (\`${member.user.id}\`)\n**Tag:** \`${member.user.tag}\``,
        15548997
    );
});

// --- SERVER LOGS ---
client.on('inviteCreate', async (invite) => {
    await dispatchLog(
        invite.guild, 'server', '🎟️ Access Link Generated',
        `**Creator:** <@${invite.inviter?.id}>\n**Code:** \`${invite.code}\`\n**Channel Routing:** <#${invite.channel?.id}>\n**Lifespan:** Max Uses: \`${invite.maxUses}\` / Expires: <t:${Math.floor(invite.expiresTimestamp / 1000)}:R>`,
        1752220
    );
});

// --- VOICE LOGS ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = oldState.guild;
    const user = newState.member?.user;
    if (!user || user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        await dispatchLog(guild, 'voice', '🔊 Voice Grid Connection established', `**User:** <@${user.id}>\n**Joined Channel:** <#${newState.channelId}>`, 5793266);
    } else if (oldState.channelId && !newState.channelId) {
        await dispatchLog(guild, 'voice', '🔇 Voice Grid Connection Severed', `**User:** <@${user.id}>\n**Left Channel:** <#${oldState.channelId}>`, 15548997);
    } else if (oldState.channelId !== newState.channelId) {
        await dispatchLog(guild, 'voice', '🎚️ Voice Cluster Channel Swapped', `**User:** <@${user.id}>\n**From:** <#${oldState.channelId}>\n**To:** <#${newState.channelId}>`, 3447003);
    }
});

// --- CHANNEL LOGS ---
client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    await dispatchLog(channel.guild, 'channel', '🧱 Node Matrix Layer Spawned', `**Channel Created:** <#${channel.id}> (\`${channel.id}\`)\n**Type:** \`${channel.type}\``, 5793266);
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    await dispatchLog(channel.guild, 'channel', '💥 Node Matrix Layer Purged', `**Name:** \`${channel.name}\`\n**ID Context:** \`${channel.id}\`\n**Type:** \`${channel.type}\``, 15548997);
});

// --- ROLE LOGS ---
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const guild = oldMember.guild;
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    if (addedRoles.size > 0) {
        for (const [id, role] of addedRoles) {
            await dispatchLog(guild, 'role', '🛡️ Verification Signature Appended', `**Target User:** <@${newMember.id}>\n**Role Assigned:** <@&${role.id}> (\`${role.id}\`)`, 1752220);
        }
    }
    if (removedRoles.size > 0) {
        for (const [id, role] of removedRoles) {
            await dispatchLog(guild, 'role', '🪓 Verification Signature Revoked', `**Target User:** <@${newMember.id}>\n**Role Removed:** <@&${role.id}> (\`${role.id}\`)`, 15548997);
        }
    }
});

// --- MODERATION LOGS ---
client.on('guildBanAdd', async (ban) => {
    await dispatchLog(
        ban.guild, 'mod', '⛔ Network Ban Protocol Enforced',
        `**Banned Target Account:** <@${ban.user.id}> (\`${ban.user.id}\`)\n**Tag Identity:** \`${ban.user.tag}\`\n\n**Reason Stated:**\n> *${ban.reason || 'No explicit tracking reason specified.'}*`,
        15548997
    );
});

client.on('guildBanRemove', async (ban) => {
    await dispatchLog(
        ban.guild, 'mod', '🔓 Network Ban Protocol Rescinded',
        `**Target Account:** <@${ban.user.id}> (\`${ban.user.id}\`)\n**Tag Identity:** \`${ban.user.tag}\``,
        5793266
    );
});

client.login(process.env.DISCORD_TOKEN);

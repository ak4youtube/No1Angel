const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ChannelType, 
    TextInputStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    ActionRowBuilder,
    Routes,
    ActivityType
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

// CRITICAL SAFETY SHIELD: Prevents runtime exceptions from bringing down the Railway instance
process.on('unhandledRejection', (reason) => console.error('🛡️ Intercepted Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('🛡️ Intercepted Uncaught Exception:', err));

const CONFIG_PATH = './config.json';

const getConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({ logsCategory: null, channels: {}, afk: {} }, null, 2));
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { logsCategory: null, channels: {}, afk: {} };
    }
};

const saveConfig = (config) => {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('💥 Failed to write system configurations:', err);
    }
};

/* ==========================================================
   ⚙️ RAW REST ENDPOINT ENGINE (Bypasses Client Validation)
   ========================================================== */
const sendRawChannelV2 = async (channelId, title, content, color = 5793266) => {
    try {
        await client.rest.post(Routes.channelMessages(channelId), {
            body: {
                flags: 32768, // Informs Gateway to compile Components V2 parameters
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
            }
        });
    } catch (err) {
        console.error(`❌ REST Channel Transport Error [${channelId}]:`, err.message);
    }
};

const sendRawInteractionReplyV2 = async (interaction, title, content, color = 5793266, isEphemeral = true) => {
    try {
        await client.rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
            body: {
                type: 4, // ChannelMessageWithSource
                data: {
                    flags: isEphemeral ? (32768 | 64) : 32768, 
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
                }
            }
        });
    } catch (err) {
        console.error('❌ REST Interaction Reply Error:', err.message);
    }
};

const dispatchLog = async (guild, logType, title, content, color) => {
    const config = getConfig();
    const channelId = config.channels?.[logType];
    if (!channelId) return;
    await sendRawChannelV2(channelId, title, content, color);
};

/* ==========================================================
   📡 LIFECYCLE DEPLOYMENT MATRIX
   ========================================================== */
client.once('ready', async () => {
    console.log(`🚀 Network Matrix Synchronized // Authenticated as ${client.user.tag}`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('autologs')
            .setDescription('Automatically provisions and links the No1Angel Logs infrastructure system.')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        
        new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Switches your target presence state to away.')
            .addStringOption(opt => opt.setName('status').setDescription('Custom message parameters left for viewers.').setRequired(false)),

        new SlashCommandBuilder()
            .setName('status')
            .setDescription('Forces bot identity profile updates. (STRICT OWNER ONLY)')
            .addStringOption(opt => opt.setName('text').setDescription('Presence text context.').setRequired(true))
            .addStringOption(opt => opt.setName('visibility').setDescription('Presence display mode.').setRequired(true)
                .addChoices(
                    { name: 'Online', value: 'online' },
                    { name: 'Idle', value: 'idle' },
                    { name: 'Do Not Disturb', value: 'dnd' },
                    { name: 'Invisible', value: 'invisible' }
                ))
    ];

    try {
        await client.application.commands.set(commands);
        console.log('📦 Core Command Architecture Propagated Successfully.');
    } catch (err) {
        console.error('💥 Command sync failure:', err);
    }
});

/* ==========================================================
   📥 COMMAND PROCESSORS
   ========================================================== */
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const config = getConfig();

    if (interaction.commandName === 'status') {
        if (interaction.user.id !== process.env.OWNER_ID) {
            return await sendRawInteractionReplyV2(interaction, '🛑 Security Alert', 'Access Denied. Your profile parameters do not match the required administrative `OWNER_ID` signature.', 15548997, true);
        }

        const text = interaction.options.getString('text');
        const visibility = interaction.options.getString('visibility');

        client.user.setPresence({
            status: visibility,
            activities: [{ name: text, type: ActivityType.Custom }]
        });

        return await sendRawInteractionReplyV2(interaction, '👁️ Presence Reconfigured', `The core matrix identity state has updated:\n* **Context:** \`${text}\`\n* **Mode:** \`${visibility.toUpperCase()}\``, 5793266, true);
    }

    if (interaction.commandName === 'autologs') {
        try {
            const category = await interaction.guild.channels.create({
                name: 'No1Angel Logs',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
                ]
            });

            const targetStreams = [
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

            for (const stream of targetStreams) {
                const createdChan = await interaction.guild.channels.create({
                    name: stream.name,
                    type: ChannelType.GuildText,
                    parent: category.id
                });
                config.channels[stream.key] = createdChan.id;
            }

            saveConfig(config);
            return await sendRawInteractionReplyV2(interaction, '✅ Core Matrix Formed', 'The `No1Angel Logs` structural infrastructure layer has mapped into your server context successfully.', 5793266, true);
        } catch (err) {
            return await sendRawInteractionReplyV2(interaction, '❌ Construction Terminated', `An internal execution block faulted during channel instantiation:\n\`\`\`${err.message}\`\`\``, 15548997, true);
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
        return await sendRawInteractionReplyV2(interaction, '💤 Parameters Altered', `<@${interaction.user.id}> has established an away matrix state: *"${status}"*`, 3447003, false);
    }
});

/* ==========================================================
   🛏️ THE INTERACTIVE AFK COMPONENT PIPELINE
   ========================================================== */
client.on('interactionCreate', async (interaction) => {
    const config = getConfig();

    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        if (parts[0] !== 'afk') return;

        const subAction = parts[1];
        const targetUserId = parts[2];

        if (interaction.user.id === targetUserId) {
            return await interaction.reply({ content: 'State loop blocked: You cannot target your own infrastructure profiles.', ephemeral: true });
        }

        if (subAction === 'leave') {
            const modal = new ModalBuilder()
                .setCustomId(`afk_modal_${targetUserId}`)
                .setTitle('Transmit Core Message');

            const textInput = new TextInputBuilder()
                .setCustomId('message_content')
                .setLabel('Message Parameters')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            return await interaction.showModal(modal);
        }

        if (subAction === 'notify') {
            if (!config.afk[targetUserId]) return await interaction.reply({ content: 'Operational target is no longer away.', ephemeral: true });
            if (config.afk[targetUserId].notifications.includes(interaction.user.id)) return await interaction.reply({ content: 'Trace configurations are already synced.', ephemeral: true });

            config.afk[targetUserId].notifications.push(interaction.user.id);
            saveConfig(config);
            return await interaction.reply({ content: '🔔 Dynamic connection linked. Your inbox will receive a note upon their interface refresh.', ephemeral: true });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('afk_modal_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const messageContent = interaction.fields.getTextInputValue('message_content');

            if (!config.afk[targetUserId]) return await interaction.reply({ content: 'Target has returned before transmission could close.', ephemeral: true });

            config.afk[targetUserId].messages.push({ sender: interaction.user.id, content: messageContent });
            saveConfig(config);

            const targetUser = await client.users.fetch(targetUserId).catch(() => null);
            if (targetUser) {
                await targetUser.send({
                    components: [{
                        type: 17, accent_color: 3447003,
                        components: [
                            { type: 10, content: `### 📩 Internal Memo Intercept` },
                            { type: 14, divider: true, spacing: 1 },
                            { type: 10, content: `**Source Interface:** <@${interaction.user.id}>\n\n**Data Pack:**\n> ${messageContent}` }
                        ]
                    }]
                }).catch(() => null);
            }

            return await interaction.reply({ content: '✅ Text data packaged and shot directly into their private console.', ephemeral: true });
        }
    }
});

/* ==========================================================
   🚨 CONSOLE CHAT GATEWAY INTERCEPTORS
   ========================================================== */
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const config = getConfig();

    // 1. DISENGAGE AFK PARAMETERS ON ACTIVITY DETECTED
    if (config.afk?.[message.author.id]) {
        const data = config.afk[message.author.id];
        delete config.afk[message.author.id];
        saveConfig(config);

        await client.rest.post(Routes.channelMessages(message.channel.id), {
            body: {
                flags: 32768,
                components: [{
                    type: 17, accent_color: 5793266,
                    components: [
                        { type: 10, content: `### 👋 Terminal State Restored` },
                        { type: 14, divider: true, spacing: 1 },
                        { type: 10, content: `<@${message.author.id}> has re-established activity streams.` }
                    ]
                }]
            }
        });

        for (const userTrackId of data.notifications) {
            const trackingUser = await client.users.fetch(userTrackId).catch(() => null);
            if (trackingUser) {
                await trackingUser.send({
                    components: [{
                        type: 17, accent_color: 5793266,
                        components: [
                            { type: 10, content: `### 🔔 Real-Time Update Trace` },
                            { type: 14, divider: true, spacing: 1 },
                            { type: 10, content: `<@${message.author.id}> has returned to active status.` }
                        ]
                    }]
                }).catch(() => null);
            }
        }
    }

    // 2. DEFLECT COMPONENT INTERACTION ON ACTIVE PINGS
    if (message.mentions.users.size > 0) {
        for (const [id, user] of message.mentions.users) {
            if (config.afk?.[id]) {
                const data = config.afk[id];
                
                await client.rest.post(Routes.channelMessages(message.channel.id), {
                    body: {
                        message_reference: { message_id: message.id },
                        components: [
                            {
                                type: 17, accent_color: 3447003,
                                components: [
                                    { type: 10, content: `### 💤 User Currently Away` },
                                    { type: 14, divider: true, spacing: 1 },
                                    { type: 10, content: `<@${id}> went out-of-office <t:${data.timestamp}:R>.\n\n**Left Note:**\n> *"${data.status}"*` }
                                ]
                            },
                            {
                                type: 1,
                                components: [
                                    { type: 2, style: 2, label: 'Leave a Message', custom_id: `afk_leave_${id}`, emoji: { name: '📩' } },
                                    { type: 2, style: 2, label: 'Notify When Back', custom_id: `afk_notify_${id}`, emoji: { name: '🔔' } }
                                ]
                            }
                        ]
                    }
                }).catch(() => null);
            }
        }
    }
});

/* ==========================================================
   📡 NO1ANGEL TELEMETRY DATA PORTS
   ========================================================== */

client.on('messageDelete', async (message) => {
    if (message.author?.bot || !message.guild) return;
    await dispatchLog(
        message.guild, 'message', '🗑️ Message Erased from History',
        `**Author:** <@${message.author.id}> (\`${message.author.id}\`)\n**Channel:** <#${message.channel.id}>\n\n**Content Payload:**\n\`\`\`${message.content || '[No Plaintext Content Logged / Encrypted Layout Context]'}\`\`\``,
        15548997
    );
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (oldMsg.partial) return; // Prevent crashes on un-cached message streams
    if (oldMsg.author?.bot || !oldMsg.guild || oldMsg.content === newMsg.content) return;
    await dispatchLog(
        oldMsg.guild, 'message', '📝 Content Payload Altered',
        `**Author:** <@${oldMsg.author.id}>\n**Channel:** <#${oldMsg.channel.id}>\n\n**Original:**\n\`\`\`${oldMsg.content || '[Empty Master Value]'}\`\`\`\n**Revised:**\n\`\`\`${newMsg.content || '[Empty Delta Value]'}\`\`\``,
        3447003
    );
});

client.on('guildMemberAdd', async (member) => {
    await dispatchLog(
        member.guild, 'member', '📥 Account Entry Registered',
        `**User Profile:** <@${member.user.id}> (\`${member.user.id}\`)\n**Identity Tag:** \`${member.user.tag}\`\n**Account Epoch:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        5793266
    );
});

client.on('guildMemberRemove', async (member) => {
    await dispatchLog(
        member.guild, 'member', '📤 Account Departure Logged',
        `**User Target:** <@${member.user.id}> (\`${member.user.id}\`)\n**Handle Profile:** \`${member.user.tag}\``,
        15548997
    );
});

client.on('inviteCreate', async (invite) => {
    await dispatchLog(
        invite.guild, 'server', '🎟️ Access Link Generated',
        `**Generator Identity:** <@${invite.inviter?.id}>\n**Link Signature:** \`${invite.code}\`\n**Channel Endpoint Target:** <#${invite.channel?.id}>`,
        1752220
    );
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = oldState.guild;
    const user = newState.member?.user;
    if (!user || user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        await dispatchLog(guild, 'voice', '🔊 Voice Grid Entry Verified', `**User Module:** <@${user.id}>\n**Routed Port:** <#${newState.channelId}>`, 5793266);
    } else if (oldState.channelId && !newState.channelId) {
        await dispatchLog(guild, 'voice', '🔇 Voice Grid Disconnect Logged', `**User Module:** <@${user.id}>\n**Disconnected Port:** <#${oldState.channelId}>`, 15548997);
    } else if (oldState.channelId !== newState.channelId) {
        await dispatchLog(guild, 'voice', '🎚️ Voice Grid Channel Shift', `**User Module:** <@${user.id}>\n**Source Node:** <#${oldState.channelId}>\n**Target Node:** <#${newState.channelId}>`, 3447003);
    }
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    await dispatchLog(channel.guild, 'channel', '🧱 Node Layer Added', `**Channel Identity:** <#${channel.id}>\n**Target Configuration Type:** \`${channel.type}\``, 5793266);
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    await dispatchLog(channel.guild, 'channel', '💥 Node Layer Destroyed', `**Literal System Handle:** \`${channel.name}\`\n**Immutable Identifier ID:** \`${channel.id}\``, 15548997);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const guild = oldMember.guild;
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    for (const [id, role] of addedRoles) {
        await dispatchLog(guild, 'role', '🛡️ Role Attached', `**Target Node Account:** <@${newMember.id}>\n**Appended Signature:** <@&${role.id}>`, 1752220);
    }
    for (const [id, role] of removedRoles) {
        await dispatchLog(guild, 'role', '🪓 Role Revoked', `**Target Node Account:** <@${newMember.id}>\n**Severed Signature:** <@&${role.id}>`, 15548997);
    }
});

client.on('guildBanAdd', async (ban) => {
    await dispatchLog(
        ban.guild, 'mod', '⛔ Ban Order Realized',
        `**Purged Profile Account:** <@${ban.user.id}> (\`${ban.user.id}\`)\n**Handle Signature:** \`${ban.user.tag}\`\n\n**Reason Metrics:** *${ban.reason || 'Unspecified by administrator.'}*`,
        15548997
    );
});

client.on('guildBanRemove', async (ban) => {
    await dispatchLog(ban.guild, 'mod', '🔓 Ban Order Revoked', `**Restored User Entity:** <@${ban.user.id}> (\`${ban.user.id}\`)`, 5793266);
});

client.login(process.env.DISCORD_TOKEN);

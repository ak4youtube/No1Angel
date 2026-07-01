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
    Routes
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

const getConfig = () => JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const saveConfig = (config) => fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

// Safe REST Sender to inject Component V2 structures without throwing node exceptions
const transmitComponentV2 = async (channelId, title, content, color = 5793266) => {
    try {
        await client.rest.post(Routes.channelMessages(channelId), {
            body: {
                flags: 32768, // Crucial: Informs the gateway to handle Components V2 parameters
                components: [
                    {
                        type: 17, // Container
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
        console.error(`💥 Gateway rejection on log transport: ${err.message}`);
    }
};

// Log Dispatcher targeting the No1Angel Logs infrastructure
const dispatchLog = async (guild, logType, title, content, color) => {
    const config = getConfig();
    const channelId = config.channels?.[logType];
    if (!channelId) return;
    await transmitComponentV2(channelId, title, content, color);
};

client.once('ready', async () => {
    console.log(`📡 System Engine Ready // No1Angel Matrix Online`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('autologs')
            .setDescription('Deploys the No1Angel Logs category matrix.')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        
        new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Sets your state to out-of-office.')
            .addStringOption(opt => opt.setName('status').setDescription('Custom status log.').setRequired(false))
    ];

    await client.application.commands.set(commands);
});

/* ==========================================================
   💾 EXECUTION MATRIX
   ========================================================== */
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const config = getConfig();

    if (interaction.commandName === 'autologs') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const category = await interaction.guild.channels.create({
                name: 'No1Angel Logs',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
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

            await interaction.editReply({
                flags: 64,
                components: [{
                    type: 17, accent_color: 5793266,
                    components: [
                        { type: 10, content: '### ✅ Structural Matrix Realized' },
                        { type: 14, divider: true, spacing: 1 },
                        { type: 10, content: 'The `No1Angel Logs` category has been instantiated with all monitoring streams.' }
                    ]
                }]
            });
        } catch (err) {
            await interaction.editReply({
                flags: 64,
                components: [{
                    type: 17, accent_color: 15548997,
                    components: [
                        { type: 10, content: '### ❌ Task Interruption' },
                        { type: 14, divider: true, spacing: 1 },
                        { type: 10, content: `Error processing structure:\n\`\`\`${err.message}\`\`\`` }
                    ]
                }]
            });
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

        await interaction.reply({
            components: [{
                type: 17, accent_color: 3447003,
                components: [
                    { type: 10, content: '### 💤 Status Registered' },
                    { type: 14, divider: true, spacing: 1 },
                    { type: 10, content: `<@${interaction.user.id}> is now away: *"${status}"*` }
                ]
            }]
        });
    }
});

/* ==========================================================
   🛏️ INTERACTIVE BUTTONS & MODALS
   ========================================================== */
client.on('interactionCreate', async (interaction) => {
    const config = getConfig();

    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        const action = parts[0];
        const subAction = parts[1];
        const targetUserId = parts[2];

        if (action !== 'afk') return;
        if (interaction.user.id === targetUserId) {
            return await interaction.reply({ content: 'Interaction loop block: Cannot target yourself.', ephemeral: true });
        }

        if (subAction === 'leave') {
            const modal = new ModalBuilder()
                .setCustomId(`afk_modal_${targetUserId}`)
                .setTitle('Transmit Memo');

            const textInput = new TextInputBuilder()
                .setCustomId('message_content')
                .setLabel('Message Details')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            await interaction.showModal(modal);
        }

        if (subAction === 'notify') {
            if (!config.afk[targetUserId]) {
                return await interaction.reply({ content: 'Target account has returned.', ephemeral: true });
            }
            if (config.afk[targetUserId].notifications.includes(interaction.user.id)) {
                return await interaction.reply({ content: 'Alert configuration already exists.', ephemeral: true });
            }

            config.afk[targetUserId].notifications.push(interaction.user.id);
            saveConfig(config);
            await interaction.reply({ content: '🔔 Trace linked. You will receive an inbox note on their return.', ephemeral: true });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('afk_modal_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const messageContent = interaction.fields.getTextInputValue('message_content');

            if (!config.afk[targetUserId]) {
                return await interaction.reply({ content: 'Target has already returned.', ephemeral: true });
            }

            config.afk[targetUserId].messages.push({ sender: interaction.user.id, content: messageContent });
            saveConfig(config);

            const targetUser = await client.users.fetch(targetUserId).catch(() => null);
            if (targetUser) {
                await targetUser.send({
                    components: [{
                        type: 17, accent_color: 3447003,
                        components: [
                            { type: 10, content: `### 📩 Memo Intercept` },
                            { type: 14, divider: true, spacing: 1 },
                            { type: 10, content: `**From:** <@${interaction.user.id}>\n\n**Content:**\n> ${messageContent}` }
                        ]
                    }]
                }).catch(() => null);
            }

            await interaction.reply({ content: '✅ Memo securely piped into their direct inbox.', ephemeral: true });
        }
    }
});

/* ==========================================================
   🚨 CHAT MONITORING LOOP
   ========================================================== */
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const config = getConfig();

    // 1. CLEARS AFK
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
                        { type: 10, content: `### 👋 Matrix Synchronized // Restored` },
                        { type: 14, divider: true, spacing: 1 },
                        { type: 10, content: `<@${message.author.id}> has re-established activity updates.` }
                    ]
                }]
            }
        });

        for (const notifierId of data.notifications) {
            const user = await client.users.fetch(notifierId).catch(() => null);
            if (user) {
                await user.send({
                    components: [{
                        type: 17, accent_color: 5793266,
                        components: [
                            { type: 10, content: `### 🔔 Network Alert` },
                            { type: 14, divider: true, spacing: 1 },
                            { type: 10, content: `<@${message.author.id}> has returned to their terminal.` }
                        ]
                    }]
                }).catch(() => null);
            }
        }
    }

    // 2. DEFLECT PINGS
    if (message.mentions.users.size > 0) {
        for (const [id, user] of message.mentions.users) {
            if (config.afk?.[id]) {
                const data = config.afk[id];
                await message.reply({
                    components: [
                        {
                            type: 17, accent_color: 3447003,
                            components: [
                                { type: 10, content: `### 💤 Terminal Status: Away` },
                                { type: 14, divider: true, spacing: 1 },
                                { type: 10, content: `<@${id}> went out-of-office <t:${data.timestamp}:R>.\n\n**Status message:**\n> *"${data.status}"*` }
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
                });
            }
        }
    }
});

/* ==========================================================
   📡 TELEMETRY PORTS (NO1ANGEL MONITORING PIPELINES)
   ========================================================== */
client.on('messageDelete', async (message) => {
    if (message.author?.bot || !message.guild) return;
    await dispatchLog(
        message.guild, 'message', '🗑️ Message Erased from History',
        `**Author:** <@${message.author.id}> (\`${message.author.id}\`)\n**Channel:** <#${message.channel.id}>\n\n**Content:**\n\`\`\`${message.content || '[No plain text data]'}\`\`\``,
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

client.on('guildMemberAdd', async (member) => {
    await dispatchLog(
        member.guild, 'member', '📥 Account Entry Registered',
        `**User:** <@${member.user.id}> (\`${member.user.id}\`)\n**Tag:** \`${member.user.tag}\``,
        5793266
    );
});

client.on('guildMemberRemove', async (member) => {
    await dispatchLog(
        member.guild, 'member', '📤 Account Departure Logged',
        `**User:** <@${member.user.id}> (\`${member.user.id}\`)`,
        15548997
    );
});

client.on('inviteCreate', async (invite) => {
    await dispatchLog(
        invite.guild, 'server', '🎟️ Access Link Generated',
        `**Creator:** <@${invite.inviter?.id}>\n**Code:** \`${invite.code}\`\n**Route:** <#${invite.channel?.id}>`,
        1752220
    );
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = oldState.guild;
    const user = newState.member?.user;
    if (!user || user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        await dispatchLog(guild, 'voice', '🔊 Voice Grid Entry', `**User:** <@${user.id}>\n**Target:** <#${newState.channelId}>`, 5793266);
    } else if (oldState.channelId && !newState.channelId) {
        await dispatchLog(guild, 'voice', '🔇 Voice Grid Disconnect', `**User:** <@${user.id}>\n**Source:** <#${oldState.channelId}>`, 15548997);
    } else if (oldState.channelId !== newState.channelId) {
        await dispatchLog(guild, 'voice', '🎚️ Voice Grid Channel Shift', `**User:** <@${user.id}>\n**From:** <#${oldState.channelId}>\n**To:** <#${newState.channelId}>`, 3447003);
    }
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    await dispatchLog(channel.guild, 'channel', '🧱 Node Layer Added', `**Channel:** <#${channel.id}>\n**Type:** \`${channel.type}\``, 5793266);
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    await dispatchLog(channel.guild, 'channel', '💥 Node Layer Destroyed', `**Name:** \`${channel.name}\`\n**Type:** \`${channel.type}\``, 15548997);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const guild = oldMember.guild;
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    for (const [id, role] of addedRoles) {
        await dispatchLog(guild, 'role', '🛡️ Role Attached', `**Target:** <@${newMember.id}>\n**Role:** <@&${role.id}>`, 1752220);
    }
    for (const [id, role] of removedRoles) {
        await dispatchLog(guild, 'role', '🪓 Role Revoked', `**Target:** <@${newMember.id}>\n**Role:** <@&${role.id}>`, 15548997);
    }
});

client.on('guildBanAdd', async (ban) => {
    await dispatchLog(
        ban.guild, 'mod', '⛔ Ban Order Realized',
        `**User:** <@${ban.user.id}>\n**Identity:** \`${ban.user.tag}\`\n**Reason:** *${ban.reason || 'Not documented.'}*`,
        15548997
    );
});

client.on('guildBanRemove', async (ban) => {
    await dispatchLog(ban.guild, 'mod', '🔓 Ban Order Revoked', `**User:** <@${ban.user.id}>`, 5793266);
});

client.login(process.env.DISCORD_TOKEN);

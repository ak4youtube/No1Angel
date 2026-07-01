import { ContainerBuilder, TextDisplayBuilder } from 'discord.js';

/**
 * Sends a clean Discord Components V2 Container to an interaction without triggering API errors.
 * @param {object} interaction - The Discord.js interaction object.
 * @param {string} textContent - The markdown text contents to display inside the container.
 * @param {boolean} ephemeral - Whether the message should be hidden to everyone else.
 */
export async function sendV2Container(interaction, textContent, ephemeral = false) {
    // 1. Construct the native builders introduced in modern Discord.js
    const textComponent = new TextDisplayBuilder().setContent(textContent);
    const containerComponent = new ContainerBuilder().addTextDisplayComponents(textComponent);

    // 2. Build the exact raw data block required for V2 components
    const rawPayload = {
        flags: ephemeral ? (32768 | 32768) : 32768, // 32768 corresponds to IS_COMPONENTS_V2
        components: [containerComponent.toJSON()]
    };

    try {
        // If the interaction hasn't been acknowledged yet, reply natively
        if (!interaction.replied && !interaction.deferred) {
            return await interaction.reply(rawPayload);
        }
        // If deferred, edit the original follow-up wire
        return await interaction.editReply(rawPayload);
    } catch (err) {
        console.error("V2 Container Dispatch Exception:", err);
    }
}

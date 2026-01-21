/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { ModalRoot, ModalHeader, ModalContent, ModalFooter, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Menu, MessageActions, React, RestAPI, Toasts, UserStore } from "@webpack/common";

const semihsky = { name: "semihsky", id: 1345618300968898561n, link: "https://github.com/semihsky" };

const settings = definePluginSettings({
    delayBetweenDeletes: {
        type: OptionType.SLIDER,
        description: "Délai entre chaque suppression (ms) pour éviter les limites de taux",
        default: 500,
        markers: [100, 250, 500, 750, 1000, 1500, 2000],
    },
    requireConfirmation: {
        type: OptionType.BOOLEAN,
        description: "Demander une confirmation avant de supprimer les messages",
        default: true,
    }
});

function showConfirmationModal(title: string, content: string, onConfirm: () => void) {
    openModal((props) => (
        <ModalRoot {...props} size="md">
            <ModalHeader>
                <h1 style={{ color: '#ffffff' }}>{title}</h1>
            </ModalHeader>
            <ModalContent>
                <p style={{ color: '#ffffff' }}>{content}</p>
            </ModalContent>
            <ModalFooter>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Button onClick={() => { onConfirm(); props.onClose(); }} look="secondary">Confirmer</Button>
                    <Button onClick={props.onClose} color="danger" style={{ backgroundColor: '#ff4444', color: '#ffffff' }}>Annuler</Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    ));
}

async function fetchMyMessages(channelId: string, limit: number) {
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return [];

    const myMessages: any[] = [];
    let before: string | undefined;
    
    while (myMessages.length < limit) {
        try {
            const url = before 
                ? `/channels/${channelId}/messages?limit=100&before=${before}`
                : `/channels/${channelId}/messages?limit=100`;
            
            const response = await RestAPI.get({ url });

            if (!response.body || response.body.length === 0) break;

            const userMessages = response.body.filter((msg: any) => msg.author.id === currentUser.id);
            myMessages.push(...userMessages);

            if (myMessages.length >= limit) break;

            before = response.body[response.body.length - 1]?.id;
            
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error("[MessageDeleter] Fetch error:", error);
            break;
        }
    }

    return myMessages.slice(0, limit);
}

async function deleteMessages(channelId: string, limit: number | "all") {
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) {
        alert("Erreur : Impossible d'obtenir les informations utilisateur");
        return;
    }

    let messagesToDelete: any[] = [];

    if (limit === "all") {
        messagesToDelete = await fetchMyMessages(channelId, Infinity);
    } else {
        messagesToDelete = await fetchMyMessages(channelId, limit);
    }

    if (messagesToDelete.length === 0) {
        alert("Aucun message trouvé");
        return;
    }

    const delay = settings.store.delayBetweenDeletes;
    let deleted = 0;
    let errors = 0;

    for (const message of messagesToDelete) {
        try {
            await MessageActions.deleteMessage(channelId, message.id);
            
            deleted++;
            console.log(`[MessageDeleter] ✅ ${deleted}/${messagesToDelete.length}`);
            
            if (deleted < messagesToDelete.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (error) {
            errors++;
            console.error("[MessageDeleter] Delete error:", error);
        }
    }

    Toasts.show({
        message: `${deleted} messages supprimés${errors > 0 ? `, ${errors} erreurs` : ''}`,
        type: errors > 0 ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS
    });
}

interface MessageContextProps {
    message: { 
        id: string; 
        channel_id: string;
        author: { id: string };
    };
}

const MessageContext: NavContextMenuPatchCallback = (children, { message }: MessageContextProps) => {
    if (!message) return;

    const currentUser = UserStore.getCurrentUser();
    if (message.author.id !== currentUser?.id) return;

    const deleteIndex = children.findIndex((child: any) => 
        child?.props?.id === "delete"
    );

    const newItems = (
        <Menu.MenuItem
            label="Suppression en masse"
            key="delete-bulk-messages"
            id="delete-bulk-messages"
        >
            <Menu.MenuItem
                key="delete-10"
                id="delete-10"
                label="Supprimer 10 messages"
                action={() => {
                    if (!settings.store.requireConfirmation) {
                        deleteMessages(message.channel_id, 10);
                    } else {
                        showConfirmationModal(
                            "Supprimer 10 messages",
                            "Voulez-vous supprimer vos 10 derniers messages ?",
                            () => deleteMessages(message.channel_id, 10)
                        );
                    }
                }}
            />

            <Menu.MenuItem
                key="delete-50"
                id="delete-50"
                label="Supprimer 50 messages"
                action={() => {
                    if (!settings.store.requireConfirmation) {
                        deleteMessages(message.channel_id, 50);
                    } else {
                        showConfirmationModal(
                            "Supprimer 50 messages",
                            "Voulez-vous supprimer vos 50 derniers messages ?",
                            () => deleteMessages(message.channel_id, 50)
                        );
                    }
                }}
            />

            <Menu.MenuItem
                key="delete-100"
                id="delete-100"
                label="Supprimer 100 messages"
                action={() => {
                    if (!settings.store.requireConfirmation) {
                        deleteMessages(message.channel_id, 100);
                    } else {
                        showConfirmationModal(
                            "Supprimer 100 messages",
                            "Voulez-vous supprimer vos 100 derniers messages ?",
                            () => deleteMessages(message.channel_id, 100)
                        );
                    }
                }}
            />

            <Menu.MenuSeparator />

            <Menu.MenuItem
                key="delete-all"
                id="delete-all"
                label="⚠️ Supprimer TOUS mes messages"
                color="danger"
                action={() => {
                    if (!settings.store.requireConfirmation) {
                        deleteMessages(message.channel_id, "all");
                    } else {
                        showConfirmationModal(
                            "Supprimer TOUS les messages",
                            "⚠️ Voulez-vous supprimer TOUS vos messages dans cette conversation ? Cette action est irréversible.",
                            () => deleteMessages(message.channel_id, "all")
                        );
                    }
                }}
            />
        </Menu.MenuItem>
    );

    if (deleteIndex !== -1) {
        children.splice(deleteIndex + 1, 0, newItems);
    } else {
        children.push(newItems);
    }
};

export default definePlugin({
    name: "MessageDeleter v3",
    description: "Supprimez rapidement plusieurs ou la totalité de vos messages dans une conversation en un clique, via le menu contextuel clic droit sur un messages",
    authors: [semihsky],
    settings,

    contextMenus: {
        "message": MessageContext
    },
});

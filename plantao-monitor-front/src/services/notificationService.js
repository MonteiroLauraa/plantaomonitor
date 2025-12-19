import { getToken } from "firebase/messaging";
import { messaging } from "../firebaseConfig";
import api from "./api";

export const iniciarNotificacoes = async () => {
    try {
        const permission = await Notification.requestPermission();

        if (permission === "granted") {
            console.log("Permissão de notificação: granted");


            const registration = await navigator.serviceWorker.ready;
            if (!registration) {
                console.error("Service Worker não está pronto.");
                return;
            }

            console.log("Service Worker Ativo e Pronto:", registration.scope);

            const token = await getToken(messaging, {
                vapidKey: "BAIY3xu--COwW-9ZxSqnkBvRNbHmggWy0W9l3y0dfeChJWMrtkxkhPNGF7rJZQiD5bVln6sbijfSxNGxtidDMlw",
                serviceWorkerRegistration: registration
            });

            if (token) {
                console.log("Token gerado:", token);

                await api.post("/save-token", { token });
                console.log("Token salvo no banco com sucesso!");
            } else {
                console.log("Nenhum token de registro disponível. Peça permissão para gerar um.");
            }
        } else {
            console.log("Permissão de notificação negada.");
        }
    } catch (error) {
        console.error("Erro ao iniciar notificações:", error);
    }
};

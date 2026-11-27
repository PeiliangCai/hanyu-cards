import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useAssistantStore } from '@/stores/assistant'

export function useNativeBackButton() {
    if (!Capacitor.isNativePlatform())
        return
    const assistant = useAssistantStore()
    const router = useRouter()
    let listener: PluginListenerHandle | undefined
    let disposed = false

    onMounted(async () => {
        try {
            listener = await CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
                if (assistant.isOpen) {
                    assistant.toggle()

                    return
                }
                if (canGoBack) {
                    window.history.back()

                    return
                }
                if (router.currentRoute.value.path !== '/study') {
                    await router.replace('/study')

                    return
                }

                await CapacitorApp.minimizeApp()
            })
            if (disposed)
                await listener.remove()
        }
        catch {
            // Browser and unsupported native platforms retain their default navigation.
        }
    })

    onBeforeUnmount(() => {
        disposed = true
        void listener?.remove()
    })
}

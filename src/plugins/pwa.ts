import { Capacitor } from '@capacitor/core'

export const setupPWA = async () => {
    if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator) || import.meta.env.MODE === 'test')
        return

    const { registerSW } = await import('virtual:pwa-register')

    registerSW({ immediate: true })
}

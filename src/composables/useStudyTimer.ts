import { onBeforeUnmount, onMounted } from 'vue'
import { useProgressStore } from '@/stores/progress'

const ACTIVE_WINDOW_MS = 2 * 60 * 1000
const FLUSH_INTERVAL_MS = 60 * 1000

export function useStudyTimer() {
    const progress = useProgressStore()
    let intervalId: number | undefined
    let lastTick = Date.now()
    let lastActivity = Date.now()
    let pendingMilliseconds = 0
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll']

    const markActive = () => {
        lastActivity = Date.now()
    }

    const flush = () => {
        const seconds = Math.floor(pendingMilliseconds / 1000)
        if (seconds <= 0)
            return

        pendingMilliseconds -= seconds * 1000
        void progress.addStudySeconds(seconds)
    }

    const tick = () => {
        const now = Date.now()
        const elapsed = Math.max(0, Math.min(now - lastTick, 15_000))
        lastTick = now
        if (document.visibilityState === 'visible' && now - lastActivity <= ACTIVE_WINDOW_MS)
            pendingMilliseconds += elapsed
        if (pendingMilliseconds >= FLUSH_INTERVAL_MS)
            flush()
    }

    onMounted(() => {
        if (import.meta.env.MODE === 'test')
            return

        events.forEach((event) => window.addEventListener(event, markActive, { passive: true }))
        document.addEventListener('visibilitychange', tick)
        intervalId = window.setInterval(tick, 15_000)
        window.addEventListener('beforeunload', flush)

    })

    onBeforeUnmount(() => {
        if (import.meta.env.MODE === 'test')
            return
        if (intervalId)
            window.clearInterval(intervalId)
        events.forEach((event) => window.removeEventListener(event, markActive))
        document.removeEventListener('visibilitychange', tick)
        window.removeEventListener('beforeunload', flush)
        tick()
        flush()
    })
}

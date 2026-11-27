import {
    onBeforeUnmount,
    onMounted,
    ref,
} from 'vue'

export function useReviewClock() {
    const now = ref(new Date())
    let timer: ReturnType<typeof window.setInterval> | undefined

    onMounted(() => {
        timer = window.setInterval(() => {
            now.value = new Date()
        }, 30_000)
    })

    onBeforeUnmount(() => {
        if (timer)
            window.clearInterval(timer)
    })

    return now
}

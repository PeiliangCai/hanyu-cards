<script setup lang="ts">
import {
    computed,
    onMounted,
    onUnmounted,
} from 'vue'
import {
    BarChartOutline,
    BookOutline,
    CompassOutline,
    FlameOutline,
    LibraryOutline,
    OptionsOutline,
    SchoolOutline,
} from '@vicons/ionicons5'
import AIAssistant from '@/components/AIAssistant.vue'
import { useNativeBackButton } from '@/composables/useNativeBackButton'
import { useStudyTimer } from '@/composables/useStudyTimer'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { todayKey } from '@/utils/learning'

const progress = useProgressStore()
const settings = useSettingsStore()
function syncSettings(event: StorageEvent) {
    if (event.key === null || event.key === 'hanyu-settings-v1')
        settings.syncFromStorage()
}
onMounted(() => window.addEventListener('storage', syncSettings))
onUnmounted(() => window.removeEventListener('storage', syncSettings))
useNativeBackButton()
useStudyTimer()

const navItems = [
    { to: '/study', label: 'Today', icon: SchoolOutline },
    { to: '/scenarios', label: 'Missions', icon: CompassOutline },
    { to: '/practice', label: 'Practice', icon: BookOutline },
    { to: '/dictionary', label: 'Words', icon: LibraryOutline },
    { to: '/progress', label: 'Progress', icon: BarChartOutline },
]

const todayPercent = computed(() => {
    return progress.todayPlanGoal
        ? Math.min(100, Math.round((progress.todayPlanCompletedCount / progress.todayPlanGoal) * 100))
        : 100
})
const currentStreak = computed(() => {
    let streak = 0
    const cursor = new Date()

    while (progress.sessions.some((session) => session.date === todayKey(cursor) && session.reviewed > 0)) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
    }

    return streak
})
const todayLabel = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    weekday: 'long',
}).format(new Date())

onMounted(async () => {
    await progress.hydrate()
})
</script>

<template>
    <div class="app-shell">
        <a
            class="skip-link"
            href="#main-content">Skip to learning content</a>
        <div
            class="app-atmosphere"
            aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
        </div>

        <header class="topbar">
            <RouterLink
                to="/study"
                class="brand"
                aria-label="HanYu Cards home">
                <span
                    class="brand__mark"
                    aria-hidden="true">汉</span>
                <span class="brand__copy">
                    <strong>HanYu</strong>
                    <small>Mandarin, made memorable</small>
                </span>
            </RouterLink>

            <p class="topbar__date">{{ todayLabel }}</p>

            <div class="topbar__actions">
                <div
                    class="topbar__streak"
                    aria-label="Current learning streak">
                    <FlameOutline></FlameOutline>
                    <span>
                        <strong>{{ currentStreak }}</strong>
                        <small>day streak</small>
                    </span>
                </div>
                <RouterLink
                    to="/settings"
                    class="topbar__meter"
                    title="Open settings to choose your daily goal. An unstarted route updates immediately; a route already in progress stays fixed."
                    :aria-label="`Daily route: ${progress.todayPlanCompletedCount} of ${progress.todayPlanGoal} assigned cards completed${progress.todayExtraWordCount ? `, plus ${progress.todayExtraWordCount} extra words` : ''}. Open daily goal settings.`">
                    <span>
                        <strong>{{ progress.todayPlanCompletedCount }}/{{ progress.todayPlanGoal }}</strong>
                        <small>today’s cards<em v-if="progress.todayExtraWordCount">+{{ progress.todayExtraWordCount }} extra</em></small>
                    </span>
                    <div><i :style="{ width: `${todayPercent}%` }"></i></div>
                </RouterLink>
                <RouterLink
                    to="/settings"
                    class="topbar__settings"
                    aria-label="Learning settings"
                    title="Learning settings">
                    <OptionsOutline></OptionsOutline>
                </RouterLink>
            </div>
        </header>

        <div
            v-if="progress.storageError"
            class="backup-notice backup-notice--error"
            role="alert">
            <p>{{ progress.storageError }}</p>
            <RouterLink to="/settings">Open backup and recovery settings</RouterLink>
        </div>

        <main
            id="main-content"
            class="app-main"
            tabindex="-1">
            <router-view v-if="progress.hydrated"></router-view>
            <p
                v-else
                role="status">Loading your saved progress…</p>
        </main>

        <nav
            class="bottom-nav"
            aria-label="Primary">
            <RouterLink
                v-for="item in navItems"
                :key="item.to"
                :to="item.to"
                class="bottom-nav__item">
                <span class="bottom-nav__icon">
                    <component :is="item.icon"></component>
                </span>
                <span>{{ item.label }}</span>
            </RouterLink>
        </nav>

        <AIAssistant></AIAssistant>
    </div>
</template>

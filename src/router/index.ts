import {
    createMemoryHistory,
    createRouter,
    createWebHistory,
} from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import type { App } from 'vue'

export const routes: RouteRecordRaw[] = [
    {
        path: '/',
        component: () => import('@/pages/ShellLayout.vue'),
        children: [
            {
                path: '',
                redirect: '/study',
            },
            {
                name: 'study',
                path: 'study',
                component: () => import('@/pages/StudyPage.vue'),
            },
            {
                name: 'practice',
                path: 'practice',
                component: () => import('@/pages/PracticePage.vue'),
            },
            {
                name: 'mistakes',
                path: 'mistakes',
                component: () => import('@/pages/MistakesPage.vue'),
            },
            {
                name: 'scenarios',
                path: 'scenarios',
                component: () => import('@/pages/ScenariosPage.vue'),
            },
            {
                name: 'dictionary',
                path: 'dictionary',
                component: () => import('@/pages/DictionaryPage.vue'),
            },
            {
                name: 'progress',
                path: 'progress',
                component: () => import('@/pages/ProgressPage.vue'),
            },
            {
                name: 'settings',
                path: 'settings',
                component: () => import('@/pages/SettingsPage.vue'),
            },
        ],
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/study',
    },
]

export const createAppRouter = (test = false) => {
    return createRouter({
        history: test ? createMemoryHistory() : createWebHistory(),
        routes,
    })
}

export const setupRouter = async (app: App<Element>, test = false) => {
    const router = createAppRouter(test)

    app.use(router)

    await router.isReady()

    return router
}

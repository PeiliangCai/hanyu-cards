<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
    page: number
    pageSize: number
    totalItems: number
    label?: string
}>(), {
    label: 'Results pagination',
})

const emit = defineEmits<{
    'update:page': [page: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)))
const firstItem = computed(() => props.totalItems ? (props.page - 1) * props.pageSize + 1 : 0)
const lastItem = computed(() => Math.min(props.totalItems, props.page * props.pageSize))

function goTo(page: number) {
    emit('update:page', Math.max(1, Math.min(totalPages.value, page)))
}
</script>

<template>
    <nav
        v-if="totalItems > pageSize"
        class="pagination-controls"
        :aria-label="label">
        <button
            @click="goTo(page - 1)"
            type="button"
            :disabled="page <= 1">
            Previous
        </button>
        <span aria-live="polite">
            <strong>Page {{ page }} of {{ totalPages }}</strong>
            <small>{{ firstItem }}–{{ lastItem }} of {{ totalItems }}</small>
        </span>
        <button
            @click="goTo(page + 1)"
            type="button"
            :disabled="page >= totalPages">
            Next
        </button>
    </nav>
</template>

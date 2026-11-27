// Fixed windows are deliberately local to one process. A public, multi-instance
// deployment must also enforce authenticated quotas in its gateway/shared store.
export function createRateLimiter({ limit, windowMs = 60_000, maxKeys = 10_000, now = Date.now }) {
    const buckets = new Map()
    let nextSweep = 0
    return {
        consume(key) {
            const time = now()
            if (time >= nextSweep) {
                for (const [oldKey, bucket] of buckets) {
                    if (bucket.resetAt <= time)
                        buckets.delete(oldKey)
                }
                nextSweep = time + windowMs
            }
            let bucket = buckets.get(key)
            if (bucket?.resetAt <= time) {
                buckets.delete(key)
                bucket = undefined
            }
            if (!bucket) {
                // Fail closed at capacity: evicting active keys would reset quotas.
                if (buckets.size >= maxKeys)
                    return { allowed: false, retryAfter: Math.max(1, Math.ceil((nextSweep - time) / 1000)) }
                bucket = { count: 0, resetAt: time + windowMs }
                buckets.set(key, bucket)
            }
            const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - time) / 1000))
            if (bucket.count >= limit)
                return { allowed: false, retryAfter }
            bucket.count += 1
            return { allowed: true, retryAfter }
        },
        get size() { return buckets.size },
    }
}

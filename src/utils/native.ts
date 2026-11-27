import { Capacitor } from '@capacitor/core'
import type { ReviewGrade } from '@/types/learning'

export function isNativeApp() {
    return Capacitor.isNativePlatform()
}

export function hasSecureNativeAssistantEndpoint() {
    if (!isNativeApp())
        return true

    const endpoint = import.meta.env.VITE_ASSISTANT_API_URL?.trim() ?? ''

    try {
        const url = new URL(endpoint)
        const hostname = url.hostname.toLowerCase()

        return url.protocol === 'https:' && !url.username && !url.password
            && hostname !== 'localhost' && !hostname.endsWith('.localhost')
            && !/^127\./.test(hostname) && hostname !== '[::1]'
    }
    catch { return false }
}

export async function speakNativeMandarin(text: string) {
    if (!isNativeApp())
        return false

    try {
        const { QueueStrategy, TextToSpeech } = await import('@capacitor-community/text-to-speech')
        await TextToSpeech.stop()
        await TextToSpeech.speak({
            text,
            lang: 'zh-CN',
            rate: 0.86,
            pitch: 1,
            volume: 1,
            category: 'ambient',
            queueStrategy: QueueStrategy.Flush,
        })

        return true
    }
    catch {
        return false
    }
}

export async function shareNativeTextFile(filename: string, contents: string) {
    if (!isNativeApp())
        return false

    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
    ])
    const result = await Filesystem.writeFile({
        path: `shared-backups/${filename}`,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
    })
    await Share.share({
        title: 'HanYu Cards learning backup',
        text: 'Save this private backup so you can restore your learning progress later.',
        files: [result.uri],
        dialogTitle: 'Export HanYu Cards backup',
    })

    return true
}

export async function reviewHaptic(grade: ReviewGrade) {
    if (!isNativeApp())
        return

    try {
        const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
        if (grade === 'again')
            await Haptics.notification({ type: NotificationType.Warning })
        else
            await Haptics.impact({ style: grade === 'easy' ? ImpactStyle.Medium : ImpactStyle.Light })
    }
    catch {
        // Haptics are an enhancement; learning must continue on unsupported devices.
    }
}

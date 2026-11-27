import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import { Capacitor } from '@capacitor/core'
import {
    Directory,
    Encoding,
    Filesystem,
} from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { hasSecureNativeAssistantEndpoint, shareNativeTextFile } from '@/utils/native'

vi.mock(import('@capacitor/filesystem'), async (importOriginal) => {
    const original = await importOriginal()

    return {
        ...original,
        Filesystem: { ...original.Filesystem, writeFile: vi.fn() },
    }
})
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

describe('native assistant endpoint', () => {
    it.each(['', '/api', 'http://assistant.example', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://user:secret@assistant.example'])('keeps a native app offline for %s', (endpoint) => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
        vi.stubEnv('VITE_ASSISTANT_API_URL', endpoint)
        expect(hasSecureNativeAssistantEndpoint()).toBe(false)
    })

    it('allows an explicitly configured HTTPS gateway in native builds', () => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
        vi.stubEnv('VITE_ASSISTANT_API_URL', 'https://assistant.example')
        expect(hasSecureNativeAssistantEndpoint()).toBe(true)
    })

    it('preserves the same-origin gateway in the browser', () => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
        vi.stubEnv('VITE_ASSISTANT_API_URL', '')
        expect(hasSecureNativeAssistantEndpoint()).toBe(true)
    })
})

it('writes the backup to the shared cache directory before passing its URI to the share sheet', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    const filename = 'hanyu-progress-2026-11-27.json'
    const contents = '{}'
    const uri = `file:///app-cache/shared-backups/${filename}`
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri })

    expect(await shareNativeTextFile(filename, contents)).toBe(true)
    expect(Filesystem.writeFile).toHaveBeenCalledWith({
        path: `shared-backups/${filename}`,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
    })
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: [uri] }))
})

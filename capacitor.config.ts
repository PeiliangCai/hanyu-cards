import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'com.hanyucards.app',
    appName: 'HanYu Cards',
    webDir: 'dist',
    bundledWebRuntime: false,
    server: {
        androidScheme: 'https',
    },
    plugins: {
        StatusBar: {
            style: 'LIGHT',
            backgroundColor: '#f6f8f4',
            overlaysWebView: false,
        },
        SplashScreen: {
            launchAutoHide: true,
            backgroundColor: '#f6f8f4',
        },
    },
}

export default config

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@/styles/tokens.css'
import '@/styles/components.css'
import App from './App.vue'
import { i18n } from './i18n'
import { setupPwa } from './pwa'
import { router } from './router'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.use(router)
app.mount('#app')

setupPwa()

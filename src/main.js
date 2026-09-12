import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import { useSettingsStore } from './stores/settings'
import { useAuthStore } from './stores/auth'
import { registerServiceWorker } from './pwa/register'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Hydrate persisted state before the first render so the router guard sees a session.
useSettingsStore().hydrate()
useAuthStore().hydrate()

app.mount('#app')

registerServiceWorker()

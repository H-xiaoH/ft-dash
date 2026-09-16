<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import { buildUrl, normalizeBaseUrl } from '@/api/client'
import { safeRedirectPath } from '@/utils/safeRedirect'
import Icon from '@/components/Icon.vue'

const auth = useAuthStore()
const bot = useBotStore()
const settings = useSettingsStore()
const route = useRoute()
const router = useRouter()

/**
 * Optional build-time default API base (`VITE_FT_BASE`).
 *
 * A static host such as GitHub Pages has no `/api` proxy, so the deployed build
 * needs an absolute URL ready to go. It is intentionally left empty by default:
 * baking a hostname into a published bundle advertises it, and for a browser app
 * the URL is visible in the bundle regardless - so the choice belongs to whoever
 * builds it.
 */
const BUILD_BASE = import.meta.env.VITE_FT_BASE || ''

/**
 * A same-origin `/api` proxy only exists in development or behind a reverse proxy
 * you control. On a static host (GitHub Pages, S3, ...) `/api/v1` resolves to the
 * host itself and 404s, so offering it as the default there is actively misleading.
 */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']
const proxyPlausible = typeof location !== 'undefined' && LOCAL_HOSTS.includes(location.hostname)

const DEFAULT_BASE = BUILD_BASE || (proxyPlausible ? '/api/v1' : '')

const PRESETS = [
  ...(proxyPlausible
    ? [
        {
          label: '同源代理',
          value: '/api/v1',
          hint: '由同源的开发服务器或反向代理转发到机器人，无需服务端 CORS 配置。',
        },
      ]
    : []),
  ...(BUILD_BASE
    ? [
        {
          label: '直连服务器',
          value: BUILD_BASE,
          hint: '浏览器直连。需要机器人把本站来源加入 api_server.CORS_origins，否则会被拦截。',
        },
      ]
    : []),
]

const form = ref({
  baseUrl: auth.baseUrl || DEFAULT_BASE,
  username: auth.username || '',
  password: '',
  remember: auth.remember !== false,
})

const showPassword = ref(false)
const ping = ref({ state: 'idle', message: '' })

const activePreset = computed(() => PRESETS.find((p) => p.value === form.value.baseUrl)?.value)
const hint = computed(
  () => PRESETS.find((p) => p.value === form.value.baseUrl)?.hint || '',
)

/** Only shown when there is no usable default, i.e. a static host with no proxy. */
const needsFullUrl = computed(() => !proxyPlausible && !BUILD_BASE)

/**
 * Warn (but do not block) when credentials would cross the network in cleartext.
 * Plain http on a LAN is a legitimate freqtrade setup, so this is advice, not a gate.
 */
const insecureUrl = computed(() => {
  const value = String(form.value.baseUrl || '')
  if (!/^http:\/\//i.test(value)) return false
  try {
    const host = new URL(value).hostname
    return !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
  } catch {
    return false
  }
})

const canSubmit = computed(
  () =>
    Boolean(form.value.baseUrl.trim()) &&
    Boolean(form.value.username.trim()) &&
    Boolean(form.value.password) &&
    !auth.connecting,
)

function usePreset(preset) {
  form.value.baseUrl = preset.value
  ping.value = { state: 'idle', message: '' }
}

async function testConnection() {
  if (!form.value.baseUrl.trim()) {
    ping.value = { state: 'fail', message: '请先填写机器人的完整地址' }
    return
  }
  ping.value = { state: 'testing', message: '' }
  const url = buildUrl(normalizeBaseUrl(form.value.baseUrl), '/ping')
  try {
    const res = await fetch(url, { credentials: 'omit' })
    const payload = await res.json().catch(() => null)
    if (res.ok && payload?.status === 'pong') {
      ping.value = { state: 'ok', message: '连接成功，机器人在线' }
    } else if (res.status === 404 && form.value.baseUrl.trim().startsWith('/')) {
      // The classic static-hosting mistake: there is no /api proxy here.
      ping.value = {
        state: 'fail',
        message: '本站没有 /api 代理（静态托管）。请改填机器人的完整地址，例如 https://bot.example.com/api/v1',
      }
    } else {
      ping.value = { state: 'fail', message: `服务器返回 ${res.status}` }
    }
  } catch {
    ping.value = {
      state: 'fail',
      message: '请求被浏览器拦截（网络错误或 CORS 限制）',
    }
  }
}

async function submit() {
  if (!canSubmit.value) return
  try {
    await auth.connect({
      baseUrl: form.value.baseUrl,
      username: form.value.username.trim(),
      password: form.value.password,
      remember: form.value.remember,
    })
    bot.refreshAll()
    router.replace(safeRedirectPath(route.query.redirect) || { name: 'dashboard' })
  } catch {
    /* the store exposes the message through auth.error */
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="row-between" style="align-items: flex-start">
        <div class="login-logo"><Icon name="candles" :size="26" /></div>
        <button class="icon-btn" :title="settings.theme === 'dark' ? '浅色' : '深色'" @click="settings.toggleTheme()">
          <Icon :name="settings.theme === 'dark' ? 'sun' : 'moon'" :size="17" />
        </button>
      </div>

      <h1 class="login-title">Freqtrade Dashboard</h1>
      <p class="login-sub">连接你的机器人，查看持仓、盈亏与实时信号。</p>

      <form class="login-form" @submit.prevent="submit">
        <div class="field">
          <label class="field-label">服务器地址</label>
          <div class="input-group">
            <span class="input-icon"><Icon name="globe" :size="16" /></span>
            <input
              v-model="form.baseUrl"
              class="input"
              type="text"
              :placeholder="needsFullUrl ? 'https://bot.example.com/api/v1' : '/api/v1'"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <p v-if="needsFullUrl" class="tiny faint" style="line-height: 1.55">
            本站是静态托管，没有 <code class="mono">/api</code> 代理，必须填机器人的完整地址。
          </p>
          <div class="row wrap" style="gap: 6px">
            <button
              v-for="preset in PRESETS"
              :key="preset.value"
              type="button"
              class="btn btn--xs"
              :class="activePreset === preset.value ? 'btn--primary' : ''"
              @click="usePreset(preset)"
            >
              {{ preset.label }}
            </button>
            <button
              type="button"
              class="btn btn--xs"
              :disabled="ping.state === 'testing'"
              @click="testConnection"
            >
              <Icon name="wifi" :size="12" :class="ping.state === 'testing' ? 'spin' : ''" />
              测试连接
            </button>
          </div>
          <p v-if="hint" class="tiny faint" style="line-height: 1.55">{{ hint }}</p>
          <p v-if="insecureUrl" class="tiny" style="color: var(--warn); line-height: 1.55">
            ⚠ 正在使用 HTTP 明文连接，密码与令牌会以明文经过网络。建议改用 HTTPS 或 SSH 隧道。
          </p>
          <p
            v-if="ping.state === 'ok'"
            class="tiny"
            style="color: var(--profit)"
          >
            ✓ {{ ping.message }}
          </p>
          <p v-else-if="ping.state === 'fail'" class="tiny" style="color: var(--loss)">
            ✕ {{ ping.message }}
          </p>
        </div>

        <div class="field">
          <label class="field-label">用户名</label>
          <div class="input-group">
            <span class="input-icon"><Icon name="user" :size="16" /></span>
            <input
              v-model="form.username"
              class="input"
              type="text"
              autocomplete="username"
              spellcheck="false"
            />
          </div>
        </div>

        <div class="field">
          <label class="field-label">密码</label>
          <div class="input-group">
            <span class="input-icon"><Icon name="key" :size="16" /></span>
            <input
              v-model="form.password"
              class="input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              style="padding-right: 42px"
            />
            <button
              type="button"
              class="input-suffix icon-btn"
              style="width: 28px; height: 28px; right: 6px"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'eye' : 'lock'" :size="15" />
            </button>
          </div>
        </div>

        <label class="checkbox">
          <input v-model="form.remember" type="checkbox" />
          记住登录状态（凭据保存在本机浏览器）
        </label>

        <div v-if="auth.error" class="form-error">
          <Icon name="alert" :size="15" style="flex: none; margin-top: 1px" />
          <span>{{ auth.error }}</span>
        </div>

        <button class="btn btn--primary btn--block" type="submit" :disabled="!canSubmit">
          <Icon
            :name="auth.connecting ? 'refresh' : 'bolt'"
            :size="16"
            :class="auth.connecting ? 'spin' : ''"
          />
          {{ auth.connecting ? '正在连接…' : '连接机器人' }}
        </button>
      </form>

      <div class="login-foot">
        <div class="row" style="gap: 7px">
          <Icon name="shield" :size="14" style="flex: none; margin-top: 2px" />
          <span>
            凭据仅保存在本机 localStorage，不会上传到任何第三方服务器。
          </span>
        </div>
        <div class="row" style="gap: 7px; margin-top: 6px">
          <Icon name="info" :size="14" style="flex: none; margin-top: 2px" />
          <span>
            若直连地址，需要在机器人的 <code class="mono">CORS_origins</code> 中加入本站地址。
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

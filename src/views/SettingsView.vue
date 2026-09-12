<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { normalizeBaseUrl } from '@/api/client'
import { applyUpdate, installAvailable, offlineReady, promptInstall, swUpdateReady } from '@/pwa/register'
import { useAuthStore } from '@/stores/auth'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import Icon from '@/components/Icon.vue'

const auth = useAuthStore()
const bot = useBotStore()
const settings = useSettingsStore()
const ui = useUiStore()
const router = useRouter()

const serverDraft = ref(auth.baseUrl)

async function changeServer() {
  if (normalizeBaseUrl(serverDraft.value) === auth.baseUrl) {
    ui.info('服务器地址没有变化')
    return
  }
  const ok = await ui.confirm({
    title: '切换服务器',
    message: '切换后需要重新输入用户名和密码登录。',
    confirmLabel: '切换',
  })
  if (!ok) return
  auth.setBaseUrl(serverDraft.value)
  bot.reset()
  router.push({ name: 'login' })
}

async function clearLocalData() {
  const ok = await ui.confirm({
    title: '清除本机数据',
    message: '将删除保存在本机的服务器地址、账号与偏好设置，并退出登录。',
    confirmLabel: '全部清除',
    danger: true,
  })
  if (!ok) return
  auth.forgetEverything()
  bot.reset()
  localStorage.clear()
  location.reload()
}
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">设置</h2>
      <p class="page-sub">连接、外观、实时推送与本地数据</p>
    </div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="globe" :size="16" /> 连接</div>
        <span class="badge badge--profit">已登录</span>
      </div>
      <div class="card-body col" style="gap: 14px">
        <div class="row-between">
          <span class="small muted">当前服务器</span>
          <span class="mono small truncate" style="max-width: 60%">{{ auth.baseUrl }}</span>
        </div>
        <div class="row-between">
          <span class="small muted">用户名</span>
          <span class="mono small">{{ auth.username }}</span>
        </div>
        <div class="row-between">
          <span class="small muted">认证方式</span>
          <span class="badge badge--accent">{{ auth.transportLabel }}</span>
        </div>

        <div class="divider" />

        <div class="field">
          <label class="field-label">切换服务器地址</label>
          <div class="row" style="gap: 8px">
            <input v-model="serverDraft" class="input" placeholder="/api/v1" spellcheck="false" />
            <button class="btn" @click="changeServer">切换</button>
          </div>
          <p class="tiny faint">
            支持 /api/v1（同源代理）或完整地址 https://host:port/api/v1（需要服务端 CORS）。
          </p>
        </div>

        <div class="row" style="gap: 8px">
          <button class="btn btn--sm" @click="bot.refreshAll()">
            <Icon name="refresh" :size="14" />
            重新加载数据
          </button>
          <button
            class="btn btn--sm btn--danger"
            @click="
              () => {
                auth.logout()
                bot.reset()
                router.push({ name: 'login' })
              }
            "
          >
            <Icon name="logout" :size="14" />
            退出登录
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="sparkles" :size="16" /> 外观</div>
      </div>
      <div class="card-body col" style="gap: 16px">
        <div class="col" style="gap: 8px">
          <span class="field-label">主题</span>
          <div class="segmented">
            <button
              v-for="option in [
                { id: 'dark', label: '深色' },
                { id: 'light', label: '浅色' },
                { id: 'auto', label: '跟随系统' },
              ]"
              :key="option.id"
              :class="{ active: settings.theme === option.id }"
              @click="settings.theme = option.id"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="install" :size="16" /> 应用安装</div>
        <span v-if="offlineReady" class="badge badge--profit">支持离线</span>
      </div>
      <div class="card-body col" style="gap: 12px">
        <p class="small muted" style="line-height: 1.65">
          这是一个 PWA，可以安装到手机主屏或桌面，以独立窗口全屏运行。
        </p>
        <div class="row wrap" style="gap: 8px">
          <button class="btn btn--primary btn--sm" :disabled="!installAvailable" @click="promptInstall()">
            <Icon name="install" :size="14" />
            {{ installAvailable ? '安装应用' : '已安装 / 浏览器不支持' }}
          </button>
          <button v-if="swUpdateReady" class="btn btn--sm" @click="applyUpdate()">
            <Icon name="sparkles" :size="14" />
            应用更新
          </button>
        </div>
        <p class="tiny faint">
          iOS Safari：点击分享按钮 → 「添加到主屏幕」。Android Chrome：菜单 → 「安装应用」。
        </p>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title" style="color: var(--loss)">
        <Icon name="alert" :size="16" /> 危险操作
      </div>
    </div>
    <div class="card-body row-between wrap" style="gap: 12px">
      <div>
        <div class="small strong">清除本机保存的数据</div>
        <div class="tiny faint">包括服务器地址、登录凭据与所有偏好设置。</div>
      </div>
      <button class="btn btn--danger" @click="clearLocalData">
        <Icon name="trash" :size="15" />
        清除并重置
      </button>
    </div>
  </div>
</template>

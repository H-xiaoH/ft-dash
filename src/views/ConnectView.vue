<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@/i18n'
import { normalizeBaseUrl } from '@/lib/api'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()

const baseUrl = ref(settings.baseUrl)
const username = ref(settings.username)
const password = ref(settings.password)
const submitting = ref(false)

const origin = computed(() => (typeof window === 'undefined' ? '' : window.location.origin))
const errorMessage = computed(() =>
  bot.errorKey ? t(bot.errorKey.key, bot.errorKey.params ?? {}) : '',
)
const canSubmit = computed(
  () => baseUrl.value.trim().length > 0 && username.value.trim() && password.value.length > 0,
)

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  settings.updateCredentialFields({
    baseUrl: normalizeBaseUrl(baseUrl.value) || baseUrl.value.trim(),
    username: username.value,
    password: password.value,
  })
  bot.rebuildClient()
  const ok = await bot.connect()
  if (!ok) {
    // Keep what the operator typed so it can be corrected in place.
    baseUrl.value = settings.baseUrl || baseUrl.value
  }
  submitting.value = false
}
</script>

<template>
  <div class="connect">
    <div class="connect__lang">
      <div class="seg">
        <button
          v-for="code in SUPPORTED_LOCALES"
          :key="code"
          type="button"
          class="seg__item"
          :aria-pressed="settings.locale === code"
          @click="settings.locale = code"
        >
          {{ LOCALE_LABELS[code] }}
        </button>
      </div>
    </div>

    <div class="connect__card">
      <div class="connect__brand">
        <span class="connect__mark" aria-hidden="true">
          <span class="connect__mark-dot" />
        </span>
        <div>
          <h1 class="connect__title">{{ t('connect.title') }}</h1>
          <p class="connect__tagline">{{ t('app.tagline') }}</p>
        </div>
      </div>

      <p class="connect__subtitle">{{ t('connect.subtitle') }}</p>

      <form class="connect__form" @submit.prevent="submit">
        <label class="field">
          <span class="field__label">{{ t('connect.baseUrl') }}</span>
          <input
            v-model="baseUrl"
            class="input num"
            type="text"
            inputmode="url"
            autocomplete="url"
            spellcheck="false"
            :placeholder="t('connect.baseUrlPlaceholder')"
          />
          <span class="field__hint">{{ t('connect.baseUrlHint') }}</span>
        </label>

        <div class="connect__row">
          <label class="field">
            <span class="field__label">{{ t('connect.username') }}</span>
            <input v-model="username" class="input" type="text" autocomplete="username" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('connect.password') }}</span>
            <input
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
            />
          </label>
        </div>

        <label class="switch">
          <input v-model="settings.remember" type="checkbox" />
          <span class="switch__track" />
          <span class="switch__text">
            <span class="switch__title">{{ t('connect.remember') }}</span>
            <span class="switch__hint">{{ t('connect.rememberHint') }}</span>
          </span>
        </label>

        <div v-if="errorMessage" class="banner banner--bad" role="alert">
          <AppIcon name="alert" :size="18" />
          <div>
            <div class="banner__title">{{ t('connect.failed') }}</div>
            <div>{{ errorMessage }}</div>
          </div>
        </div>

        <button
          type="submit"
          class="btn btn--primary connect__submit"
          :disabled="!canSubmit || submitting"
        >
          <AppIcon name="key" />
          {{ submitting ? t('connect.connecting') : t('connect.connect') }}
        </button>
      </form>

      <div class="connect__notes">
        <details>
          <summary>{{ t('connect.corsTitle') }}</summary>
          <p class="small muted">{{ t('connect.corsBody', { origin }) }}</p>
        </details>
        <details>
          <summary>{{ t('connect.securityTitle') }}</summary>
          <p class="small muted">{{ t('connect.securityBody') }}</p>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped>
.connect {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6) var(--sp-4) calc(var(--sp-8) + env(safe-area-inset-bottom, 0px));
  position: relative;
}

.connect__lang {
  position: absolute;
  top: calc(var(--sp-4) + env(safe-area-inset-top, 0px));
  right: var(--sp-4);
}

.connect__card {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  animation: rise 320ms ease-out;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.connect__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.connect__mark {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  border: 1px solid var(--line-strong);
  background: linear-gradient(160deg, var(--ink-750), var(--ink-850));
  display: grid;
  place-items: center;
  flex: none;
}

.connect__mark-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 18%, transparent);
}

.connect__title {
  font-size: var(--fs-xl);
  font-weight: 500;
}

.connect__tagline {
  font-size: var(--fs-sm);
  color: var(--text-3);
  font-family: var(--font-data);
}

.connect__subtitle {
  color: var(--text-2);
  max-width: 60ch;
}

.connect__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  background: var(--ink-850);
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  padding: var(--sp-5);
}

.connect__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

.connect__submit {
  align-self: flex-start;
}

.connect__notes {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--text-2);
}

.connect__notes summary {
  cursor: pointer;
  color: var(--text-2);
}

.connect__notes p {
  margin-top: var(--sp-2);
  overflow-wrap: anywhere;
}

@media (max-width: 520px) {
  .connect__row {
    grid-template-columns: 1fr;
  }
}
</style>

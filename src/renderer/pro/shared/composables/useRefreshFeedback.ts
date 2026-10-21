import { useNotification } from 'naive-ui'
import { type WatchSource, watch } from 'vue'

export function useRefreshFeedback(error: WatchSource<unknown>, message: () => string) {
  const notification = useNotification()
  let lastShown = 0
  watch(error, (value) => {
    if (!value || Date.now() - lastShown < 10_000) return
    lastShown = Date.now()
    notification.warning({ title: message(), duration: 4000 })
  })
}
